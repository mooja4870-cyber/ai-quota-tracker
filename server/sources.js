function toSlug(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `quota-${Date.now()}`;
}

function toRefreshTime(resetAt, fallback) {
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }

  if (!resetAt) {
    return 'Unknown';
  }

  const now = Date.now();
  const target = new Date(resetAt).getTime();
  if (!Number.isFinite(target) || target <= now) {
    return 'Soon';
  }

  const diffMs = target - now;
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hours, ${minutes} min`;
}

function normalizeQuota(item, source, fetchedAt) {
  if (!item || typeof item.modelName !== 'string') {
    return null;
  }

  const raw = Number(item.remainingPercentage);
  if (!Number.isFinite(raw)) {
    return null;
  }

  const remainingPercentage = Math.max(0, Math.min(100, raw));

  return {
    id: (item.id && item.id.trim()) || toSlug(item.modelName),
    modelName: item.modelName.trim(),
    remainingPercentage,
    refreshTime: toRefreshTime(item.resetAt, item.refreshTime),
    source,
    fetchedAt,
  };
}

function parsePayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.quotas)) {
    return payload.quotas;
  }

  return [];
}

function envSourceUrl(accountId) {
  return process.env[`ACCOUNT_${accountId}_QUOTA_SOURCE_URL`]?.trim();
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {signal: controller.signal});
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectAccountQuotas(accountId) {
  const sourceUrl = envSourceUrl(accountId);
  if (!sourceUrl) {
    return [];
  }

  const payload = await fetchJsonWithTimeout(sourceUrl);
  const fetchedAt = new Date().toISOString();
  const source = `pull:${new URL(sourceUrl).host}`;

  return parsePayload(payload)
    .map((item) => normalizeQuota(item, source, fetchedAt))
    .filter(Boolean);
}

export function normalizePushedQuotas(payload, sourceHint) {
  const fetchedAt = new Date().toISOString();

  return parsePayload(payload)
    .map((item) => normalizeQuota(item, sourceHint, fetchedAt))
    .filter(Boolean);
}
