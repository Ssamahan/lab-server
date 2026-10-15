/**
 * Ruli Lab Systems - Free Secure Server v1.1
 * Works on Render FREE tier WITHOUT disk (disk not supported on free)
 * Uses:
 * - If DATABASE_URL set (Neon/Supabase free Postgres) -> uses Postgres (persistent, free)
 * - Else -> uses SQLite file ./data/lab.db (ephemeral on free tier, will reset on spin-down, but works for testing)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod-32chars!';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RuliLab@2026';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ssamahan.github.io';
const ALLOWED_ORIGIN_2 = process.env.ALLOWED_ORIGIN_2 || '';
const DB_PATH = process.env.DB_PATH || './data/lab.db';
const DATABASE_URL = process.env.DATABASE_URL || '';

const dbDir = path.dirname(path.join(__dirname, DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let dbType = 'sqlite';
let pgPool = null;
let sqliteDb = null;

if (DATABASE_URL) {
  try {
    const { Pool } = await import('pg');
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at BIGINT,
        updated_by TEXT
      );
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        key TEXT,
        value TEXT,
        updated_at BIGINT,
        updated_by TEXT
      );
    `);
    dbType = 'postgres';
    console.log('✅ Using Postgres (Neon/Supabase free) - persistent even on Render free tier');
  } catch (e) {
    console.warn('Postgres init failed, falling back to SQLite:', e.message);
  }
}

if (dbType === 'sqlite') {
  const Database = (await import('better-sqlite3')).default;
  sqliteDb = new Database(path.join(__dirname, DB_PATH));
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT,
      value TEXT,
      updated_at INTEGER,
      updated_by TEXT
    );
  `);
  console.log(`⚠️ Using SQLite file ${DB_PATH} - EPHEMERAL on Render free tier. Add DATABASE_URL (Neon free Postgres) for persistence.`);
}

async function dbGet(key) {
  if (dbType === 'postgres') {
    const res = await pgPool.query('SELECT value, updated_at, updated_by FROM kv WHERE key=$1', [key]);
    return res.rows[0] || null;
  } else {
    return sqliteDb.prepare('SELECT value, updated_at, updated_by FROM kv WHERE key=?').get(key);
  }
}

async function dbSet(key, value, updated_at, updated_by) {
  if (dbType === 'postgres') {
    await pgPool.query(
      `INSERT INTO kv (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at, updated_by=EXCLUDED.updated_by`,
      [key, value, updated_at, updated_by]
    );
    await pgPool.query('INSERT INTO history (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4)', [key, value, updated_at, updated_by]);
    await pgPool.query('DELETE FROM history WHERE key=$1 AND id NOT IN (SELECT id FROM history WHERE key=$1 ORDER BY updated_at DESC LIMIT 50)', [key]);
  } else {
    sqliteDb.prepare('INSERT INTO kv (key, value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by')
      .run(key, value, updated_at, updated_by);
    sqliteDb.prepare('INSERT INTO history (key, value, updated_at, updated_by) VALUES (?,?,?,?)').run(key, value, updated_at, updated_by);
    sqliteDb.prepare('DELETE FROM history WHERE key=? AND id NOT IN (SELECT id FROM history WHERE key=? ORDER BY updated_at DESC LIMIT 50)').run(key, key);
  }
}

async function dbHistory(key) {
  if (dbType === 'postgres') {
    const res = await pgPool.query('SELECT id, updated_at, updated_by FROM history WHERE key=$1 ORDER BY updated_at DESC LIMIT 20', [key]);
    return res.rows;
  } else {
    return sqliteDb.prepare('SELECT id, updated_at, updated_by FROM history WHERE key=? ORDER BY updated_at DESC LIMIT 20').all(key);
  }
}

let adminHash = ADMIN_PASSWORD_HASH;
if (!adminHash) {
  adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '15mb' }));

const allowedOrigins = [ALLOWED_ORIGIN, ALLOWED_ORIGIN_2, 'https://ssamahan.github.io'].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin && origin.startsWith(o))) return cb(null, true);
    return cb(null, true);
  },
  credentials: true
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests' } });
app.use('/api/', limiter);

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/', (req, res) => {
  res.json({
    name: 'Ruli Lab Systems Server',
    version: '1.1.0',
    status: 'online',
    dbType,
    persistent: dbType === 'postgres' ? 'Yes' : 'No - add DATABASE_URL',
    free: true,
    secure: true,
    time: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    let count = 0;
    if (dbType === 'postgres') {
      const r = await pgPool.query('SELECT COUNT(*) as c FROM kv');
      count = r.rows[0].c;
    } else {
      count = sqliteDb.prepare('SELECT COUNT(*) as c FROM kv').get().c;
    }
    res.json({ ok: true, dbType, keys: count, persistent: dbType === 'postgres', time: Date.now() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username !== ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = adminHash ? bcrypt.compareSync(password, adminHash) : (password === ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, expiresIn: '30d' });
});

app.get('/api/data', async (req, res) => {
  const key = req.query.key || 'lab/v1';
  const row = await dbGet(key);
  if (!row) return res.json({ data: null, at: null, by: null, key });
  try {
    const parsed = JSON.parse(row.value);
    res.json({ data: parsed.data || parsed, at: row.updated_at, by: row.updated_by, key, raw: parsed });
  } catch (e) {
    res.json({ data: null, at: row.updated_at, by: row.updated_by, key });
  }
});

app.put('/api/data', authRequired, async (req, res) => {
  const key = req.query.key || 'lab/v1';
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: 'data required' });
  const now = Date.now();
  const payload = JSON.stringify({ data, at: now, by: req.user.username });
  await dbSet(key, payload, now, req.user.username);
  res.json({ ok: true, key, at: now, by: req.user.username, dbType });
});

app.get('/api/history', authRequired, async (req, res) => {
  const key = req.query.key || 'lab/v1';
  const rows = await dbHistory(key);
  res.json({ key, history: rows, dbType });
});

app.listen(PORT, () => {
  console.log(`\n✅ Ruli Lab Server v1.1 online on port ${PORT} - dbType=${dbType}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  if (dbType === 'sqlite') {
    console.log(`   ⚠️ FREE TIER NO DISK: SQLite ephemeral will reset. Add DATABASE_URL from Neon.tech for persistence.`);
  }
  console.log('');
});
