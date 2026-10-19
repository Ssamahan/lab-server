# Ruli Lab Systems - Free Secure Server v1.3.1 + Equipment PM

Live: https://lab-server-7hwd.onrender.com - dbType postgres persistent true

Fixes Render free no disk: Uses Neon free Postgres (3GB free) - no Add Disk button needed (free tier doesn't support disks).

### New in v1.3.1
- Real Email OTP via Nodemailer free Gmail SMTP - POST /api/send-otp
- Consumable expiry alerts 10d + equipment PM reminders - POST /api/send-alert to smhnklvn@gmail.com from rulidhlab@gmail.com
- Equipment module: analyzers with serial, contractor, shipped/returned dates, rented backup

### Deploy (your screenshots)

You already deployed v1.2.0 successfully Live. Now v1.3.1 adds email.

In Render -> Environment -> Add 6 vars KEY|VALUE:

JWT_SECRET = nURevk1nqhtDsR39sYlS9tP16sdRafL35SzQhoiDQOI=
ADMIN_USERNAME = admin
ADMIN_PASSWORD = RuliLab@2026
ALLOWED_ORIGIN = https://ssamahan.github.io
DB_PATH = ./data/lab.json
DATABASE_URL = postgresql://... Neon URL (persistent)
EMAIL_HOST = smtp.gmail.com
EMAIL_PORT = 587
EMAIL_USER = rulidhlab@gmail.com
EMAIL_PASS = Gmail App Password 16 chars
EMAIL_FROM = Ruli Lab Systems <rulidhlab@gmail.com>

Deploy latest commit -> Manual Deploy -> Deploy.

### Lab App v5.2.3

- Locked to dark mode only web exports light
- Inter font, module names size like reference
- Real data no hallucination - samples from referred modules
- Greeting tailored to admin ssamahan lab manager if logged
- TAT vs target from referred samples module
- QC Levey-Jennings combining EQA programs
- Partner volume from referral module
- Live activity: annual leave, shipping sample, TAT last 2 days, consumables expiry
- On duty now from working plan + night duty
- Equipment fleet from equipment module with serial, contractor, dates, shipped, rented backup
- Supply radar expiring + expired last 7d
- All stock links go to source
- First-run checklist popup ignored

Live at https://ssamahan.github.io/lab/ - v5.2.3
