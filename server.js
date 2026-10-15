/**
 * Ruli Lab Systems - Free Secure Server v1.3.1 - Email OTP + Alert reminders
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
import nodemailer from 'nodemailer';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod-32chars!';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RuliLab@2026';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ssamahan.github.io';
const DB_PATH = process.env.DB_PATH || './data/lab.json';
const DATABASE_URL = process.env.DATABASE_URL || '';

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER || 'Ruli Lab Systems <noreply@ruli-lab.com>';

const dbDir = path.dirname(path.join(__dirname, DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let dbType = 'json';
let pgPool = null;
let jsonStore = { kv: {}, history: [] };

try {
  if (fs.existsSync(path.join(__dirname, DB_PATH))) {
    const raw = fs.readFileSync(path.join(__dirname, DB_PATH), 'utf8');
    jsonStore = JSON.parse(raw);
    if (!jsonStore.kv) jsonStore.kv = {};
    if (!jsonStore.history) jsonStore.history = [];
  }
} catch (e) {}

function saveJsonStore() {
  try { fs.writeFileSync(path.join(__dirname, DB_PATH), JSON.stringify(jsonStore, null, 2)); } catch (e) {}
}

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
    console.log('✅ Using Postgres (Neon free) - persistent');
  } catch (e) { console.warn('Postgres failed:', e.message); }
}

async function dbGet(key) {
  if (dbType === 'postgres') {
    const res = await pgPool.query('SELECT value, updated_at, updated_by FROM kv WHERE key=$1', [key]);
    return res.rows[0] || null;
  } else { return jsonStore.kv[key] || null; }
}

async function dbSet(key, value, updated_at, updated_by) {
  if (dbType === 'postgres') {
    await pgPool.query(`INSERT INTO kv (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at, updated_by=EXCLUDED.updated_by`, [key, value, updated_at, updated_by]);
    await pgPool.query('INSERT INTO history (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4)', [key, value, updated_at, updated_by]);
  } else {
    jsonStore.kv[key] = { value, updated_at, updated_by };
    jsonStore.history.unshift({ key, value, updated_at, updated_by, id: Date.now() });
    jsonStore.history = jsonStore.history.slice(0, 50);
    saveJsonStore();
  }
}

async function dbCount() {
  if (dbType === 'postgres') {
    const r = await pgPool.query('SELECT COUNT(*) as c FROM kv');
    return r.rows[0].c;
  } else { return Object.keys(jsonStore.kv).length; }
}

let adminHash = ADMIN_PASSWORD_HASH;
if (!adminHash) adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  if (!EMAIL_USER || !EMAIL_PASS) { console.log('⚠️ Email not configured'); return null; }
  mailTransporter = nodemailer.createTransport({ host: EMAIL_HOST, port: EMAIL_PORT, secure: EMAIL_PORT === 465, auth: { user: EMAIL_USER, pass: EMAIL_PASS } });
  return mailTransporter;
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '15mb' }));
app.use(cors({ origin: true, credentials: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/', (req, res) => res.json({ name: 'Ruli Lab Server', version: '1.3.1', status: 'online', dbType, emailConfigured: !!(EMAIL_USER && EMAIL_PASS), time: new Date().toISOString() }));
app.get('/api/health', async (req, res) => {
  try { const count = await dbCount(); res.json({ ok: true, dbType, keys: count, persistent: dbType === 'postgres', emailConfigured: !!(EMAIL_USER && EMAIL_PASS), time: Date.now() }); } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'required' });
  if (username !== ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid' });
  const ok = adminHash ? bcrypt.compareSync(password, adminHash) : (password === ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Invalid' });
  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, expiresIn: '30d' });
});
app.get('/api/data', async (req, res) => {
  const key = req.query.key || 'lab/v1';
  const row = await dbGet(key);
  if (!row) return res.json({ data: null, at: null, by: null, key });
  try { const parsed = JSON.parse(row.value); res.json({ data: parsed.data || parsed, at: row.updated_at, by: row.updated_by, key, raw: parsed }); } catch (e) { res.json({ data: null, at: row.updated_at, by: row.updated_by, key }); }
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
app.post('/api/send-otp', authRequired, async (req, res) => {
  const { toEmail, otp, purpose } = req.body || {};
  if (!toEmail || !otp) return res.status(400).json({ error: 'toEmail and otp required' });
  const transporter = getMailTransporter();
  if (!transporter) return res.status(500).json({ error: 'Email not configured - set EMAIL_USER and EMAIL_PASS in Render env' });
  const subject = `Ruli Lab Systems — OTP ${otp} for ${purpose || 'login'}`;
  const html = `<div style="font-family:Trebuchet MS,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e6e9f1;border-radius:12px;overflow:hidden"><div style="background:#0B1C3D;color:white;padding:20px;text-align:center"><h2 style="margin:0;color:#C9A84C">Ruli District Hospital</h2><div>Laboratory Department — Lab Systems</div></div><div style="padding:24px"><h3 style="color:#0B1C3D">Your OTP Code</h3><p>Your OTP for <b>${purpose || 'login'}</b> is:</p><div style="font-size:32px;font-weight:900;letter-spacing:6px;text-align:center;background:#F7F8FC;border:2px dashed #C9A84C;border-radius:10px;padding:16px;margin:16px 0;color:#0B1C3D">${otp}</div><p><b>Valid 5 minutes.</b></p><p style="color:#64748B;font-size:13px">Time: ${new Date().toLocaleString()}</p></div></div>`;
  try {
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: toEmail, subject, html, text: `OTP ${otp} for ${purpose || 'login'} - valid 5 min` });
    res.json({ ok: true, messageId: info.messageId, to: toEmail });
  } catch (e) { res.status(500).json({ error: 'Email send failed: ' + e.message }); }
});
app.post('/api/send-alert', authRequired, async (req, res) => {
  const { toEmail, subject, html, text } = req.body || {};
  if (!toEmail) return res.status(400).json({ error: 'toEmail required' });
  const transporter = getMailTransporter();
  if (!transporter) return res.status(500).json({ error: 'Email not configured - set EMAIL_USER and EMAIL_PASS in Render env' });
  const finalSubject = subject || `Ruli Lab — Alert — ${new Date().toLocaleDateString()}`;
  const finalHtml = html || `<div style="font-family:Trebuchet MS,sans-serif;padding:20px"><h3 style="color:#0B1C3D">Ruli Lab Alert</h3><p>${text||'Alert'}</p><p style="color:#64748B">Time: ${new Date().toLocaleString()}</p></div>`;
  try {
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: toEmail, subject: finalSubject, html: finalHtml, text: text || finalSubject });
    console.log(`Alert email sent to ${toEmail} - ${info.messageId}`);
    res.json({ ok: true, messageId: info.messageId, to: toEmail });
  } catch (e) { res.status(500).json({ error: 'Email send failed: ' + e.message }); }
});
app.listen(PORT, () => console.log(`\n✅ Ruli Lab Server v1.3.1 online port ${PORT} dbType=${dbType} email=${!!(EMAIL_USER && EMAIL_PASS)}\n`));
