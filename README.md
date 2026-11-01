# Monolayer demo app

A small web app for testing an OpenRouter AI Model connected to a service in Monolayer Canvas. The root page opens directly to a chat—there is no demo login.

## Run locally

Node.js 20 or newer is required.

```bash
npm install
$env:AI_PROVIDER = "openrouter"
$env:AI_MODEL_ID = "provider/model-id"
$env:OPENROUTER_MODEL = $env:AI_MODEL_ID
$env:OPENROUTER_API_KEY = "your-key"
npm start
```

In PowerShell, open [http://localhost:3000](http://localhost:3000).

Do not commit the key or put it in browser code.

## Deploy on Monolayer Canvas

1. Deploy this repository as a service on Canvas with port `3000`.
2. Add an **AI Model** resource and select **OpenRouter** and a model from its live list.
3. Connect the AI Model to this service.
4. In the service's **Variables**, add `OPENROUTER_API_KEY` with your OpenRouter key, stored as a secret.
5. Deploy or redeploy the service, then open its URL and send a message in the chat.

Canvas injects `AI_PROVIDER`, `AI_MODEL_ID`, and `OPENROUTER_MODEL` from the connection. The app reads the API key only on the server and calls OpenRouter's chat-completions API; the key is never sent to the browser. OpenRouter charges according to the selected model and its current account rates.

The chat is intentionally public for this demo. It has per-IP and app-wide in-memory request limits, but those are not a replacement for authentication or a production rate limiter. Anyone with the URL can use the configured OpenRouter model and may incur costs. Do not deploy this demo with a valuable key or expose it beyond your intended testers.

## Docker deployment

```bash
docker build -t YOUR_REGISTRY/monolayer-demo-app:latest .
docker push YOUR_REGISTRY/monolayer-demo-app:latest
```

Choose **Deploy a Docker image** in Canvas, set container port `3000`, connect the OpenRouter AI Model, add `OPENROUTER_API_KEY` as a service secret, and deploy.

## Health check

- `GET /healthz` returns `{ "ok": true }` and does not call OpenRouter.
