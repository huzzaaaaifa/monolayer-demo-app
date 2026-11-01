/**
 * Monolayer Canvas demo — public chat using the connected OpenRouter AI Model.
 */
const express = require('express')
const { createOpenRouterResponder, openRouterFailure } = require('./openrouter')

const PORT = Number(process.env.PORT) || 3000
const MODEL_ID = process.env.OPENROUTER_MODEL || process.env.AI_MODEL_ID || ''
const API_KEY = process.env.OPENROUTER_API_KEY || ''
const configured = process.env.AI_PROVIDER === 'openrouter' && Boolean(MODEL_ID && API_KEY)
const respondWithOpenRouter = configured
  ? createOpenRouterResponder({ apiKey: API_KEY, modelId: MODEL_ID })
  : null
const clientRequests = new Map()
const globalRequests = []
const CLIENT_REQUEST_LIMIT = 10
const GLOBAL_REQUEST_LIMIT = 120
const RATE_WINDOW_MS = 60_000
const MAX_TRACKED_CLIENTS = 10_000

const app = express()
const jsonParser = express.json({ limit: '32kb' })
app.disable('x-powered-by')
app.use((req, res, next) => {
  jsonParser(req, res, (err) => {
    if (!err) return next()
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' })
    }
    if (req.path.startsWith('/api/') && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' })
    }
    return next(err)
  })
})

function checkRateLimit(clientKey, now = Date.now()) {
  while (globalRequests.length && now - globalRequests[0] >= RATE_WINDOW_MS) {
    globalRequests.shift()
  }
  const recent = (clientRequests.get(clientKey) || []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  )
  if (recent.length === 0 && !clientRequests.has(clientKey) &&
      clientRequests.size >= MAX_TRACKED_CLIENTS) {
    for (const [key, timestamps] of clientRequests) {
      if (!timestamps.some((timestamp) => now - timestamp < RATE_WINDOW_MS)) {
        clientRequests.delete(key)
      }
    }
    if (clientRequests.size >= MAX_TRACKED_CLIENTS) return 'capacity'
  }
  if (recent.length >= CLIENT_REQUEST_LIMIT || globalRequests.length >= GLOBAL_REQUEST_LIMIT) {
    clientRequests.set(clientKey, recent)
    return 'limited'
  }
  recent.push(now)
  clientRequests.set(clientKey, recent)
  globalRequests.push(now)
  return 'allowed'
}

