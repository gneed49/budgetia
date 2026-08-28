import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(supabaseUrl, "EXPO_PUBLIC_SUPABASE_URL is required");
assert(publishableKey, "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

const mcpUrl = `${supabaseUrl}/functions/v1/budgetia-mcp`;
const email = `smoke-${randomUUID()}@budgetia.test`;
const password = `Budgetia-${randomUUID()}-A9!`;

const signupResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});
if (signupResponse.status !== 200) {
  throw new Error(`Signup failed (${signupResponse.status}): ${await signupResponse.text()}`);
}
const signup = await signupResponse.json();
assert.equal(typeof signup.access_token, "string", "signup did not return an access token");
const accessToken = signup.access_token;

const metadataResponse = await fetch(
  `${mcpUrl}/.well-known/oauth-protected-resource`,
);
assert.equal(metadataResponse.status, 200);
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, mcpUrl);
assert.deepEqual(metadata.scopes_supported, ["email"]);

const authorizationMetadataResponse = await fetch(
  `${metadata.authorization_servers[0]}/.well-known/oauth-authorization-server`,
);
assert.equal(authorizationMetadataResponse.status, 200);
const authorizationMetadata = await authorizationMetadataResponse.json();
assert.equal(
  authorizationMetadata.authorization_endpoint,
  `${supabaseUrl}/auth/v1/oauth/authorize`,
);
assert.equal(authorizationMetadata.token_endpoint, `${supabaseUrl}/auth/v1/oauth/token`);
assert.equal(typeof authorizationMetadata.registration_endpoint, "string");

const registrationResponse = await fetch(authorizationMetadata.registration_endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "Budgetia smoke client",
    redirect_uris: ["https://chatgpt.com/aip/callback"],
    token_endpoint_auth_method: "none",
    application_type: "web",
  }),
});
assert.equal(registrationResponse.status, 201);
const registration = await registrationResponse.json();
assert.equal(typeof registration.client_id, "string");

