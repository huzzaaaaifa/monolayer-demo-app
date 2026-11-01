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
2. Add an **AI Model** resource, select **OpenRouter**, choose a model from its live list, and paste your OpenRouter API key. Canvas writes the key directly to your customer AWS Secrets Manager.
3. Connect the AI Model to this service, then deploy the staged Canvas changes. This applies the connection and redeploys the service with its model settings.
4. Open the service URL and send a message in the chat.

Canvas injects `AI_PROVIDER`, `AI_MODEL_ID`, and `OPENROUTER_MODEL` from the connection. During deployment, the operator reads the key from the AI Model's customer-account secret and adds `OPENROUTER_API_KEY` to the service's connection-injected environment. The app reads the key only on the server and calls OpenRouter's chat-completions API; the key is never sent to the browser or stored by Monolayer. OpenRouter charges according to the selected model and its current account rates.

The chat is intentionally public for this demo. It has per-IP and app-wide in-memory request limits, but those are not a replacement for authentication or a production rate limiter. Anyone with the URL can use the configured OpenRouter model and may incur costs. Do not deploy this demo with a valuable key or expose it beyond your intended testers.

## Docker deployment

```bash
docker build -t YOUR_REGISTRY/monolayer-demo-app:latest .
docker push YOUR_REGISTRY/monolayer-demo-app:latest
```

Choose **Deploy a Docker image** in Canvas, set container port `3000`, create an OpenRouter AI Model with your key, connect it to the service, and deploy the staged Canvas changes.

## Health check

- `GET /healthz` returns `{ "ok": true }` and does not call OpenRouter.
