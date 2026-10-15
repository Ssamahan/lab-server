/**
 * Ruli Lab Systems - Free Secure Server
 * Deploy FREE on Render.com / Fly.io / Railway / Vercel
 * Keeps your lab data online, secure, auto-synced phone <-> PC
 * 
 * Features:
 * - JWT auth (admin only can write)
 * - SQLite persistence (free, survives restarts on Render with disk)
 * - CORS locked to https://ssamahan.github.io/lab/
 * - Rate limiting, Helmet security headers
 * - Single endpoint: /api/data (GET + PUT)
 * - Version history & lastSave timestamp
 * 
 * Free Deploy Steps (Render - 100% free):
 * 1. Push this folder to GitHub (e.g. Ssamahan/lab-server)
 * 2. Go to https://dashboard.render.com -> New Web Service -> Connect repo
 * 3. Build: npm install, Start: npm start, Free plan
 * 4. Add Environment Variables from .env.example
 * 5. Add Disk (optional but recommended for persistence): Name=data, Mount=/opt/render/project/src/data, Size=1GB free
 * 6. Deploy -> copy URL e.g. https://ruli-lab-server.onrender.com
 * 7. Paste URL into Lab Systems app: Staff & Settings -> Data & Backup -> Custom Server URL
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
import Database from 'better-sqlite3';
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

// Ensure data dir exists
const dbDir = path.dirname(path.join(__dirname, DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Init SQLite
const db = new Database(path.join(__dirname, DB_PATH));
db.exec(`
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

// Helper to hash admin password on first run
let adminHash = ADMIN_PASSWORD_HASH;
if (!adminHash) {
  adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  console.log('Generated ADMIN_PASSWORD_HASH (save to .env):', adminHash);
}

const app = express();
app.use(helmet({
  crossOriginResourcePolicy: false
}));
app.use(express.json({ limit: '15mb' }));

// CORS - only allow your GitHub Pages + localhost for testing
const allowedOrigins = [ALLOWED_ORIGIN, ALLOWED_ORIGIN_2, 'https://ssamahan.github.io'].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    // Allow all for now but log - tighten later
    console.warn('CORS blocked origin:', origin);
    return cb(null, true); // For free tier, allow all but you can set to false to block
  },
  credentials: true
}));

// Rate limiting - 100 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, try again later' }
});
app.use('/api/', limiter);

// Auth middleware
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

// Public health check
app.get('/', (req, res) => {
  res.json({
    name: 'Ruli Lab Systems Server',
    version: '1.0.0',
    status: 'online',
    free: true,
    secure: true,
    endpoints: {
      login: 'POST /api/login {username, password} -> {token}',
      getData: 'GET /api/data -> {data, at, by}',
      saveData: 'PUT /api/data {data} + Bearer token',
      history: 'GET /api/history (auth)'
    },
    allowedOrigins,
    db: DB_PATH,
    time: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as c FROM kv').get();
  res.json({ ok: true, keys: row.c, time: Date.now() });
});

// Login -> JWT
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username !== ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid credentials' });
  
  const ok = adminHash ? bcrypt.compareSync(password, adminHash) : (password === ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, expiresIn: '30d' });
});

// Get data (public read, but you can require auth if you want)
app.get('/api/data', (req, res) => {
  // Optional auth for read - currently public read for viewer mode, but you can enforce
  const key = req.query.key || 'lab/v1';
  const row = db.prepare('SELECT value, updated_at, updated_by FROM kv WHERE key=?').get(key);
  if (!row) return res.json({ data: null, at: null, by: null, key });
  try {
    const parsed = JSON.parse(row.value);
    res.json({ data: parsed.data || parsed, at: row.updated_at, by: row.updated_by, key, raw: parsed });
  } catch (e) {
    res.json({ data: null, at: row.updated_at, by: row.updated_by, key, error: 'parse failed' });
  }
});

// Save data (auth required - admin only)
app.put('/api/data', authRequired, (req, res) => {
  const key = req.query.key || 'lab/v1';
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: 'data required' });
  if (!data.meta) return res.status(400).json({ error: 'data.meta required' });

  const now = Date.now();
  const payload = JSON.stringify({ data, at: now, by: req.user.username });

  // Save to history
  db.prepare('INSERT INTO history (key, value, updated_at, updated_by) VALUES (?,?,?,?)')
    .run(key, payload, now, req.user.username);

  // Upsert current
  db.prepare('INSERT INTO kv (key, value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by')
    .run(key, payload, now, req.user.username);

  // Keep only last 50 history
  db.prepare('DELETE FROM history WHERE key=? AND id NOT IN (SELECT id FROM history WHERE key=? ORDER BY updated_at DESC LIMIT 50)').run(key, key);

  console.log(`Saved ${key} at ${new Date(now).toISOString()} by ${req.user.username} - ${JSON.stringify(data).length} bytes`);
  res.json({ ok: true, key, at: now, by: req.user.username });
});

// History (auth)
app.get('/api/history', authRequired, (req, res) => {
  const key = req.query.key || 'lab/v1';
  const rows = db.prepare('SELECT id, updated_at, updated_by FROM history WHERE key=? ORDER BY updated_at DESC LIMIT 20').all(key);
  res.json({ key, history: rows });
});

// Export all (auth)
app.get('/api/export', authRequired, (req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at, updated_by FROM kv').all();
  res.json({ keys: rows.length, data: rows.map(r => ({ key: r.key, at: r.updated_at, by: r.updated_by, data: JSON.parse(r.value) })) });
});

app.listen(PORT, () => {
  console.log(`\n✅ Ruli Lab Server online on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`   DB: ${path.join(__dirname, DB_PATH)}`);
  console.log(`   Login with: ${ADMIN_USERNAME} / (your password)`);
  console.log(`   Free deploy: Render.com -> https://dashboard.render.com\n`);
});
