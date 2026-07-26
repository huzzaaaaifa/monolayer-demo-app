// Monolayer connection demo app — deploy this as an "ec2" or "ecs" service (git-connected,
// Railpack builds it automatically, no Dockerfile needed) and connect it on the canvas to a
// database, an S3 bucket, a volume, and/or another service. Reload "/" after each connection
// (and redeploy) to see that connection go from "not connected" to a live, working example.
//
// Nothing here is guessed: every env var name below matches exactly what the Monolayer app
// backend's connection resolver actually injects (see webhook.go's connectionEnv/dbConnections,
// and the operator's composeDBEnv) — this app just reads them and proves each one works.

const express = require('express')
const os = require('os')
const fs = require('fs/promises')
const path = require('path')

const PORT = process.env.PORT || 3000
const HOSTNAME = os.hostname()

const app = express()

// ---------------------------------------------------------------------------
// Database — DATABASE_URL (postgres/mysql/oracle/mongodb) or REDIS_URL.
// One heartbeat row/document is written and the most recent few are read back,
// so reloading the page after a redeploy proves the connection AND that the
// data actually persisted in the database (not just that a socket opened).
// ---------------------------------------------------------------------------
async function checkDatabase() {
  const url = process.env.DATABASE_URL
  const redisUrl = process.env.REDIS_URL
  if (!url && !redisUrl) {
    return { status: 'none', title: 'Database', detail: 'No DATABASE_URL or REDIS_URL — connect this service to a database on the canvas, then redeploy.' }
  }
  if (redisUrl) return checkRedis(redisUrl)

  const scheme = url.split('://')[0]
  try {
    if (scheme === 'postgres' || scheme === 'postgresql') return await checkPostgres(url)
    if (scheme === 'mysql') return await checkMysql(url)
    if (scheme === 'mongodb') return await checkMongo(url)
    if (scheme === 'oracle') return checkOracleUnsupported()
    return { status: 'warn', title: 'Database', detail: `DATABASE_URL has an unrecognized scheme ("${scheme}") — the demo app doesn't know how to query it.` }
  } catch (err) {
    return { status: 'error', title: 'Database', detail: `Connected env vars are present but the query failed: ${err.message}` }
  }
}

