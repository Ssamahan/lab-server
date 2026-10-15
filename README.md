# Ruli Lab Systems - Free Secure Server v1.1

**Fix for Render free tier: No Add Disk button** — Free instances don't support persistent disks. Your screenshot shows: "Free instances spin down after periods of inactivity. They do not support SSH access, scaling, one-off jobs, or persistent disks."

**Solution:** Use free external Postgres (Neon.tech 3GB free) for persistence — works on Render free without disk.

### Deploy on Render Free (No Disk Needed)

**Step 1: Create free Postgres (Neon - 100% free, no card)**

1. https://neon.tech → Sign up free
2. New Project → Name `ruli-lab` → Region EU
3. Copy **Connection String** e.g. `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`

**Step 2: Deploy Web Service**

You already did: Source `Ssamahan/lab-server`, Name `lab-server`, Language `Node`, Branch `main`, Build `npm install`, Start `npm start`, Free $0 — perfect.

In **Environment Variables** (your 3rd screenshot):

| KEY | VALUE |
|-----|-------|
| JWT_SECRET | nURevk1nqhtDsR39sYlS9tP16sdRafL35SzQhoiDQOI= |
| ADMIN_USERNAME | admin |
| ADMIN_PASSWORD | RuliLab@2026 |
| ALLOWED_ORIGIN | https://ssamahan.github.io |
| DB_PATH | ./data/lab.db |
| DATABASE_URL | postgresql://... ← Neon URL (makes it persistent on free) |

If no DATABASE_URL, SQLite file is ephemeral — data lost on spin-down. With DATABASE_URL, persistent forever on free.

**Step 3: Deploy**

Click **Deploy web service** → wait 2-3 min → copy URL e.g. `https://lab-server-xxxx.onrender.com`

Test: `https://your-url.onrender.com/api/health` → `{"ok":true,"dbType":"postgres"}`

### Use in Lab Systems App

v4.32.0 supports custom server:

1. https://ssamahan.github.io/lab/
2. Staff & Settings → Data & Backup → Free Secure Server
3. Paste Server URL, user `admin`, pass `RuliLab@2026` → Save & Enable → Test → Push Local → Server
4. Phone same URL → Pull Server → Local — live sync

### Why no Add Disk?

Render free = no disk, spins down after 15 min. Paid $7/month = supports disk. v1.1 uses Neon free Postgres so you stay $0/month with persistence.

### Alternative $7/month disk

Select $7/month in Compute → Add Disk appears → Name `data`, Mount `/opt/render/project/src/data`, 1GB → Deploy. Then remove DATABASE_URL.

But Neon free is better — stays $0.

Secure: JWT 30d, bcrypt, Helmet, CORS, rate limit.
