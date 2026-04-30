# SplitBill

Fair splits, zero drama. Split restaurant bills with AI receipt scanning.

## Deploy to Vercel (5 minutes)

### Step 1 — Upload to GitHub
1. Go to [github.com/new](https://github.com/new) and create a new repository
2. Upload all these files (drag & drop the folder), or use Git:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/splitbill.git
git push -u origin main
```

### Step 2 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `splitbill` repository
4. Click **"Deploy"** — Vercel auto-detects Next.js, no config needed

### Step 3 — Add your API key
1. In Vercel, go to your project → **Settings → Environment Variables**
2. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from [console.anthropic.com](https://console.anthropic.com)
3. Click **Save**, then go to **Deployments** and click **Redeploy**

Your app is live! 🎉

## Run locally

```bash
npm install
cp .env.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How it works

- **Frontend:** React (Next.js App Router)
- **AI scanning:** `/api/scan-receipt` — proxies image to Claude claude-sonnet-4-20250514
- **Tax formula:** Indonesian standard — Service on subtotal, PPN on subtotal + service
- **No database** — session only, no data stored