async function checkPostgres(url) {
  const { Pool } = require('pg')
  // RDS/Aurora PostgreSQL 15+ ships with rds.force_ssl=1 — a plain connection is
  // rejected outright. Always negotiate TLS; skipping CA verification is a
  // demo-only shortcut (production: pin the RDS CA bundle).
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: false } })
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS monolayer_demo (id SERIAL PRIMARY KEY, hostname TEXT, created_at TIMESTAMPTZ DEFAULT now())`)
    await pool.query(`INSERT INTO monolayer_demo (hostname) VALUES ($1)`, [HOSTNAME])
    const { rows } = await pool.query(`SELECT id, hostname, created_at FROM monolayer_demo ORDER BY id DESC LIMIT 5`)
    return { status: 'ok', title: 'Database (Postgres)', detail: `Inserted a heartbeat row and read it back. Last ${rows.length}:`, rows }
  } finally {
    await pool.end()
  }
}

async function checkMysql(url) {
  const mysql = require('mysql2/promise')
  // Plain first; retry over TLS if the server demands it (require_secure_transport).
  let conn
  try {
    conn = await mysql.createConnection({ uri: url, connectTimeout: 5000 })
  } catch (err) {
    conn = await mysql.createConnection({ uri: url, connectTimeout: 5000, ssl: { rejectUnauthorized: false } })
  }
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS monolayer_demo (id INT AUTO_INCREMENT PRIMARY KEY, hostname VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
    await conn.query(`INSERT INTO monolayer_demo (hostname) VALUES (?)`, [HOSTNAME])
    const [rows] = await conn.query(`SELECT id, hostname, created_at FROM monolayer_demo ORDER BY id DESC LIMIT 5`)
    return { status: 'ok', title: 'Database (MySQL)', detail: `Inserted a heartbeat row and read it back. Last ${rows.length}:`, rows }
  } finally {
    await conn.end()
  }
}

async function checkMongo(url) {
  const { MongoClient } = require('mongodb')
  // DocumentDB terminates TLS with a cert chain most Node trust stores don't have
  // by default — relaxing verification here is a demo-only shortcut, not something
  // to carry into production (pin the RDS CA bundle instead).
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, tlsAllowInvalidCertificates: true })
  try {
    await client.connect()
    const col = client.db('monolayer_demo').collection('visits')
    await col.insertOne({ hostname: HOSTNAME, created_at: new Date() })
    const rows = await col.find().sort({ _id: -1 }).limit(5).toArray()
    return {
      status: 'ok',
      title: 'Database (DocumentDB / MongoDB)',
      detail: `Inserted a heartbeat document and read it back. Last ${rows.length}:`,
      rows: rows.map((r) => ({ id: String(r._id), hostname: r.hostname, created_at: r.created_at })),
    }
  } finally {
    await client.close()
  }
}

function checkOracleUnsupported() {
  return {
    status: 'warn',
    title: 'Database (Oracle)',
    detail: 'DATABASE_URL/ORACLE_* env vars are present, confirming the connection resolved — but this demo app has no bundled Oracle driver (needs the Oracle Instant Client native libraries). Env vars present: ' +
      ['ORACLE_HOST', 'ORACLE_PORT', 'ORACLE_USER', 'ORACLE_DATABASE'].filter((k) => process.env[k]).join(', '),
  }
}

async function checkRedis(url) {
  const Redis = require('ioredis')
  const redis = new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    const visits = await redis.incr('monolayer:demo:visits')
    await redis.lpush('monolayer:demo:log', `${new Date().toISOString()} ${HOSTNAME}`)
    await redis.ltrim('monolayer:demo:log', 0, 4)
    const log = await redis.lrange('monolayer:demo:log', 0, 4)
    return { status: 'ok', title: 'Database (Redis)', detail: `Incremented a visit counter (now ${visits}) and pushed a log entry. Last ${log.length}:`, rows: log.map((l) => ({ entry: l })) }
  } finally {
    redis.disconnect()
  }
}

// ---------------------------------------------------------------------------
// S3 buckets — <PREFIX>_BUCKET_NAME (+ plain BUCKET_NAME when exactly one
// bucket is connected). Uploads a small object, lists the bucket, and reads
// the object straight back to prove read AND write access.
// ---------------------------------------------------------------------------
async function checkBuckets() {
  const names = new Set()
  if (process.env.BUCKET_NAME) names.add(process.env.BUCKET_NAME)
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith('_BUCKET_NAME') && value) names.add(value)
  }
  if (names.size === 0) {
    return [{ status: 'none', title: 'S3 bucket', detail: 'No *_BUCKET_NAME — connect this service to an S3 bucket resource on the canvas, then redeploy.' }]
  }
  const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')
  // Neither EC2 user-data containers nor ECS reliably export AWS_REGION, and SDK v3
  // throws "Region is missing" rather than probing IMDS for it. Fall back to
  // us-east-1 and let followRegionRedirects chase the bucket's real region.
  const s3 = new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    followRegionRedirects: true,
  })
  const results = []
  for (const bucket of names) {
    try {
      const key = `monolayer-demo/${HOSTNAME}-${Date.now()}.txt`
      const body = `Written by ${HOSTNAME} at ${new Date().toISOString()}`
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }))
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'monolayer-demo/', MaxKeys: 10 }))
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const readBack = await got.Body.transformToString()
      results.push({
        status: 'ok',
        title: `S3 bucket: ${bucket}`,
        detail: `Uploaded "${key}", listed ${listed.KeyCount ?? 0} object(s) under monolayer-demo/, and read the upload back: "${readBack}"`,
      })
    } catch (err) {
      results.push({ status: 'error', title: `S3 bucket: ${bucket}`, detail: `Env var present but the S3 call failed: ${err.message}` })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// EBS volume — no env var carries the mount path (it's whatever you typed into
// the canvas "Attach volume" dialog, default /data), so this is set via
// DEMO_VOLUME_PATH on the service itself. Appends to a log file and reads the
// tail back — reload after a redeploy to see the log survive (ec2) or reset
// (ecs — a known, documented platform limitation, not a bug in this app).
// ---------------------------------------------------------------------------
async function checkVolume() {
  const dir = process.env.DEMO_VOLUME_PATH || '/data'
  const file = path.join(dir, 'monolayer-demo.log')
  try {
    await fs.appendFile(file, `${new Date().toISOString()} ${HOSTNAME}\n`)
    const content = await fs.readFile(file, 'utf8')
    const lines = content.trim().split('\n').slice(-5)
    return { status: 'ok', title: `Volume (${dir})`, detail: `Appended a line and read the file back. Last ${lines.length}:`, rows: lines.map((l) => ({ entry: l })) }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { status: 'none', title: `Volume (${dir})`, detail: `Nothing mounted at ${dir} — connect this service to a volume on the canvas (mount path must match DEMO_VOLUME_PATH), then redeploy.` }
    }
    return { status: 'error', title: `Volume (${dir})`, detail: `Path exists but couldn't be written: ${err.message}` }
  }
}

