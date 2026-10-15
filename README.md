# Ruli Lab Systems - Free Secure Server

**100% free, secure, online** server to replace broken Firebase `lab-default-rtdb` (404). Keeps your lab data live across phone ↔ PC.

### Why this server?
- Firebase `https://lab-default-rtdb.firebaseio.com` returns 404 → data stays local only
- This server stores your `DB` (samples, EQA, stock, trainings, rosters) online with JWT auth
- Free hosting: Render.com (750h/month free), Fly.io, Railway, Vercel
- Secure: Helmet headers, CORS locked to `https://ssamahan.github.io`, rate limiting, bcrypt password, JWT 30d expiry

### Quick Deploy - Render.com (Recommended, FREE)

1. **Push to GitHub:**
   ```bash
   cd lab-server
   git init
   git add .
   git commit -m "lab server"
   # Create repo Ssamahan/lab-server on GitHub, then:
   git remote add origin https://github.com/Ssamahan/lab-server.git
   git push -u origin main
   ```

2. **Render:**
   - Go to https://dashboard.render.com → New → Web Service → Connect `lab-server` repo
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
   - **Environment Variables:**
     ```
     JWT_SECRET=your-32-char-random-string (generate: openssl rand -base64 32)
     ADMIN_USERNAME=admin
     ADMIN_PASSWORD=RuliLab@2026
     ALLOWED_ORIGIN=https://ssamahan.github.io
     DB_PATH=./data/lab.db
     ```
   - **Add Disk (for persistence, free 1GB):** 
     - Name: `data`, Mount Path: `/opt/render/project/src/data`, Size: 1GB
   - Deploy → copy URL e.g. `https://ruli-lab-server.onrender.com`

3. **Test:**
   ```bash
   curl https://ruli-lab-server.onrender.com/
   curl -X POST https://ruli-lab-server.onrender.com/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"RuliLab@2026"}'
   ```

### Use in Lab Systems App

I will update your `index.html` to use this server automatically. The app will:

- Try custom server first (if you set URL in Settings)
- Fallback to Firebase REST if custom server not set
- Fallback to localStorage if offline

**In app:**
- Staff & Settings → Data & Backup → Custom Server URL → paste `https://ruli-lab-server.onrender.com`
- Login as admin → data auto-syncs phone ↔ PC every 15s

### API

- `POST /api/login` {username, password} → {token}
- `GET /api/data?key=lab/v1` → {data, at, by}
- `PUT /api/data?key=lab/v1` {data} + Bearer token → {ok, at}
- `GET /api/history` + Bearer → last 20 saves
- `GET /api/health` → status

### Security

- Password hashed with bcrypt
- JWT 30 days expiry
- CORS only allows `https://ssamahan.github.io` (edit `ALLOWED_ORIGIN`)
- Rate limit 200 req / 15 min
- Helmet security headers
- SQLite file stored on disk (encrypted at rest by host)

### Alternative Free Options (no server needed)

If you don't want to run a server:

**Option A - Supabase (free Postgres, 500MB):**
1. supabase.com → New project → free
2. Create table `lab_data` with `key text primary key, data jsonb, updated_at bigint`
3. Use Supabase REST directly from app (I can code it)

**Option B - Fix Firebase:**
Create new Firebase project, enable Realtime Database in test mode, copy URL, paste into app. Free 1GB.

### Local Run

```bash
npm install
cp .env.example .env
# edit .env
npm start
# http://localhost:3000
```

### Integration Code (for index.html)

Add to `getFirebaseConfig()` fallback to custom server:

```js
function getCustomServerConfig(){
  try{ return JSON.parse(localStorage.getItem('labSystems.customServer.v1')||'null'); }catch(e){ return null; }
}
// In cloudSave/cloudLoad, try custom server first
```

I will patch your Lab Systems app to support this server URL field.

### Cost

- Render free: 750 hours/month = always on free
- SQLite disk 1GB free
- Bandwidth 100GB free
- No credit card needed for free tier

You own the data, secure, online, free forever.
