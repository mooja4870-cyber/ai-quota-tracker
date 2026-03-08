import 'dotenv/config';
import {spawn} from 'child_process';
import {ACCOUNT_SEEDS} from '../server/accounts.js';

const INGEST_BASE_URL = (process.env.INGEST_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const INGEST_TOKEN = process.env.INGEST_TOKEN?.trim();
const COLLECT_INTERVAL_MS = Number(process.env.COLLECT_INTERVAL_MS || 60000);

function parsePayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.quotas)) {
    return payload.quotas;
  }

  return [];
}

function normalizeQuotas(payload) {
  return parsePayload(payload)
    .map((item) => {
      if (!item || typeof item.modelName !== 'string') {
        return null;
      }

      const remaining = Number(item.remainingPercentage);
      if (!Number.isFinite(remaining)) {
        return null;
      }

      const quota = {
        modelName: item.modelName.trim(),
        remainingPercentage: Math.max(0, Math.min(100, remaining)),
      };

      if (typeof item.id === 'string' && item.id.trim()) {
        quota.id = item.id.trim();
      }

      if (typeof item.refreshTime === 'string' && item.refreshTime.trim()) {
        quota.refreshTime = item.refreshTime.trim();
      }

      if (typeof item.resetAt === 'string' && item.resetAt.trim()) {
        quota.resetAt = item.resetAt.trim();
      }

      return quota;
    })
    .filter(Boolean);
}

function execCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`command failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function loadPayloadFromAccount(accountId) {
  const command = process.env[`ACCOUNT_${accountId}_COLLECTOR_CMD`]?.trim();
  if (command) {
    const output = await execCommand(command);
    const payload = JSON.parse(output);
    const sourceLabel = process.env[`ACCOUNT_${accountId}_SOURCE_LABEL`]?.trim() || `cmd:account-${accountId}`;
    return {payload, source: sourceLabel};
  }

  const sourceUrl = process.env[`ACCOUNT_${accountId}_QUOTA_SOURCE_URL`]?.trim();
  if (sourceUrl) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`source http ${response.status}`);
    }

    const payload = await response.json();
    return {payload, source: `url:${new URL(sourceUrl).host}`};
  }

  return null;
}

async function pushToIngest(accountId, source, quotas) {
  const headers = {'Content-Type': 'application/json'};
  if (INGEST_TOKEN) {
    headers.Authorization = `Bearer ${INGEST_TOKEN}`;
  }

  const response = await fetch(`${INGEST_BASE_URL}/api/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      accountId,
      source,
      quotas,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ingest http ${response.status}: ${text}`);
  }

  return response.json();
}

async function collectOneAccount(account) {
  const loaded = await loadPayloadFromAccount(account.id);
  if (!loaded) {
    return {accountId: account.id, name: account.name, status: 'skipped', reason: 'no-source-config'};
  }

  const quotas = normalizeQuotas(loaded.payload);
  if (quotas.length === 0) {
    return {accountId: account.id, name: account.name, status: 'skipped', reason: 'empty-or-invalid-payload'};
  }

  const result = await pushToIngest(account.id, loaded.source, quotas);
  return {accountId: account.id, name: account.name, status: 'ok', pushed: quotas.length, result};
}

async function collectOnce() {
  const startedAt = new Date().toISOString();
  const results = [];

  for (const account of ACCOUNT_SEEDS) {
    try {
      const result = await collectOneAccount(account);
      results.push(result);
      console.log(`[collector] ${account.id}/${account.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown-error';
      results.push({accountId: account.id, name: account.name, status: 'error', error: message});
      console.error(`[collector] ${account.id}/${account.name}: error - ${message}`);
    }
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    error: results.filter((r) => r.status === 'error').length,
    results,
  };

  return summary;
}

async function main() {
  const watchMode = process.argv.includes('--watch');

  if (!watchMode) {
    const summary = await collectOnce();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`[collector] watch mode started (${COLLECT_INTERVAL_MS}ms)`);
  const run = async () => {
    try {
      await collectOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown-error';
      console.error(`[collector] cycle failed: ${message}`);
    }
  };

  await run();
  setInterval(run, COLLECT_INTERVAL_MS);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown-error';
  console.error(`[collector] fatal: ${message}`);
  process.exit(1);
});
