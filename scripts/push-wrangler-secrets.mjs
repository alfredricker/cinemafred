#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};
const hasFlag = (name) => args.includes(name);

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`Usage: node scripts/push-wrangler-secrets.mjs [options]

Options:
  --file <path>      Path to env file (default: .env)
  --env <name>       Wrangler environment (adds --env <name>)
  --dry-run          Print keys without uploading
  --include-token    Also upload CLOUDFLARE_* auth vars
  -h, --help         Show this help
`);
  process.exit(0);
}

const envFile = path.resolve(process.cwd(), getArg("--file") || ".env");
const wranglerEnv = getArg("--env");
const dryRun = hasFlag("--dry-run");
const includeToken = hasFlag("--include-token");

if (!fs.existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envFile));
const skippedAuthKeys = new Set([
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_WORKER_TOKEN",
]);

const entries = Object.entries(parsed).filter(([key]) => {
  if (!includeToken && skippedAuthKeys.has(key)) return false;
  return true;
});

if (entries.length === 0) {
  console.log("No secrets found to upload.");
  process.exit(0);
}

for (const [key, value] of entries) {
  const cmdArgs = ["wrangler", "secret", "put", key];
  if (wranglerEnv) cmdArgs.push("--env", wranglerEnv);

  if (dryRun) {
    console.log(`[dry-run] npx ${cmdArgs.join(" ")}`);
    continue;
  }

  process.stdout.write(`Uploading ${key}... `);
  const result = spawnSync("npx", cmdArgs, {
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.status !== 0) {
    console.log("failed");
    process.exit(result.status ?? 1);
  }

  console.log("done");
}

console.log("All secrets uploaded.");
