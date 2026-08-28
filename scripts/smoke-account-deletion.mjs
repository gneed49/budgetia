import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(supabaseUrl, "EXPO_PUBLIC_SUPABASE_URL is required");
assert(publishableKey, "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

async function signup(label) {
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${label}-${randomUUID()}@budgetia.test`,
      password: `Budgetia-${randomUUID()}-A9!`,
    }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const session = JSON.parse(responseText);
  assert.equal(typeof session.access_token, "string");
  return session;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  assert.ok(response.ok, `${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const alice = await signup("delete-alice");
const bob = await signup("delete-bob");

const sharedSpace = await api(
  "/rest/v1/rpc/create_shared_budget",
  alice.access_token,
  { method: "POST", body: JSON.stringify({ p_name: "Budget à transmettre" }) },
);
const invitation = await api(
  "/rest/v1/rpc/invite_budget_member",
  alice.access_token,
  {
    method: "POST",
    body: JSON.stringify({ p_space_id: sharedSpace.id, p_email: bob.user.email }),
  },
);
await api("/rest/v1/rpc/accept_budget_invitation", bob.access_token, {
  method: "POST",
  body: JSON.stringify({ p_invitation_id: invitation.id }),
});

const categories = await api(
  `/rest/v1/categories?space_id=eq.${sharedSpace.id}&name=eq.Logement&select=id`,
  alice.access_token,
);
assert.equal(categories.length, 1);
const requestId = `deletion-smoke-${randomUUID()}`;
await api("/rest/v1/rpc/create_budgetia_expense", alice.access_token, {
  method: "POST",
  body: JSON.stringify({
    p_amount_cents: 3490,
    p_category_id: categories[0].id,
    p_note: "Dépense commune conservée",
    p_spent_at: new Date().toISOString().slice(0, 10),
    p_source: "mobile",
    p_request_id: requestId,
    p_space_id: sharedSpace.id,
  }),
});

const functionUrl = `${supabaseUrl}/functions/v1/delete-account`;
const unauthorized = await fetch(functionUrl, {
  method: "POST",
  headers: { apikey: publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ confirmation: "SUPPRIMER" }),
});
assert.equal(unauthorized.status, 401);

const wrongConfirmation = await fetch(functionUrl, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${alice.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmation: "NON" }),
});
assert.equal(wrongConfirmation.status, 400);

const deletion = await fetch(functionUrl, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${alice.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmation: "SUPPRIMER" }),
});
const deletionText = await deletion.text();
assert.equal(deletion.status, 200, deletionText);
const deletionResult = JSON.parse(deletionText);
assert.equal(deletionResult.deleted, true);
assert.equal(deletionResult.impact.ownedSharedSpaceCount, 1);

const membership = await api(
  `/rest/v1/budget_space_members?space_id=eq.${sharedSpace.id}&select=role`,
  bob.access_token,
);
assert.deepEqual(membership, [{ role: "owner" }]);
const retainedExpense = await api(
  `/rest/v1/expenses?space_id=eq.${sharedSpace.id}&request_id=eq.${requestId}&select=amount_cents,user_id`,
  bob.access_token,
);
assert.deepEqual(retainedExpense, [{ amount_cents: 3490, user_id: null }]);

const bobCleanup = await fetch(functionUrl, {
  method: "POST",
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${bob.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmation: "SUPPRIMER" }),
});
const bobCleanupText = await bobCleanup.text();
assert.equal(bobCleanup.status, 200, bobCleanupText);
const bobCleanupResult = JSON.parse(bobCleanupText);
assert.equal(bobCleanupResult.deleted, true);
assert.equal(bobCleanupResult.impact.ownedSharedSpaceCount, 1);

console.log("Account deletion smoke test passed and removed both smoke accounts.");
