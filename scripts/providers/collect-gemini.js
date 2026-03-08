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
  const directUsage = process.env.GEMINI_USAGE_TOKENS;
  if (directUsage) {
    return Number(directUsage);
  }

  const sourceUrl = process.env.GEMINI_USAGE_SOURCE_URL;
  if (!sourceUrl) {
    throw new Error('set GEMINI_USAGE_TOKENS or GEMINI_USAGE_SOURCE_URL');
  }

  const payload = await fetchJson(sourceUrl, {
    Authorization: process.env.GEMINI_SOURCE_AUTH_BEARER ? `Bearer ${process.env.GEMINI_SOURCE_AUTH_BEARER}` : undefined,
  });

  return parseUsageTokens(payload);
}

async function main() {
  const dailyLimit = Number(process.env.GEMINI_DAILY_TOKEN_LIMIT || '0');
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    throw new Error('GEMINI_DAILY_TOKEN_LIMIT is required (> 0)');
  }

  const usageTokens = await loadUsageTokens();
  const remainingPercentage = normalizePercent(usageTokens, dailyLimit);

  if (remainingPercentage === null) {
    throw new Error('failed to compute remaining percentage');
  }

  const modelName = process.env.GEMINI_MODEL_NAME || 'Gemini (Daily Token Budget)';
  const refreshTime = process.env.GEMINI_REFRESH_TIME || '24 hours, 0 min';

  const quota = toQuota({
    id: 'gemini-daily-budget',
    modelName,
    remainingPercentage,
    refreshTime,
    source: 'provider:gemini',
  });

  if (!quota) {
    throw new Error('failed to normalize Gemini quota');
  }

  emitQuotas([quota]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown-error';
  console.error(`[collect-gemini] ${message}`);
  process.exit(1);
});
