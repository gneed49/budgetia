import { execFileSync } from "node:child_process";

const dockerHost = process.env.DOCKER_HOST;
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    env: { ...process.env, ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}) },
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const clientEnv = {
  ...process.env,
  EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
};

for (const script of ["scripts/smoke-mcp.mjs", "scripts/smoke-account-deletion.mjs"]) {
  execFileSync(process.execPath, [script], { env: clientEnv, stdio: "inherit" });
}
