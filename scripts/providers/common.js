export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizePercent(used, limit) {
  const usedNum = Number(used);
  const limitNum = Number(limit);

  if (!Number.isFinite(usedNum) || !Number.isFinite(limitNum) || limitNum <= 0) {
    return null;
  }

  return clamp(Number((((limitNum - usedNum) / limitNum) * 100).toFixed(1)), 0, 100);
}

export async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {headers, signal: controller.signal});
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function toQuota({id, modelName, remainingPercentage, refreshTime, source}) {
  if (!modelName || !Number.isFinite(Number(remainingPercentage))) {
    return null;
  }

  return {
    id,
    modelName,
    remainingPercentage: clamp(Number(remainingPercentage), 0, 100),
    refreshTime: refreshTime || 'Unknown',
    source: source || 'collector',
  };
}

export function emitQuotas(quotas) {
  process.stdout.write(JSON.stringify({quotas}, null, 0));
}
