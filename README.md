# Monolayer demo app

A tiny  web app for trying Monolayer Canvas end-to-end.

- Login page shows the demo credentials
- After sign-in you land on a simple home screen
- No database, no AWS SDKs — Node + Express only

## Demo credentials

| Role   | Username | Password  |
|--------|----------|-----------|
| Member | `demo`   | `demo123` |
| Admin  | `admin`  | `admin123` |

These are also printed on the login page UI.

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy on Monolayer (Canvas)

### Before you start

1. Sign in at [https://app.monolayer.io](https://app.monolayer.io)
2. Connect your AWS account and install the Monolayer **operator** (Connect page)
3. Create (or open) a **project**
4. Connect **GitHub** if you will deploy from this repository

### Option A — Deploy from GitHub (recommended)

1. Push this repo to GitHub (or fork it)
2. Open your project **Canvas**
3. Click **Add service** / connect from GitHub and pick this repository
4. Choose compute **EC2** or **ECS (Fargate)**
5. Leave the default port (**3000**) — the app reads `PORT` from the environment
6. Click **Deploy** (or **Deploy changes**)
7. Wait until the service shows **Active / Online**
8. Open the service URL (load balancer link on the canvas node)
9. Sign in with `demo` / `demo123`

Railpack builds the Node app from the repo; a Dockerfile is optional for this path.

### Option B — Deploy a local folder

1. On the Canvas, create an **empty / local folder** service
2. Upload or point Monolayer at this project folder
3. Deploy as **EC2** or **ECS**
4. Open the service URL and sign in

### Option C — Deploy a Docker image

1. Build and push an image:

   ```bash
   docker build -t YOUR_REGISTRY/monolayer-demo-app:latest .
   docker push YOUR_REGISTRY/monolayer-demo-app:latest
   ```

2. On the Canvas, choose **Deploy a Docker image**
3. Paste the image URI, set container port **3000**, deploy
4. Open the service URL and sign in

### After deploy — what you should see

1. **Login page** with the yellow credentials box (`demo` / `demo123`, `admin` / `admin123`)
2. After sign-in → **Welcome** home with Online status, role, and server time
3. **Sign out** returns you to the login page

### Health checks

- `GET /` — login page (fast; safe for ALB health checks)
- `GET /healthz` — `{ "ok": true }`

### Notes

- Auth is **hardcoded** for demos. Do not use this pattern in production.
- Sessions live in memory on the container; a redeploy clears them.
- Optional env: `PORT` (default `3000`), `SESSION_SECRET` (cookie signing)
