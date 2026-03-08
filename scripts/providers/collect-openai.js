import 'dotenv/config';
import {emitQuotas, fetchJson, normalizePercent, toQuota} from './common.js';

function parseTokenUsage(payload) {
  if (!payload || typeof payload !== 'object') {
    return 0;
  }

  const rows = Array.isArray(payload.data) ? payload.data : [];
  let total = 0;

  for (const row of rows) {
    if (typeof row.input_tokens === 'number') {
      total += row.input_tokens;
    }

    if (typeof row.output_tokens === 'number') {
      total += row.output_tokens;
    }

    if (Array.isArray(row.results)) {
      for (const child of row.results) {
        if (typeof child.input_tokens === 'number') {
          total += child.input_tokens;
        }
        if (typeof child.output_tokens === 'number') {
          total += child.output_tokens;
        }
      }
    }
  }

  return total;
}

async function loadUsageTokens() {
  const directUsage = process.env.OPENAI_USAGE_TOKENS;
  if (directUsage) {
    return Number(directUsage);
  }

  const sourceUrl = process.env.OPENAI_USAGE_SOURCE_URL;
  const key = process.env.OPENAI_API_KEY;

  if (!sourceUrl || !key) {
    throw new Error('set OPENAI_USAGE_TOKENS or OPENAI_USAGE_SOURCE_URL + OPENAI_API_KEY');
  }

  const payload = await fetchJson(sourceUrl, {
    Authorization: `Bearer ${key}`,
  });

  return parseTokenUsage(payload);
}

async function main() {
  const dailyLimit = Number(process.env.OPENAI_DAILY_TOKEN_LIMIT || '0');
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    throw new Error('OPENAI_DAILY_TOKEN_LIMIT is required (> 0)');
  }

  const usageTokens = await loadUsageTokens();
  const remainingPercentage = normalizePercent(usageTokens, dailyLimit);

  if (remainingPercentage === null) {
    throw new Error('failed to compute remaining percentage');
  }

  const modelName = process.env.OPENAI_MODEL_NAME || 'OpenAI (Daily Token Budget)';
  const refreshTime = process.env.OPENAI_REFRESH_TIME || '24 hours, 0 min';

  const quota = toQuota({
    id: 'openai-daily-budget',
    modelName,
    remainingPercentage,
    refreshTime,
    source: 'provider:openai',
  });

  if (!quota) {
    throw new Error('failed to normalize OpenAI quota');
  }

  emitQuotas([quota]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown-error';
  console.error(`[collect-openai] ${message}`);
  process.exit(1);
});
