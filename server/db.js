import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {ACCOUNT_SEEDS} from './accounts.js';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'quota.db');

function resolveDbPath() {
  const target = process.env.QUOTA_DB_PATH?.trim();
  return target ? path.resolve(process.cwd(), target) : DEFAULT_DB_PATH;
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), {recursive: true});

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    last_synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS quotas (
    account_id TEXT NOT NULL,
    id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    remaining_percentage REAL NOT NULL,
    refresh_time TEXT NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (account_id, id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

const upsertAccountStmt = db.prepare(`
  INSERT INTO accounts (id, name, email)
  VALUES (@id, @name, @email)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email
`);

const upsertQuotaStmt = db.prepare(`
  INSERT INTO quotas (
    account_id,
    id,
    model_name,
    remaining_percentage,
    refresh_time,
    source,
    fetched_at
  ) VALUES (
    @accountId,
    @id,
    @modelName,
    @remainingPercentage,
    @refreshTime,
    @source,
    @fetchedAt
  )
  ON CONFLICT(account_id, id) DO UPDATE SET
    model_name = excluded.model_name,
    remaining_percentage = excluded.remaining_percentage,
    refresh_time = excluded.refresh_time,
    source = excluded.source,
    fetched_at = excluded.fetched_at
`);

const setSyncedAtStmt = db.prepare(`
  UPDATE accounts
  SET last_synced_at = @lastSyncedAt
  WHERE id = @id
`);

export function seedAccounts() {
  const trx = db.transaction((accounts) => {
    for (const account of accounts) {
      upsertAccountStmt.run({
        id: account.id,
        name: account.name,
        email: account.email ?? null,
      });
    }
  });

  trx(ACCOUNT_SEEDS);
}

export function upsertQuotasForAccount(accountId, quotas, syncedAt) {
  const trx = db.transaction(() => {
    for (const quota of quotas) {
      upsertQuotaStmt.run({
        accountId,
        id: quota.id,
        modelName: quota.modelName,
        remainingPercentage: quota.remainingPercentage,
        refreshTime: quota.refreshTime,
        source: quota.source,
        fetchedAt: quota.fetchedAt,
      });
    }

    setSyncedAtStmt.run({id: accountId, lastSyncedAt: syncedAt});
  });

  trx();
}

export function listAccountsWithQuotas() {
  const accountRows = db
    .prepare('SELECT id, name, email, last_synced_at FROM accounts ORDER BY CAST(id AS INTEGER), id')
    .all();

  const quotaRows = db
    .prepare(
      `SELECT account_id, id, model_name, remaining_percentage, refresh_time, source, fetched_at
       FROM quotas
       ORDER BY model_name ASC`,
    )
    .all();

  const quotaMap = new Map();
  for (const row of quotaRows) {
    const list = quotaMap.get(row.account_id) ?? [];
    list.push({
      id: row.id,
      modelName: row.model_name,
      remainingPercentage: row.remaining_percentage,
      refreshTime: row.refresh_time,
      source: row.source,
      fetchedAt: row.fetched_at,
    });
    quotaMap.set(row.account_id, list);
  }

  return accountRows.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email ?? undefined,
    lastSyncedAt: account.last_synced_at,
    quotas: quotaMap.get(account.id) ?? [],
  }));
}

seedAccounts();
