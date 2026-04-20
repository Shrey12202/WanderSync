# WanderSync — Deployment Guide

This guide deploys WanderSync to:
- **Frontend** → [Vercel](https://vercel.com) (free, unlimited)
- **Backend** → [Render](https://render.com) (free tier — sleeps after inactivity)
- **Database** → [Neon](https://neon.tech) (free serverless PostgreSQL — recommended)

---

## Prerequisites

- [ ] Code pushed to a **GitHub repository** (public or private both work)
- [ ] A free account on [Vercel](https://vercel.com), [Render](https://render.com), and [Neon](https://neon.tech)
- [ ] Your **Mapbox public token** from [account.mapbox.com](https://account.mapbox.com/access-tokens/)

---

## Step 1 — Push to GitHub

If you haven't already:

```bash
git init              # (if not already a git repo)
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wandersync.git
git push -u origin main
```

---

## Step 2 — Set up the Database (Neon)

1. Go to [neon.tech](https://neon.tech) → **Create a project** → Name it `wandersync`.
2. Neon creates a database named `neondb` by default.
3. In the Neon console, click **SQL Editor** and paste the **entire contents** of [`schema.sql`](./schema.sql) then click **Run**.
4. Go to **Connection Details** → copy the **Connection string**. It looks like:
   ```
   postgresql://user:password@ep-XYZ.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   **Save this — you will need it in the next step.**

---

## Step 3 — Deploy the Backend (Render)

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo.
3. Configure:

   | Setting | Value |
   |---|---|
   | **Name** | `wandersync-api` |
   | **Root Directory** | `backend` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | **Instance Type** | Free |

4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | _(paste the Neon connection string from Step 2)_ |
   | `CORS_ORIGINS` | `http://localhost:3000` _(we'll update this after Vercel deploy)_ |

5. Click **Create Web Service**.
6. Wait for the build to finish. Your backend URL will be something like:
   ```
   https://wandersync-api.onrender.com
   ```
   **Save this URL.**

7. Test it: open `https://wandersync-api.onrender.com/api/health` — you should see `{"status":"ok"}`.

> **Note**: On the free Render tier, the service **sleeps after 15 minutes of inactivity** and takes ~30 seconds to wake on the first request. This is fine for personal use.

---

## Step 4 — Deploy the Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import your GitHub repo.
3. Configure:

   | Setting | Value |
   |---|---|
   | **Framework Preset** | Next.js (auto-detected) |
   | **Root Directory** | `frontend` |

4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://wandersync-api.onrender.com` _(your Render URL)_ |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | `pk.eyJ1Ijo...` _(your Mapbox token)_ |

5. Click **Deploy**.
6. Vercel will give you a URL like:
   ```
   https://wandersync.vercel.app
   ```
   **Save this URL.**

---

## Step 5 — Update Backend CORS

Now that you have your Vercel URL, go back to Render:

1. **Render Dashboard** → `wandersync-api` → **Environment**.
2. Update `CORS_ORIGINS`:
   ```
   https://wandersync.vercel.app
   ```
   _(or comma-separate to allow both local and production: `http://localhost:3000,https://wandersync.vercel.app`)_
3. Render will automatically redeploy.

---

## Step 6 — Verify Everything Works

- [ ] Open your Vercel URL — the map should load.
- [ ] Create a trip and add a stop.
- [ ] Upload a photo — confirm it appears in the gallery.
- [ ] Check `https://wandersync-api.onrender.com/docs` for the interactive API docs.

---

## Ongoing Workflow

Every time you `git push` to `main`:
- **Vercel** automatically rebuilds and redeploys the frontend.
- **Render** automatically rebuilds and redeploys the backend.

---

## Known Limitations (Free Tier)

| Limitation | Impact | Fix When Ready |
|---|---|---|
| Render sleeps after 15 min | First request is slow | Upgrade to Render Starter ($7/mo) |
| Render filesystem is ephemeral | Uploaded photos lost on redeploy | Add Cloudinary storage |
| Neon 500MB storage cap | Fine for personal use | Upgrade Neon plan |

---

## Local Development (unchanged)

```bash
# Terminal 1 — Database
docker-compose up -d

# Terminal 2 — Backend
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend
npm run dev
```
