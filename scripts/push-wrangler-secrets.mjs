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
  --strict           Exit non-zero if any upload fails
  -h, --help         Show this help
`);
  process.exit(0);
}

const envFile = path.resolve(process.cwd(), getArg("--file") || ".env");
const wranglerEnv = getArg("--env");
const dryRun = hasFlag("--dry-run");
const includeToken = hasFlag("--include-token");
const strict = hasFlag("--strict");

if (!fs.existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envFile));

const failedKeys = [];

for (const [key, value] of Object.entries(parsed)) {
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
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.log("failed (skipped)");
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    failedKeys.push(key);
    continue;
  }

  console.log("done");
}

if (failedKeys.length > 0) {
  console.log(`Completed with ${failedKeys.length} skipped secret(s): ${failedKeys.join(", ")}`);
  if (strict) process.exit(1);
} else {
  console.log("All secrets uploaded.");
}
