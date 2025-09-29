import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Storage layer: use Postgres if DATABASE_URL is provided; otherwise in-memory Map
let store;
let usePg = false;
let pgClient = null;

async function initStore() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const { Client } = await import('pg');
      pgClient = new Client({ connectionString: url, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } });
      await pgClient.connect();
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS sync_data (
          sync_key TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      usePg = true;
      console.log('[store] Using Postgres');
      return;
    } catch (e) {
      console.warn('[store] Failed to init Postgres, falling back to memory:', e.message || e);
    }
  }
  store = new Map();
  console.log('[store] Using in-memory store (non-persistent)');
}

function getKey(req) {
  const h = req.get('authorization') || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return (req.get('x-sync-key') || req.query.key || '').toString().trim();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/v1/data', async (req, res) => {
  const key = getKey(req);
  if (!key) return res.status(400).json({ error: 'Missing sync key' });
  try {
    if (usePg) {
      const r = await pgClient.query('SELECT data, updated_at FROM sync_data WHERE sync_key = $1', [key]);
      if (r.rowCount === 0) return res.json({ data: null, updatedAt: null });
      const row = r.rows[0];
      return res.json({ data: row.data, updatedAt: row.updated_at });
    } else {
      const r = store.get(key);
      if (!r) return res.json({ data: null, updatedAt: null });
      return res.json(r);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/v1/data', async (req, res) => {
  const key = getKey(req);
  if (!key) return res.status(400).json({ error: 'Missing sync key' });
  const body = req.body || {};
  const payload = body.data;
  const clientVersion = body.version || req.get('x-version') || null;
  if (typeof payload === 'undefined') return res.status(400).json({ error: 'Missing data' });

  const now = new Date();
  try {
    if (usePg) {
      const existing = await pgClient.query('SELECT updated_at FROM sync_data WHERE sync_key = $1', [key]);
      if (existing.rowCount > 0) {
        const serverTs = existing.rows[0].updated_at ? new Date(existing.rows[0].updated_at).toISOString() : null;
        if (clientVersion && serverTs && clientVersion !== serverTs) {
          const latest = await pgClient.query('SELECT data, updated_at FROM sync_data WHERE sync_key = $1', [key]);
          return res.status(409).json({ error: 'Version conflict', latest: { data: latest.rows[0].data, updatedAt: latest.rows[0].updated_at } });
        }
        await pgClient.query('UPDATE sync_data SET data = $1, updated_at = NOW() WHERE sync_key = $2', [payload, key]);
      } else {
        await pgClient.query('INSERT INTO sync_data(sync_key, data, updated_at) VALUES ($1, $2, NOW())', [key, payload]);
      }
      const latest = await pgClient.query('SELECT data, updated_at FROM sync_data WHERE sync_key = $1', [key]);
      return res.json({ ok: true, updatedAt: latest.rows[0].updated_at });
    } else {
      const existing = store.get(key);
      if (existing && clientVersion && existing.updatedAt && clientVersion !== existing.updatedAt) {
        return res.status(409).json({ error: 'Version conflict', latest: existing });
      }
      const rec = { data: payload, updatedAt: now.toISOString() };
      store.set(key, rec);
      return res.json({ ok: true, updatedAt: rec.updatedAt });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

await initStore();
app.listen(PORT, () => {
  console.log(`projectcalm-api listening on :${PORT}`);
});

