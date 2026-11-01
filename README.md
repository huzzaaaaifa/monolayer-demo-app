# Monolayer demo app

A small web app for testing an OpenRouter or Amazon Bedrock AI Model connected to a service in Monolayer Canvas. The root page opens directly to a chat—there is no demo login.

## Run locally

Node.js 20 or newer is required.

```bash
npm install
$env:AI_PROVIDER = "openrouter" # or "bedrock"
$env:AI_MODEL_ID = "provider/model-id"
# For OpenRouter:
$env:OPENROUTER_MODEL = $env:AI_MODEL_ID
$env:OPENROUTER_API_KEY = "your-key"
# For Bedrock:
$env:BEDROCK_MODEL_ID = $env:AI_MODEL_ID
$env:BEDROCK_REGION = "us-east-1"
# Configure AWS SDK default credentials for Bedrock, such as with an AWS profile.
npm start
```

In PowerShell, open [http://localhost:3000](http://localhost:3000).

Do not commit the key or put it in browser code.

## Deploy on Monolayer Canvas

1. Deploy this repository as a service on Canvas with port `3000`.
2. Add an **AI Model** resource and select either **OpenRouter** or **Amazon Bedrock**. For OpenRouter, choose a model from its live list and paste your API key; Canvas writes the key directly to your customer AWS Secrets Manager. For Bedrock, select a model and region where it is enabled in your AWS account.
3. Connect the AI Model to this service, then deploy the staged Canvas changes. This applies the connection and redeploys the service with its model settings.
4. Open the service URL and send a message in the chat.

Canvas injects `AI_PROVIDER` and `AI_MODEL_ID` from the connection. For OpenRouter, the operator reads the key from the AI Model's customer-account secret and injects `OPENROUTER_MODEL` and `OPENROUTER_API_KEY`; the app calls OpenRouter's chat-completions API from the server. For Bedrock, Canvas injects `BEDROCK_MODEL_ID` and `BEDROCK_REGION`; the app uses the service's AWS role credentials with the Bedrock Converse API and does not require a separate API key. The key is never sent to the browser. OpenRouter usage is billed by OpenRouter, and Bedrock usage is billed to the connected AWS account.

The chat is intentionally public for this demo. It has per-IP and app-wide in-memory request limits, but those are not a replacement for authentication or a production rate limiter. Anyone with the URL can use the configured model and may incur provider costs. Do not deploy this demo with a valuable key or expose it beyond your intended testers.

## Docker deployment

```bash
docker build -t YOUR_REGISTRY/monolayer-demo-app:latest .
docker push YOUR_REGISTRY/monolayer-demo-app:latest
```

Choose **Deploy a Docker image** in Canvas and set container port `3000`. Create and connect an OpenRouter or Bedrock AI Model as described above, then deploy the staged Canvas changes.

## Health check

- `GET /healthz` returns `{ "ok": true }` and does not call either model provider.
