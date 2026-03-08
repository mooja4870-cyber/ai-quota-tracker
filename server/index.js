import 'dotenv/config';
import express from 'express';
import {ACCOUNT_SEEDS} from './accounts.js';
import {listAccountsWithQuotas, upsertQuotasForAccount} from './db.js';
import {collectAccountQuotas, normalizePushedQuotas} from './sources.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const refreshIntervalMs = Number(process.env.REFRESH_INTERVAL_MS || 60000);

app.use(express.json({limit: '1mb'}));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

async function refreshAccount(accountId) {
  const quotas = await collectAccountQuotas(accountId);
  if (quotas.length === 0) {
    return {accountId, updated: false, reason: 'no-source-or-empty'};
  }

  const syncedAt = new Date().toISOString();
  upsertQuotasForAccount(accountId, quotas, syncedAt);
  return {accountId, updated: true, count: quotas.length, syncedAt};
}

async function refreshAllAccounts() {
  const results = await Promise.allSettled(ACCOUNT_SEEDS.map((account) => refreshAccount(account.id)));

  return results.map((result, index) => {
    const accountId = ACCOUNT_SEEDS[index]?.id;
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      accountId,
      updated: false,
      reason: result.reason instanceof Error ? result.reason.message : 'unknown-error',
    };
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ok: true, now: new Date().toISOString()});
});

app.get('/api/accounts', (_req, res) => {
  res.json({
    fetchedAt: new Date().toISOString(),
    accounts: listAccountsWithQuotas(),
  });
});

app.post('/api/refresh', async (req, res) => {
  try {
    const requestedAccountId = typeof req.body?.accountId === 'string' ? req.body.accountId : null;

    if (requestedAccountId) {
      const result = await refreshAccount(requestedAccountId);
      res.json({ok: true, result});
      return;
    }

    const results = await refreshAllAccounts();
    res.json({ok: true, results, refreshedAt: new Date().toISOString()});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown-error';
    res.status(500).json({ok: false, error: message});
  }
});

app.post('/api/ingest', (req, res) => {
  const ingestToken = process.env.INGEST_TOKEN?.trim();
  if (ingestToken) {
    const incoming = req.headers.authorization?.replace('Bearer ', '').trim();
    if (incoming !== ingestToken) {
      res.status(401).json({ok: false, error: 'unauthorized'});
      return;
    }
  }

  const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : null;
  if (!accountId) {
    res.status(400).json({ok: false, error: 'accountId is required'});
    return;
  }

  const sourceHint = typeof req.body?.source === 'string' && req.body.source.trim() ? req.body.source.trim() : 'push:manual';
  const quotas = normalizePushedQuotas(req.body?.quotas ?? req.body, sourceHint);

  if (quotas.length === 0) {
    res.status(400).json({ok: false, error: 'valid quotas are required'});
    return;
  }

  const syncedAt = new Date().toISOString();
  upsertQuotasForAccount(accountId, quotas, syncedAt);
  res.json({ok: true, accountId, count: quotas.length, syncedAt});
});

app.listen(port, () => {
  console.log(`[quota-api] listening on http://127.0.0.1:${port}`);
  refreshAllAccounts().catch((error) => {
    console.error('[quota-api] initial refresh failed', error);
  });

  setInterval(() => {
    refreshAllAccounts().catch((error) => {
      console.error('[quota-api] scheduled refresh failed', error);
    });
  }, refreshIntervalMs);
});
