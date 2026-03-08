import 'dotenv/config';
import {emitQuotas, fetchJson, normalizePercent, toQuota} from './common.js';

function parseUsageTokens(payload) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.usageTokens === 'number') {
      return payload.usageTokens;
    }

    if (typeof payload.usedTokens === 'number') {
      return payload.usedTokens;
    }
  }

  return NaN;
}

async function loadUsageTokens() {
  const directUsage = process.env.CLAUDE_USAGE_TOKENS;
  if (directUsage) {
    return Number(directUsage);
  }

  const sourceUrl = process.env.CLAUDE_USAGE_SOURCE_URL;
  if (!sourceUrl) {
    throw new Error('set CLAUDE_USAGE_TOKENS or CLAUDE_USAGE_SOURCE_URL');
  }

  const payload = await fetchJson(sourceUrl, {
    Authorization: process.env.CLAUDE_SOURCE_AUTH_BEARER ? `Bearer ${process.env.CLAUDE_SOURCE_AUTH_BEARER}` : undefined,
  });

  return parseUsageTokens(payload);
}

async function main() {
  const dailyLimit = Number(process.env.CLAUDE_DAILY_TOKEN_LIMIT || '0');
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    throw new Error('CLAUDE_DAILY_TOKEN_LIMIT is required (> 0)');
  }

  const usageTokens = await loadUsageTokens();
  const remainingPercentage = normalizePercent(usageTokens, dailyLimit);

  if (remainingPercentage === null) {
    throw new Error('failed to compute remaining percentage');
  }

  const modelName = process.env.CLAUDE_MODEL_NAME || 'Claude (Daily Token Budget)';
  const refreshTime = process.env.CLAUDE_REFRESH_TIME || '24 hours, 0 min';

  const quota = toQuota({
    id: 'claude-daily-budget',
    modelName,
    remainingPercentage,
    refreshTime,
    source: 'provider:claude',
  });

  if (!quota) {
    throw new Error('failed to normalize Claude quota');
  }

  emitQuotas([quota]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown-error';
  console.error(`[collect-claude] ${message}`);
  process.exit(1);
});
