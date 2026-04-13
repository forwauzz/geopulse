#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = process.cwd();
const wranglerConfigPath = path.join(projectRoot, "wrangler.jsonc");

function stripJsonc(jsoncText) {
  // Remove comments/trailing commas while preserving string literals.
  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < jsoncText.length) {
    const ch = jsoncText[i];
    const next = jsoncText[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out.replace(/,\s*([}\]])/g, "$1");
}

function readWranglerConfig() {
  if (!fs.existsSync(wranglerConfigPath)) {
    throw new Error(`Could not find ${wranglerConfigPath}`);
  }

  const raw = fs.readFileSync(wranglerConfigPath, "utf8");
  const json = stripJsonc(raw);
  return JSON.parse(json);
}

function getRequiredQueues(config) {
  const queues = config?.queues ?? {};
  const producers = Array.isArray(queues.producers) ? queues.producers : [];
  const consumers = Array.isArray(queues.consumers) ? queues.consumers : [];

  const names = new Set();

  for (const producer of producers) {
    if (typeof producer?.queue === "string" && producer.queue.length > 0) {
      names.add(producer.queue);
    }
  }

  for (const consumer of consumers) {
    if (typeof consumer?.queue === "string" && consumer.queue.length > 0) {
      names.add(consumer.queue);
    }
    if (
      typeof consumer?.dead_letter_queue === "string" &&
      consumer.dead_letter_queue.length > 0
    ) {
      names.add(consumer.dead_letter_queue);
    }
  }

  return [...names].sort();
}

function listCloudflareQueuesWithWrangler() {
  const wranglerCli = require.resolve("wrangler/bin/wrangler.js", {
    paths: [projectRoot],
  });
  const runner = process.execPath;
  const baseArgs = [wranglerCli, "queues", "list"];

  const runWrangler = (extraArgs) =>
    spawnSync(runner, [...baseArgs, ...extraArgs], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  let result = runWrangler(["--json"]);
  const combinedErrorText = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
  if (
    result.status !== 0 &&
    (combinedErrorText.includes("unknown argument: json") ||
      combinedErrorText.includes("unknown arguments: json"))
  ) {
    result = runWrangler([]);
  }

  if (result.error) {
    throw new Error(
      `Failed to execute '${path.basename(runner)} ${baseArgs.slice(1).join(" ")}': ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const meta = [`exit_status=${result.status}`, result.signal ? `signal=${result.signal}` : ""]
      .filter(Boolean)
      .join(", ");
    const details = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(
      "Failed to list Cloudflare queues via Wrangler.\n" +
        `${meta}\n` +
        (details || "No output from wrangler. Check Wrangler auth/token and network access.")
    );
  }

  const stdout = (result.stdout || "").trim();

  try {
    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.queues)
        ? parsed.queues
        : [];

    const names = new Set();
    for (const row of rows) {
      const name = row?.queue_name ?? row?.name;
      if (typeof name === "string" && name.length > 0) {
        names.add(name);
      }
    }
    return names;
  } catch {
    const names = new Set();
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        /^name(\s|$)/i.test(trimmed) ||
        /^[\-\|\+]+$/.test(trimmed) ||
        /^[┌┬┐├┼┤└┴┘─]+$/u.test(trimmed)
      ) {
        continue;
      }
      if (trimmed.startsWith("│")) {
        const cells = trimmed
          .split("│")
          .map((cell) => cell.trim())
          .filter(Boolean);
        const name = cells[1];
        if (name && !/^name$/i.test(name)) {
          names.add(name);
        }
        continue;
      }
      const match = /^\|?\s*([a-z0-9][a-z0-9-_]*)\s*(\||\s{2,}|$)/i.exec(trimmed);
      if (match?.[1]) {
        names.add(match[1]);
      }
    }

    if (names.size === 0) {
      throw new Error("Could not parse 'wrangler queues list' output.");
    }

    return names;
  }
}

async function listCloudflareQueuesWithApi() {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare API mode requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
    );
  }

  const names = new Set();
  let page = 1;
  while (true) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/queues`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      const errors = Array.isArray(payload?.errors)
        ? payload.errors.map((error) => error.message).join("; ")
        : "Unknown Cloudflare API error";
      throw new Error(
        `Cloudflare API queue list failed (status ${response.status}): ${errors}`
      );
    }

    const result = Array.isArray(payload?.result) ? payload.result : [];
    for (const row of result) {
      const name = row?.queue_name ?? row?.name;
      if (typeof name === "string" && name.length > 0) {
        names.add(name);
      }
    }

    const info = payload?.result_info;
    if (!info?.total_pages || page >= info.total_pages) {
      break;
    }
    page += 1;
  }

  return names;
}

async function listCloudflareQueues() {
  const hasApiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN);
  const hasAccountId = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CF_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT
  );
  const preferApi = hasApiToken && hasAccountId;

  if (preferApi) {
    return listCloudflareQueuesWithApi();
  }

  return listCloudflareQueuesWithWrangler();
}

async function main() {
  const config = readWranglerConfig();
  const requiredQueues = getRequiredQueues(config);

  if (requiredQueues.length === 0) {
    console.log("[cf:queues:check] No queue bindings found in wrangler.jsonc.");
    process.exit(0);
  }

  const existingQueues = await listCloudflareQueues();
  const missing = requiredQueues.filter((name) => !existingQueues.has(name));

  if (missing.length > 0) {
    console.error("[cf:queues:check] Missing Cloudflare queues required by wrangler.jsonc:");
    for (const name of missing) {
      console.error(`- ${name}`);
    }
    console.error("\nCreate them with:");
    for (const name of missing) {
      console.error(`npx wrangler queues create ${name}`);
    }
    process.exit(1);
  }

  console.log(`[cf:queues:check] All required queues exist (${requiredQueues.length}).`);
}

main().catch((error) => {
  console.error(`[cf:queues:check] ${error.message}`);
  process.exit(1);
});
