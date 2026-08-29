import assert from "node:assert/strict";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;
const rawWebUrl = process.env.BUDGETIA_WEB_URL;

assert(accessToken, "SUPABASE_ACCESS_TOKEN is required");
assert.match(projectRef ?? "", /^[a-z0-9]{20}$/, "SUPABASE_PROJECT_REF is invalid");
assert(rawWebUrl, "BUDGETIA_WEB_URL is required");

const webUrl = new URL(rawWebUrl);
assert.equal(webUrl.protocol, "https:", "BUDGETIA_WEB_URL must use HTTPS");
assert.equal(webUrl.username, "", "BUDGETIA_WEB_URL must not contain credentials");
assert.equal(webUrl.password, "", "BUDGETIA_WEB_URL must not contain credentials");
assert.equal(webUrl.search, "", "BUDGETIA_WEB_URL must not contain a query string");
assert.equal(webUrl.hash, "", "BUDGETIA_WEB_URL must not contain a fragment");

const siteUrl = webUrl.toString().replace(/\/+$/, "");
const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site_url: siteUrl,
      oauth_server_enabled: true,
      oauth_server_allow_dynamic_registration: true,
      oauth_server_authorization_path: "/oauth/consent",
    }),
  },
);

assert.equal(response.ok, true, `Supabase Auth configuration failed (${response.status})`);
const configuration = await response.json();
assert.equal(configuration.site_url, siteUrl);
assert.equal(configuration.oauth_server_enabled, true);
assert.equal(configuration.oauth_server_allow_dynamic_registration, true);
assert.equal(configuration.oauth_server_authorization_path, "/oauth/consent");

console.log(`Supabase OAuth configured for ${siteUrl}/oauth/consent.`);