const unauthorized = await fetch(mcpUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
assert.equal(unauthorized.status, 401);
assert.match(unauthorized.headers.get("www-authenticate") ?? "", /resource_metadata=/);

async function legacyCall(method, params = {}) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
  });
  if (response.status !== 200) {
    throw new Error(`Legacy MCP call failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function modernCall(method, params = {}) {
  const modernParams = {
    ...params,
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "budgetia-smoke", version: "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  };
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": method,
  };
  if (method === "tools/call") headers["Mcp-Name"] = params.name;
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params: modernParams }),
  });
  if (response.status !== 200) {
    throw new Error(`Modern MCP call failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

const initialized = await legacyCall("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "budgetia-smoke", version: "1.0.0" },
});
assert.equal(initialized.result.serverInfo.name, "budgetia");

const listed = await legacyCall("tools/list");
assert.deepEqual(
  listed.result.tools.map((tool) => tool.name),
  [
    "list_budget_spaces",
    "list_categories",
    "create_category",
    "update_category",
    "delete_category",
    "add_expense",
    "list_expenses",
    "get_spending_summary",
  ],
);

const personalSpaces = await legacyCall("tools/call", {
  name: "list_budget_spaces",
  arguments: {},
});
assert.equal(personalSpaces.result.structuredContent.budget_spaces.length, 1);
assert.equal(
  personalSpaces.result.structuredContent.budget_spaces[0].kind,
  "personal",
);

const categories = await legacyCall("tools/call", {
  name: "list_categories",
  arguments: {},
});
assert.equal(categories.result.structuredContent.categories.length, 7);
assert.equal(
  categories.result.structuredContent.categories.filter((category) => category.is_fallback)
    .length,
  1,
);

const requestId = `smoke-${randomUUID()}`;
const expenseInput = {
  name: "add_expense",
  arguments: {
    amount: 8.4,
    category: "Transport",
    note: "Bus",
    date: new Date().toISOString().slice(0, 10),
    request_id: requestId,
  },
};
const firstExpense = await legacyCall("tools/call", expenseInput);
const retriedExpense = await legacyCall("tools/call", expenseInput);
assert.equal(
  firstExpense.result.structuredContent.expense.id,
  retriedExpense.result.structuredContent.expense.id,
);
assert.equal(firstExpense.result.structuredContent.expense.source, "chatgpt");

const summary = await legacyCall("tools/call", {
  name: "get_spending_summary",
  arguments: { period: "month" },
});
assert.equal(summary.result.structuredContent.summary.total, 8.4);
assert.equal(summary.result.structuredContent.remaining_budget, 1991.6);

const unclassifiedExpense = await legacyCall("tools/call", {
  name: "add_expense",
  arguments: {
    amount: 1.15,
    note: "Sans catégorie fournie",
    date: new Date().toISOString().slice(0, 10),
    request_id: `unclassified-${randomUUID()}`,
  },
});
assert.equal(unclassifiedExpense.result.structuredContent.expense.category, "Non classée");

const temporaryCategory = await legacyCall("tools/call", {
  name: "create_category",
  arguments: { name: "Temporaire MCP", color: "#3478F6" },
});
assert.equal(temporaryCategory.result.structuredContent.category.name, "Temporaire MCP");

await legacyCall("tools/call", {
  name: "add_expense",
  arguments: {
    amount: 2.25,
    category: "Temporaire MCP",
    note: "À reclasser",
    date: new Date().toISOString().slice(0, 10),
    request_id: `category-lifecycle-${randomUUID()}`,
  },
});

const updatedCategory = await legacyCall("tools/call", {
  name: "update_category",
  arguments: {
    category: "Temporaire MCP",
    name: "Temporaire renommée",
    color: "#7C5CE7",
    transfer_expenses_to: "Non classée",
  },
});
assert.equal(updatedCategory.result.structuredContent.category.name, "Temporaire renommée");
assert.equal(updatedCategory.result.structuredContent.transferred_expense_count, 1);

const deletedCategory = await legacyCall("tools/call", {
  name: "delete_category",
  arguments: {
    category: "Temporaire renommée",
    strategy: "delete_expenses",
  },
});
assert.equal(deletedCategory.result.structuredContent.affected_expense_count, 0);

const sharedBudgetResponse = await fetch(
  `${supabaseUrl}/rest/v1/rpc/create_shared_budget`,
  {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: "Budget smoke partagé" }),
  },
);
assert.equal(sharedBudgetResponse.status, 200);
const sharedBudget = await sharedBudgetResponse.json();
assert.equal(sharedBudget.kind, "shared");

const allSpaces = await legacyCall("tools/call", {
  name: "list_budget_spaces",
  arguments: {},
});
assert.equal(allSpaces.result.structuredContent.budget_spaces.length, 2);

const sharedExpense = await legacyCall("tools/call", {
  name: "add_expense",
  arguments: {
    budget_space_id: sharedBudget.id,
    amount: 21.75,
    category: "Alimentation",
    note: "Courses communes",
    date: new Date().toISOString().slice(0, 10),
    request_id: `shared-${randomUUID()}`,
  },
});
assert.equal(sharedExpense.result.structuredContent.expense.amount, 21.75);

const sharedSummary = await legacyCall("tools/call", {
  name: "get_spending_summary",
  arguments: { period: "month", budget_space_id: sharedBudget.id },
});
assert.equal(sharedSummary.result.structuredContent.summary.total, 21.75);
assert.equal(sharedSummary.result.structuredContent.remaining_budget, 1978.25);

const discovered = await modernCall("server/discover");
assert.deepEqual(discovered.result.supportedVersions, ["2026-07-28"]);
assert.equal(discovered.result.resultType, "complete");

const modernTools = await modernCall("tools/list");
assert.equal(modernTools.result.tools.length, 8);
assert.equal(modernTools.result.cacheScope, "public");

const cleanupResponse = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmation: "SUPPRIMER" }),
});
assert.equal(
  cleanupResponse.status,
  200,
  `MCP smoke cleanup failed: ${await cleanupResponse.text()}`,
);

console.log("Budgetia MCP smoke test: OAuth discovery/DCR, auth, personal/shared targeting, fallback expense, category lifecycle, legacy, modern, idempotent write and cleanup passed.");
