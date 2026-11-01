const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

function openRouterFailure(err) {
  const status = Number.isInteger(err?.status) ? err.status : 502
  const code = typeof err?.code === 'string' ? err.code : 'OpenRouterRequestError'
  const messages = {
    OpenRouterConfigurationError:
      'Connect an OpenRouter AI Model to this service in Canvas, add its API key as a service secret, then redeploy.',
    OpenRouterAuthenticationError:
      'OpenRouter rejected the API key. Check that the configured service secret is valid.',
    OpenRouterCreditsError:
      'OpenRouter could not process the request because the account has insufficient credits or a spending limit was reached.',
    OpenRouterModelError:
      'OpenRouter could not use this model. Re-select a model from the live Canvas list and redeploy.',
    OpenRouterRateLimitError:
      'OpenRouter is rate limiting requests. Wait briefly and try again.',
    OpenRouterUpstreamError:
      'OpenRouter is temporarily unavailable. Try again shortly.',
    OpenRouterInvalidResponse:
      'OpenRouter returned an unexpected response. Try again shortly.',
  }

  return {
    status,
    code,
    requestId: typeof err?.requestId === 'string' ? err.requestId : undefined,
    message: Object.hasOwn(messages, code)
      ? messages[code]
      : 'The OpenRouter request failed. Check the service logs for its error code and try again.',
  }
}

function createOpenRouterResponder({ apiKey, modelId, fetchImpl = globalThis.fetch }) {
  if (!apiKey || !modelId) {
    const error = new Error('OpenRouter model configuration is missing')
    error.code = 'OpenRouterConfigurationError'
    throw error
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('Fetch implementation is required')
  }

  return async (messages) => {
    let response
    try {
      response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          max_tokens: 512,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (cause) {
      const error = new Error('OpenRouter request could not be completed')
      error.code = 'OpenRouterUpstreamError'
      error.cause = cause
      throw error
    }

    const requestId = response.headers?.get?.('x-request-id') || undefined
    if (!response.ok) {
      const error = new Error(`OpenRouter returned HTTP ${response.status}`)
      error.status = response.status
      error.requestId = requestId
      error.code = response.status === 401 || response.status === 403
        ? 'OpenRouterAuthenticationError'
        : response.status === 402
          ? 'OpenRouterCreditsError'
          : response.status === 404
            ? 'OpenRouterModelError'
            : response.status === 429
              ? 'OpenRouterRateLimitError'
              : response.status >= 500
                ? 'OpenRouterUpstreamError'
                : 'OpenRouterRequestError'
      throw error
    }

    let payload
    try {
      payload = await response.json()
    } catch (cause) {
      const error = new Error('OpenRouter returned invalid JSON')
      error.code = 'OpenRouterInvalidResponse'
      error.requestId = requestId
      error.cause = cause
      throw error
    }
    const reply = payload?.choices?.[0]?.message?.content
    if (typeof reply !== 'string' || !reply.trim()) {
      const error = new Error('OpenRouter response did not contain a text reply')
      error.code = 'OpenRouterInvalidResponse'
      error.requestId = requestId
      throw error
    }
    return reply.trim()
  }
}

module.exports = { createOpenRouterResponder, openRouterFailure }