function layout(body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="same-origin" />
  <title>OpenRouter chat · Monolayer demo</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1419;
      --panel: #171d25;
      --line: #2a3340;
      --text: #e8eef4;
      --muted: #8b98a8;
      --accent: #3d9cf0;
      --danger: #f07178;
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
    .wrap { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
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
    .meta { font-size: .85rem; color: var(--muted); }
    .chat { display: grid; gap: .75rem; }
    .chat-log {
      display: grid; gap: .7rem; min-height: 120px; max-height: 460px; overflow-y: auto;
      border: 1px solid var(--line); border-radius: 12px; padding: .85rem; background: #10161e;
    }
    .message {
      max-width: 90%; padding: .65rem .8rem; border-radius: 10px;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .message.user { justify-self: end; background: #17314a; }
    .message.assistant { justify-self: start; background: #202a35; }
    label { display: block; font-size: .85rem; color: var(--muted); margin: .85rem 0 .35rem; }
    textarea {
      width: 100%; min-height: 82px; resize: vertical; padding: .7rem .8rem;
      border-radius: 10px; border: 1px solid var(--line); background: #0c1016;
      color: var(--text); font: inherit;
    }
    textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); border-color: var(--accent); }
    .row { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: .65rem; }
    button {
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 10px; padding: .7rem 1rem; cursor: pointer;
      font-weight: 600; color: #041018; background: var(--accent);
    }
    button.ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .error { color: var(--danger); }
    .chat-status { min-height: 1.25rem; margin: 0; font-size: .9rem; }
  </style>
</head>
<body><main class="wrap">${body}</main></body>
</html>`
}

function chatPage() {
  return layout(`
    <h1>Monolayer demo chat</h1>
    <p>Try the OpenRouter AI Model connected to this service in Canvas.</p>
    <section class="panel">
      <h2 id="model-title">OpenRouter chat</h2>
      <p id="model-status" class="meta">Checking the connected AI Model…</p>
      <p class="meta">Model usage is billed by OpenRouter based on its current rates.</p>
      <div class="chat">
        <div id="chat-log" class="chat-log" aria-live="polite" aria-label="Chat conversation"></div>
        <form id="chat-form">
          <label for="chat-message">Message</label>
          <textarea id="chat-message" maxlength="2000" required
            placeholder="Ask a question to test the connected OpenRouter model"></textarea>
          <div class="row">
            <button id="chat-submit" type="submit" disabled>Send</button>
            <button id="chat-clear" class="ghost" type="button" disabled>Clear chat</button>
          </div>
        </form>
        <p id="chat-error" class="chat-status error" role="status"></p>
      </div>
    </section>
    <script>
      (() => {
        const log = document.getElementById('chat-log')
        const status = document.getElementById('model-status')
        const title = document.getElementById('model-title')
        const error = document.getElementById('chat-error')
        const form = document.getElementById('chat-form')
        const input = document.getElementById('chat-message')
        const submit = document.getElementById('chat-submit')
        const clear = document.getElementById('chat-clear')
        const messages = []
        let busy = false
        let modelReady = false
        const render = () => {
          log.replaceChildren(...messages.map((message) => {
            const bubble = document.createElement('div')
            bubble.className = 'message ' + message.role
            bubble.textContent = message.content
            return bubble
          }))
          log.scrollTop = log.scrollHeight
          clear.disabled = busy || messages.length === 0
        }
        fetch('/api/openrouter/status')
          .then(async (response) => {
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Could not check the model connection.')
            if (!data.configured) {
              status.textContent = data.missing?.includes('OPENROUTER_API_KEY') &&
                !data.missing.includes('AI_PROVIDER') && !data.missing.includes('AI_MODEL_ID')
                ? 'The model is connected, but no OpenRouter key was injected. Verify its key was saved in AWS Secrets Manager, then deploy the Canvas connection again.'
                : 'Connect an OpenRouter AI Model and deploy the staged Canvas changes. Canvas will redeploy this service.'
              return
            }
            title.textContent = data.model
            status.textContent = 'Connected to OpenRouter. Send a message to test the model.'
            modelReady = true
            submit.disabled = false
          })
          .catch((cause) => { status.textContent = cause.message })
        form.addEventListener('submit', async (event) => {
          event.preventDefault()
          const content = input.value.trim()
          if (!content || busy || !modelReady) return
          error.textContent = ''
          if (messages.length >= 12) messages.splice(0, 2)
          messages.push({ role: 'user', content })
          input.value = ''
          busy = true
          submit.disabled = true
          render()
          try {
            const response = await fetch('/api/openrouter/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: messages.slice(-12) }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'The OpenRouter request failed.')
            messages.push({ role: 'assistant', content: data.reply })
            if (messages.length > 12) messages.splice(0, messages.length - 12)
          } catch (cause) {
            messages.pop()
            input.value = content
            error.textContent = cause.message
          } finally {
            busy = false
            submit.disabled = !modelReady
            render()
          }
        })
        clear.addEventListener('click', () => {
          messages.length = 0
          error.textContent = ''
          render()
        })
      })()
    </script>
  `)
}

app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.type('html').send(chatPage())
})

app.get('/api/openrouter/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  const missing = []
  if (process.env.AI_PROVIDER !== 'openrouter') missing.push('AI_PROVIDER')
  if (!MODEL_ID) missing.push('AI_MODEL_ID')
  if (!API_KEY) missing.push('OPENROUTER_API_KEY')
  res.json({ configured, missing, ...(configured ? { model: MODEL_ID } : {}) })
})

app.post('/api/openrouter/chat', async (req, res) => {
  if (!configured || !respondWithOpenRouter) {
    return res.status(503).json({
      error: 'Connect an OpenRouter AI Model to this service in Canvas, add its API key as a service secret, then redeploy.',
    })
  }
  if (req.get('origin')) {
    try {
      if (new URL(req.get('origin')).host !== req.get('host')) {
        return res.status(403).json({ error: 'Cross-origin chat requests are not allowed.' })
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin.' })
    }
  }

  const messages = req.body?.messages
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12) {
    return res.status(400).json({ error: 'Send between 1 and 12 recent chat messages.' })
  }
  const valid = messages.every((message, index) => {
    const expectedRole = index % 2 === 0 ? 'user' : 'assistant'
    return message && message.role === expectedRole &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0 &&
      message.content.length <= 2000
  })
  if (!valid || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({
      error: 'Messages must alternate between user and assistant and end with your message.',
    })
  }

  const limit = checkRateLimit(req.ip || 'unknown')
  if (limit === 'capacity') {
    return res.status(503).json({ error: 'Chat is busy. Please try again shortly.' })
  }
  if (limit === 'limited') {
    return res.status(429).json({ error: 'Chat limit reached. Try again in a minute.' })
  }

  try {
    const reply = await respondWithOpenRouter(messages)
    res.json({ reply })
  } catch (err) {
    const failure = openRouterFailure(err)
    console.error(JSON.stringify({
      event: 'openrouter_chat_failed',
      code: failure.code,
      requestId: failure.requestId,
      status: failure.status,
      model: MODEL_ID,
      message: err?.message,
    }))
    res.status(failure.status >= 400 && failure.status < 500 ? failure.status : 502)
      .json({ error: failure.message, code: failure.code })
  }
})

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`monolayer-demo-app listening on :${PORT}`)
})
