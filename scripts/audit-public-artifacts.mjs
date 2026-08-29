import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

const patterns = [
  {
    label: "OpenAI API key",
    regex: /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/,
  },
  { label: "Anthropic API key", regex: /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/ },
  { label: "Supabase secret key", regex: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { label: "Supabase personal access token", regex: /sbp_[A-Za-z0-9]{20,}/ },
  { label: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { label: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/ },
  { label: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { label: "Stripe live secret", regex: /sk_live_[0-9A-Za-z]{20,}/ },
  {
    label: "PostgreSQL URL with credentials",
    regex: /postgres(?:ql)?:\/\/[^:/\s]+:[^@/\s]+@[^/\s]+/,
  },
  { label: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const jwtPattern = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g;

function gitOutput(args, options = {}) {
  try {
    return execFileSync("git", args, { encoding: "buffer", ...options });
  } catch (reason) {
    if (
      reason
      && typeof reason === "object"
      && reason.status === 0
      && Buffer.isBuffer(reason.stdout)
    ) {
      return reason.stdout;
    }
    throw reason;
  }
}

function collectFiles(target, output) {
  const entry = lstatSync(target);
  if (entry.isSymbolicLink()) return;
  if (entry.isDirectory()) {
    for (const child of readdirSync(target)) collectFiles(path.join(target, child), output);
    return;
  }
  if (entry.isFile()) output.add(path.resolve(target));
}

function trackedFiles() {
  return gitOutput(["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((file) => path.resolve(file));
}

function scanHistory(findings) {
  const reachable = new Set(
    gitOutput(["rev-list", "--objects", "--all"])
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" ", 1)[0]),
  );
  const batch = gitOutput(
    ["cat-file", "--batch-all-objects", "--batch"],
    {
      maxBuffer: 512 * 1024 * 1024,
    },
  );

  let offset = 0;
  let blobCount = 0;
  while (offset < batch.length) {
    const headerEnd = batch.indexOf(0x0a, offset);
    if (headerEnd === -1) throw new Error("Unexpected git cat-file batch response");
    const [oid, type, rawSize] = batch.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(rawSize);
    if (!Number.isFinite(size)) throw new Error(`Unexpected git object metadata for ${oid}`);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd > batch.length) throw new Error(`Truncated git blob ${oid}`);
    if (type === "blob" && reachable.has(oid) && size <= 50 * 1024 * 1024) {
      blobCount += 1;
      scanContent(
        batch.subarray(contentStart, contentEnd).toString("latin1"),
        `git-object:${oid}`,
        findings,
      );
    }
    offset = contentEnd + 1;
  }
  return blobCount;
}

function scanContent(content, file, findings) {
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) findings.push({ label: pattern.label, file });
  }

  for (const token of content.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(token[0].split(".")[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") {
        findings.push({ label: "Supabase legacy service_role JWT", file });
        break;
      }
    } catch {
      // Not a decodable JWT payload; the high-confidence patterns still apply.
    }
  }
}

const args = process.argv.slice(2);
const files = new Set();
let inspectTrackedNames = false;
let inspectGitHistory = false;
let runSelfTest = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--tracked") {
    inspectTrackedNames = true;
    for (const file of trackedFiles()) files.add(file);
    continue;
  }
  if (argument === "--path") {
    const target = args[index + 1];
    if (!target) throw new Error("--path requires a file or directory");
    collectFiles(path.resolve(target), files);
    index += 1;
    continue;
  }
  if (argument === "--git-history") {
    inspectGitHistory = true;
    continue;
  }
  if (argument === "--self-test") {
    runSelfTest = true;
    continue;
  }
  throw new Error(`Unknown argument: ${argument}`);
}

if (!files.size && !runSelfTest) throw new Error("Use --tracked or --path <target>");

const findings = [];
if (runSelfTest) {
  const selfTestFindings = [];
  scanContent(`sk-${"x".repeat(32)}`, "self-test-openai", selfTestFindings);
  const fakeHeader = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const fakePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  scanContent(`${fakeHeader}.${fakePayload}.${"x".repeat(32)}`, "self-test-supabase", selfTestFindings);
  if (
    !selfTestFindings.some((finding) => finding.label === "OpenAI API key")
    || !selfTestFindings.some((finding) => finding.label === "Supabase legacy service_role JWT")
  ) {
    throw new Error("Secret scanner self-test failed");
  }
}
if (inspectTrackedNames) {
  for (const absoluteFile of files) {
    const relative = path.relative(process.cwd(), absoluteFile).split(path.sep).join("/");
    const basename = path.basename(relative);
    const isEnvironmentFile = basename === ".env" || basename.startsWith(".env.");
    const isAllowedExample = basename === ".env.example";
    if (isEnvironmentFile && !isAllowedExample) {
      findings.push({ label: "tracked environment file", file: relative });
    }
    if (/\.(?:jks|keystore|p12|pfx|pem)$/i.test(basename)) {
      findings.push({ label: "tracked credential file", file: relative });
    }
  }
}

for (const absoluteFile of files) {
  if (!existsSync(absoluteFile)) continue;
  const content = readFileSync(absoluteFile).toString("latin1");
  scanContent(
    content,
    path.relative(process.cwd(), absoluteFile).split(path.sep).join("/"),
    findings,
  );
}

let historyBlobCount = 0;
if (inspectGitHistory) {
  historyBlobCount = scanHistory(findings);
}

if (findings.length) {
  console.error("Privileged credential material detected:");
  for (const finding of findings) console.error(`- ${finding.label}: ${finding.file}`);
  process.exit(1);
}

const historySummary = inspectGitHistory ? `, ${historyBlobCount} historical blobs` : "";
const selfTestSummary = runSelfTest ? ", self-test passed" : "";
console.log(`Public artifact audit passed (${files.size} files${historySummary}, ${patterns.length + 1} secret patterns${selfTestSummary}).`);
