import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const PUBLIC_IPV4_RANGE = "0.0.0.0/0";
const PUBLIC_IPV6_RANGE = "::/0";
const RECOVERABLE_BACKUP_STATES = new Set([
  "available",
  "completed",
  "ready",
  "success",
  "succeeded",
]);

function parseJsonOutput(output, commandLabel) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        // Fall through to the stable, secret-free error below.
      }
    }
    throw new Error(`${commandLabel} did not return valid JSON`);
  }
}

function runSupabaseJson(args, commandLabel) {
  try {
    const stdout = execFileSync("npx", ["supabase", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseJsonOutput(stdout, commandLabel);
  } catch (reason) {
    // Some managed sandboxes report EPERM after a successful child process.
    if (
      reason
      && typeof reason === "object"
      && reason.status === 0
      && typeof reason.stdout === "string"
    ) {
      return parseJsonOutput(reason.stdout, commandLabel);
    }
    const status = reason && typeof reason === "object" && "status" in reason
      ? reason.status
      : "unknown";
    throw new Error(`${commandLabel} failed (status ${status}); no credential or raw response was printed`);
  }
}

function isRecoverableBackup(value) {
  if (!value || typeof value !== "object") return false;
  const state = String(value.status ?? value.state ?? "").toLowerCase();
  return RECOVERABLE_BACKUP_STATES.has(state);
}

function countRecoverableBackups(value) {
  if (Array.isArray(value)) return value.filter(isRecoverableBackup).length;
  if (value && typeof value === "object") {
    if (isRecoverableBackup(value)) return 1;
    return Object.values(value).filter(isRecoverableBackup).length;
  }
  return 0;
}

export function evaluatePlatformAudit({ backups, ssl, network }) {
  const logicalBackups = countRecoverableBackups(backups?.backups);
  const physicalBackups = countRecoverableBackups(backups?.physical_backup_data);
  const pitrEnabled = backups?.pitr_enabled === true;
  const ipv4Ranges = Array.isArray(network?.config?.dbAllowedCidrs)
    ? network.config.dbAllowedCidrs
    : [];
  const ipv6Ranges = Array.isArray(network?.config?.dbAllowedCidrsV6)
    ? network.config.dbAllowedCidrsV6
    : [];

  return {
    sslEnforced: ssl?.currentConfig?.database === true,
    backupRegion: typeof backups?.region === "string" ? backups.region : null,
    walArchivingEnabled: backups?.walg_enabled === true,
    pitrEnabled,
    logicalBackupCount: logicalBackups,
    physicalBackupCount: physicalBackups,
    hasRecoverableBackup: pitrEnabled || logicalBackups > 0 || physicalBackups > 0,
    databaseNetworkPublic:
      ipv4Ranges.includes(PUBLIC_IPV4_RANGE) || ipv6Ranges.includes(PUBLIC_IPV6_RANGE),
  };
}

function runSelfTest() {
  const healthy = evaluatePlatformAudit({
    backups: {
      backups: [{ status: "COMPLETED" }],
      physical_backup_data: {},
      pitr_enabled: false,
      region: "eu-west-3",
      walg_enabled: true,
    },
    ssl: { currentConfig: { database: true } },
    network: {
      config: {
        dbAllowedCidrs: ["203.0.113.10/32"],
        dbAllowedCidrsV6: [],
      },
    },
  });
  assert.equal(healthy.sslEnforced, true);
  assert.equal(healthy.hasRecoverableBackup, true);
  assert.equal(healthy.databaseNetworkPublic, false);

  const failedBackup = evaluatePlatformAudit({
    backups: {
      backups: [{ status: "FAILED" }],
      physical_backup_data: { latest: { status: "PENDING" } },
      pitr_enabled: false,
      region: "eu-west-3",
      walg_enabled: true,
    },
    ssl: { currentConfig: { database: true } },
    network: { config: { dbAllowedCidrs: [], dbAllowedCidrsV6: [] } },
  });
  assert.equal(failedBackup.hasRecoverableBackup, false);
  assert.equal(failedBackup.logicalBackupCount, 0);
  assert.equal(failedBackup.physicalBackupCount, 0);

  const incomplete = evaluatePlatformAudit({
    backups: {
      backups: null,
      physical_backup_data: {},
      pitr_enabled: false,
      region: "eu-west-3",
      walg_enabled: true,
    },
    ssl: { currentConfig: { database: false } },
    network: {
      config: {
        dbAllowedCidrs: [PUBLIC_IPV4_RANGE],
        dbAllowedCidrsV6: [PUBLIC_IPV6_RANGE],
      },
    },
  });
  assert.deepEqual(incomplete, {
    sslEnforced: false,
    backupRegion: "eu-west-3",
    walArchivingEnabled: true,
    pitrEnabled: false,
    logicalBackupCount: 0,
    physicalBackupCount: 0,
    hasRecoverableBackup: false,
    databaseNetworkPublic: true,
  });

  console.log("Supabase platform audit self-test passed.");
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes("--self-test")) {
  if (argumentsList.length !== 1) throw new Error("--self-test cannot be combined with other options");
  runSelfTest();
} else {
  const projectRefIndex = argumentsList.indexOf("--project-ref");
  const projectRef = projectRefIndex >= 0
    ? argumentsList[projectRefIndex + 1]
    : process.env.SUPABASE_PROJECT_REF;
  const knownArguments = projectRefIndex >= 0 ? 2 : 0;

  if (argumentsList.length !== knownArguments) {
    throw new Error("Usage: node scripts/audit-supabase-platform.mjs [--project-ref <ref>] or set SUPABASE_PROJECT_REF");
  }
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("A valid 20-character SUPABASE_PROJECT_REF is required");
  }

  const commonArguments = ["--experimental", "--project-ref", projectRef, "--output", "json"];
  const result = evaluatePlatformAudit({
    backups: runSupabaseJson(
      ["backups", "list", "--project-ref", projectRef, "--output", "json"],
      "Supabase backup audit",
    ),
    ssl: runSupabaseJson(
      ["ssl-enforcement", "get", ...commonArguments],
      "Supabase SSL audit",
    ),
    network: runSupabaseJson(
      ["network-restrictions", "get", ...commonArguments],
      "Supabase network audit",
    ),
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.databaseNetworkPublic) {
    console.warn("Warning: direct database access is allowed from public IPv4 or IPv6 ranges.");
  }
  if (!result.sslEnforced) {
    console.error("Gate failed: external PostgreSQL SSL enforcement is disabled.");
    process.exitCode = 1;
  }
  if (!result.hasRecoverableBackup) {
    console.error("Gate failed: no recoverable backup or PITR capability is currently reported.");
    process.exitCode = 1;
  }
}
