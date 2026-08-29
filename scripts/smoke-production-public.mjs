import assert from "node:assert/strict";

const webUrl = process.env.BUDGETIA_WEB_URL?.replace(/\/+$/, "");
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
assert.match(webUrl ?? "", /^https:\/\/[^/]+(?:\/[^/]+)*$/, "BUDGETIA_WEB_URL must be HTTPS");
assert.match(
  supabaseUrl ?? "",
  /^https:\/\/[a-z0-9]{20}\.supabase\.co$/,
  "EXPO_PUBLIC_SUPABASE_URL must be a hosted Supabase URL",
);

async function expectPage(pathname, marker) {
  const response = await fetch(`${webUrl}${pathname}`);
  assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
  const body = await response.text();
  assert.match(body, marker, `${pathname} did not contain its expected marker`);
}

await expectPage("/", /<title>Budgetia<\/title>/i);
await expectPage("/oauth/consent", /<title>Budgetia<\/title>/i);
await expectPage("/legal/privacy.html", /Politique de confidentialité/i);
await expectPage("/legal/terms.html", /Conditions d.utilisation/i);
await expectPage("/legal/support.html", /Support privé/i);

const mcpUrl = `${supabaseUrl}/functions/v1/budgetia-mcp`;
const protectedResourceResponse = await fetch(`${mcpUrl}/.well-known/oauth-protected-resource`);
assert.equal(protectedResourceResponse.status, 200);
const protectedResource = await protectedResourceResponse.json();
assert.equal(protectedResource.resource, mcpUrl);
assert.deepEqual(protectedResource.scopes_supported, ["email"]);
assert.equal(protectedResource.authorization_servers.length, 1);

const authorizationServer = new URL(protectedResource.authorization_servers[0]);
const discoveryUrl = `${authorizationServer.origin}/.well-known/oauth-authorization-server${authorizationServer.pathname.replace(/\/+$/, "")}`;
const discoveryResponse = await fetch(discoveryUrl);
assert.equal(discoveryResponse.status, 200);
const discovery = await discoveryResponse.json();
assert.equal(discovery.authorization_endpoint, `${supabaseUrl}/auth/v1/oauth/authorize`);
assert.equal(discovery.token_endpoint, `${supabaseUrl}/auth/v1/oauth/token`);
assert.equal(typeof discovery.registration_endpoint, "string");

const unauthorizedMcp = await fetch(mcpUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
assert.equal(unauthorizedMcp.status, 401);
assert.match(unauthorizedMcp.headers.get("www-authenticate") ?? "", /resource_metadata=/);

const unauthorizedCoach = await fetch(`${supabaseUrl}/functions/v1/budgetia-ai-coach`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "report.generate" }),
});
assert.equal(unauthorizedCoach.status, 401);
assert.equal((await unauthorizedCoach.json()).error.code, "AUTH_REQUIRED");

const unauthorizedDeletion = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(unauthorizedDeletion.status, 401);

console.log(
  "Production public smoke passed: web, legal, OAuth discovery, MCP challenge, Coach auth and account-deletion auth.",
);