// ---------------------------------------------------------------------------
// Service-to-service — <PREFIX><NAME>_URL (public, every service pair) and
// <PREFIX><NAME>_PRIVATE_URL (VPC-internal, ec2/ecs targets only — see the
// internal ALB work). Calls whichever are present and shows the response, so
// a Lambda connected to this service side-by-side proves both paths reach it.
// ---------------------------------------------------------------------------
async function checkServices() {
  const skip = new Set(['DATABASE_URL', 'REDIS_URL', 'BUCKET_URL'])
  const services = new Map() // base name -> { publicUrl, privateUrl }
  for (const key of Object.keys(process.env)) {
    if (skip.has(key) || key.endsWith('_BUCKET_URL')) continue
    let m = key.match(/^(.+)_PRIVATE_URL$/)
    if (m) {
      services.set(m[1], { ...(services.get(m[1]) || {}), privateUrl: process.env[key] })
      continue
    }
    m = key.match(/^(.+)_URL$/)
    if (m) {
      services.set(m[1], { ...(services.get(m[1]) || {}), publicUrl: process.env[key] })
    }
  }
  if (services.size === 0) {
    return [{ status: 'none', title: 'Connected services', detail: 'No *_URL env vars — connect this service to (or from) another service on the canvas, then redeploy.' }]
  }
  const results = []
  for (const [name, urls] of services) {
    for (const [label, url] of [['public', urls.publicUrl], ['private', urls.privateUrl]]) {
      if (!url) continue
      const started = Date.now()
      try {
        const res = await fetchWithTimeout(url, 4000)
        const body = (await res.text()).slice(0, 200)
        results.push({
          status: 'ok',
          title: `${name} (${label})`,
          detail: `GET ${url} → ${res.status} in ${Date.now() - started}ms. Body preview: ${body.replace(/\s+/g, ' ').slice(0, 160)}`,
        })
      } catch (err) {
        results.push({ status: 'error', title: `${name} (${label})`, detail: `GET ${url} failed: ${err.message}` })
      }
    }
  }
  return results
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Environment variables — proves the platform actually injected this service's
// env (SSM Parameter Store / Secrets Manager → container). Set/rename/remove a
// var in Monolayer, redeploy, and reload: it appears/updates/disappears here.
// The disappear case is the important one — it proves the SSM backend's
// delete-on-remove reconciliation, which a Secrets Manager blob got for free.
//
// Baseline container/runtime vars are hidden as noise, and any value whose NAME
// looks like a credential is masked — this page is served on a PUBLIC ALB, so it
// must never print a real DATABASE_URL/password. You still see the KEY exists and
// its length, which is enough to confirm injection.
// ---------------------------------------------------------------------------
const HIDDEN_ENV = new Set(['PATH', 'HOME', 'HOSTNAME', 'PWD', 'SHLVL', 'TERM', 'NODE_VERSION', 'YARN_VERSION', 'NODE_ENV', '_'])
const SENSITIVE_ENV = /PASS|SECRET|TOKEN|CREDENTIAL|PRIVATE|_KEY$|^KEY|DATABASE_URL|REDIS_URL|CONNECTION|_URL$/i

function envReport() {
  const rows = Object.keys(process.env)
    .filter((k) => !HIDDEN_ENV.has(k))
    .sort()
    .map((k) => {
      const raw = process.env[k] ?? ''
      return { name: k, value: SENSITIVE_ENV.test(k) ? `••••••• (set, ${raw.length} chars)` : raw }
    })
  return {
    status: rows.length ? 'ok' : 'none',
    title: `Environment variables (${rows.length})`,
    detail: rows.length
      ? 'Injected into this container by Monolayer. Set/rename/remove one, redeploy, and reload — a removed var must disappear here (delete-on-remove reconciliation). Credential-looking names are masked.'
      : 'No environment variables set — add some in Monolayer, then redeploy.',
    rows,
  }
}

// ---------------------------------------------------------------------------
// Rendering. "/" is a static shell that fetches /api/status from the browser —
// deliberately, for three reasons that all bit during demo prep:
//   1. The shared ALB health-checks "/" with a 5s timeout every 15s; running the
//      connection checks inline could exceed that and mark the target unhealthy
//      (502s for the whole demo). The shell always answers in milliseconds.
//   2. The health checker would otherwise INSERT a DB row / PUT an S3 object /
//      append to the volume log every 15s, drowning the demo data in noise.
//   3. Two demo apps connected to each other would recurse (A renders → GET B →
//      B renders → GET A → …). Fetching "/" now returns instantly with no side
//      effects; only a real browser triggers the checks.
// The checks themselves still run SERVER-side (in /api/status) — that's the
// point of the demo: the SERVICE reaches the DB/bucket/private URL, not the
// viewer's browser.
// ---------------------------------------------------------------------------
const SHELL_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Monolayer demo — ${HOSTNAME}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; background: #0b0f14; color: #e6edf3; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin: 0 0 .4rem; }
    .card { border: 1px solid #2a3038; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; background: #11161c; }
    .status-ok { border-left: 4px solid #3fb950; } .status-warn { border-left: 4px solid #d29922; }
    .status-error { border-left: 4px solid #f85149; } .status-none { border-left: 4px solid #444c56; opacity: .75; }
    table { border-collapse: collapse; margin-top: .5rem; font-size: .85rem; width: 100%; }
    td { border-top: 1px solid #2a3038; padding: .3rem .5rem; }
    code { background: #1c232b; padding: .1rem .3rem; border-radius: 4px; }
    .meta { color: #8b949e; font-size: .85rem; }
  </style>
</head>
<body>
  <h1>Monolayer connection demo</h1>
  <p class="meta">Host <code>${HOSTNAME}</code> · reload after connecting/redeploying to see a section flip from ➖ to ✅.</p>
  <div id="cards"><section class="card status-none"><p>Running connection checks…</p></section></div>
  <script>
    const BADGE = { ok: '✅', warn: '⚠️', error: '❌', none: '➖' }
    function el(tag, cls, text) {
      const n = document.createElement(tag)
      if (cls) n.className = cls
      if (text != null) n.textContent = text
      return n
    }
    function card(item) {
      const s = el('section', 'card status-' + item.status)
      s.appendChild(el('h2', null, BADGE[item.status] + ' ' + item.title))
      s.appendChild(el('p', null, item.detail))
      if (item.rows && item.rows.length) {
        const table = el('table'), tbody = el('tbody')
        for (const r of item.rows) {
          const tr = el('tr')
          for (const v of Object.values(r)) tr.appendChild(el('td', null, String(v)))
          tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        s.appendChild(table)
      }
      return s
    }
    fetch('/api/status').then((r) => r.json()).then((j) => {
      const cards = document.getElementById('cards')
      cards.replaceChildren()
      for (const item of [j.env, j.database, ...j.buckets, j.volume, ...j.services]) cards.appendChild(card(item))
    }).catch((err) => {
      document.getElementById('cards').replaceChildren(card({ status: 'error', title: 'Status check', detail: String(err) }))
    })
  </script>
</body>
</html>`

app.get('/', (req, res) => {
  res.send(SHELL_HTML)
})

app.get('/api/status', async (req, res) => {
  const [db, buckets, volume, services] = await Promise.all([checkDatabase(), checkBuckets(), checkVolume(), checkServices()])
  res.json({ hostname: HOSTNAME, env: envReport(), database: db, buckets, volume, services })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`monolayer-demo-app listening on :${PORT}`)
})
