/**
 * Monolayer Canvas demo — hardcoded sign-in only.
 * Credentials are shown on the login page on purpose (demo, not production).
 */
const crypto = require('crypto')
const express = require('express')

const PORT = Number(process.env.PORT) || 3000
const COOKIE = 'ml_demo_session'
const SECRET = process.env.SESSION_SECRET || 'monolayer-demo-not-secret'

/** Demo accounts — also printed on the login UI. */
const USERS = [
  { username: 'demo', password: 'demo123', name: 'Demo User', role: 'Member' },
  { username: 'admin', password: 'admin123', name: 'Admin User', role: 'Admin' },
]

const sessions = new Map() // id -> username

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 24)
}

function setSession(res, username) {
  const id = crypto.randomBytes(16).toString('hex')
  sessions.set(id, username)
  const token = `${id}.${sign(id)}`
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`,
  )
}

function clearSession(res, req) {
  const user = currentUser(req)
  const raw = parseCookie(req)[COOKIE]
  if (raw) {
    const id = raw.split('.')[0]
    sessions.delete(id)
  }
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`)
  return user
}

function parseCookie(req) {
  const out = {}
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function currentUser(req) {
  const raw = parseCookie(req)[COOKIE]
  if (!raw) return null
  const [id, sig] = raw.split('.')
  if (!id || !sig || sign(id) !== sig) return null
  const username = sessions.get(id)
  if (!username) return null
  return USERS.find((u) => u.username === username) || null
}

function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #171d25;
      --line: #2a3340;
      --text: #e8eef4;
      --muted: #8b98a8;
      --accent: #3d9cf0;
      --ok: #3ecf8e;
      --danger: #f07178;
      --warn-bg: #2a2416;
      --warn-line: #8a6d1f;
      --warn-text: #f0d78c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(900px 420px at 10% -10%, #1a3a5c 0%, transparent 55%),
        radial-gradient(700px 360px at 100% 0%, #1e2f24 0%, transparent 50%),
        var(--bg);
      color: var(--text);
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
    h1 { font-size: 1.6rem; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 .4rem; }
    h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
    p { color: var(--muted); line-height: 1.5; }
    .panel {
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 1.25rem 1.35rem;
      margin-top: 1.25rem;
      backdrop-filter: blur(8px);
    }
    .creds {
      background: var(--warn-bg);
      border: 1px solid var(--warn-line);
      color: var(--warn-text);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      margin: 1.25rem 0;
    }
    .creds strong { color: #fff4c2; }
    .creds code {
      display: inline-block; background: #1a160c; color: #ffe8a3;
      padding: .15rem .45rem; border-radius: 6px; font-size: .95rem;
    }
    .row { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: .65rem; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: .85rem 0 .35rem; }
    input {
      width: 100%; padding: .7rem .8rem; border-radius: 10px;
      border: 1px solid var(--line); background: #0c1016; color: var(--text);
    }
    input:focus { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); border-color: var(--accent); }
    button, .btn {
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 10px; padding: .7rem 1rem; cursor: pointer;
      font-weight: 600; text-decoration: none; color: #041018; background: var(--accent);
    }
    button.ghost, a.ghost {
      background: transparent; color: var(--text); border: 1px solid var(--line);
    }
    .error { color: var(--danger); font-size: .9rem; margin-top: .75rem; }
    .grid { display: grid; gap: .85rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .stat {
      border: 1px solid var(--line); border-radius: 12px; padding: .9rem 1rem; background: #121821;
    }
    .stat b { display: block; font-size: 1.25rem; margin-top: .25rem; }
    .ok { color: var(--ok); }
    .meta { font-size: .85rem; color: var(--muted); }
    header.bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  </style>
</head>
<body>
  <div class="wrap">${body}</div>
</body>
</html>`
}

function loginPage(error) {
  const accounts = USERS.map(
    (u) =>
      `<div class="row"><span><strong>${u.role}</strong> — username <code>${u.username}</code> · password <code>${u.password}</code></span></div>`,
  ).join('')
  return layout({
    title: 'Sign in · Monolayer demo',
    body: `
      <h1>Monolayer demo app</h1>
      <p>Hardcoded sign-in sample. Deploy this repo from the Monolayer canvas, open the service URL, then sign in with the credentials below.</p>
      <div class="creds">
        <strong>Demo login credentials</strong>
        ${accounts}
      </div>
      <div class="panel">
        <h2>Sign in</h2>
        <form method="POST" action="/login">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          ${error ? `<p class="error">${error}</p>` : ''}
          <div class="row" style="margin-top:1.1rem">
            <button type="submit">Sign in</button>
          </div>
        </form>
      </div>
      <p class="meta">Health check: <code>GET /</code> (login page) · App after login: <code>/app</code></p>
    `,
  })
}

function appPage(user) {
  const now = new Date().toLocaleString()
  return layout({
    title: 'Home · Monolayer demo',
    body: `
      <header class="bar">
        <div>
          <h1>Welcome, ${user.name}</h1>
          <p class="meta">Signed in as <code>${user.username}</code> · ${user.role}</p>
        </div>
        <form method="POST" action="/logout"><button class="ghost" type="submit">Sign out</button></form>
      </header>
      <div class="panel">
        <h2>Your demo workspace</h2>
        <p>This page is what you see after a successful login. Use it to confirm the Monolayer deploy is healthy end-to-end.</p>
        <div class="grid" style="margin-top:1rem">
          <div class="stat"><span class="meta">Status</span><b class="ok">Online</b></div>
          <div class="stat"><span class="meta">Role</span><b>${user.role}</b></div>
          <div class="stat"><span class="meta">Server time</span><b style="font-size:1rem">${now}</b></div>
        </div>
      </div>
      <div class="panel">
        <h2>Quick notes</h2>
        <ul style="color:var(--muted);line-height:1.6;padding-left:1.1rem;margin:0">
          <li>Auth is hardcoded in <code>server.js</code> — fine for demos, never for production.</li>
          <li>Credentials stay visible on the login page so anyone can try the app.</li>
          <li>Sessions are in-memory cookies; restarting the container signs everyone out.</li>
        </ul>
      </div>
    `,
  })
}

app.get('/', (req, res) => {
  if (currentUser(req)) return res.redirect('/app')
  res.type('html').send(loginPage())
})

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim()
  const password = String(req.body.password || '')
  const user = USERS.find((u) => u.username === username && u.password === password)
  if (!user) return res.status(401).type('html').send(loginPage('Invalid username or password.'))
  setSession(res, user.username)
  res.redirect('/app')
})

app.get('/app', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.redirect('/')
  res.type('html').send(appPage(user))
})

app.post('/logout', (req, res) => {
  clearSession(res, req)
  res.redirect('/')
})

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`monolayer-demo-app listening on :${PORT}`)
})
