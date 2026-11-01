const test = require('node:test')
const assert = require('node:assert/strict')
const { createOpenRouterResponder, openRouterFailure } = require('./openrouter')

function mockResponse(status, payload, requestId = 'request-123') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'x-request-id': requestId }),
    json: async () => payload,
  }
}

test('sends chat history, model, and API key only to OpenRouter', async () => {
  let url
  let request
  const respond = createOpenRouterResponder({
    apiKey: 'secret-key',
    modelId: 'provider/model-from-canvas',
    fetchImpl: async (target, options) => {
      url = target
      request = options
      return mockResponse(200, {
        choices: [{ message: { content: 'Hello from OpenRouter.' } }],
      })
    },
  })

  const reply = await respond([
    { role: 'user', content: 'Confirm the model is working.' },
  ])
  const body = JSON.parse(request.body)

  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers.Authorization, 'Bearer secret-key')
  assert.equal(body.model, 'provider/model-from-canvas')
  assert.deepEqual(body.messages, [
    { role: 'user', content: 'Confirm the model is working.' },
  ])
  assert.equal(reply, 'Hello from OpenRouter.')
  assert.ok(request.signal instanceof AbortSignal)
})

test('maps provider authentication errors without exposing response content', async () => {
  const respond = createOpenRouterResponder({
    apiKey: 'secret-key',
    modelId: 'provider/model',
    fetchImpl: async () => mockResponse(401, { error: 'sensitive provider detail' }),
  })

  await assert.rejects(respond([{ role: 'user', content: 'Hi' }]), (err) => {
    const failure = openRouterFailure(err)
    assert.equal(failure.code, 'OpenRouterAuthenticationError')
    assert.equal(failure.requestId, 'request-123')
    assert.match(failure.message, /API key/)
    assert.doesNotMatch(failure.message, /sensitive provider detail|secret-key/)
    return true
  })
})

test('rejects empty or malformed OpenRouter replies', async () => {
  const respond = createOpenRouterResponder({
    apiKey: 'secret-key',
    modelId: 'provider/model',
    fetchImpl: async () => mockResponse(200, { choices: [] }),
  })

  await assert.rejects(
    respond([{ role: 'user', content: 'Hi' }]),
    (err) => err.code === 'OpenRouterInvalidResponse',
  )
})

test('does not construct a responder without model credentials', () => {
  assert.throws(
    () => createOpenRouterResponder({ apiKey: '', modelId: '' }),
    (err) => err.code === 'OpenRouterConfigurationError',
  )
})
