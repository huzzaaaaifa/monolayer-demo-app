const test = require('node:test')
const assert = require('node:assert/strict')
const { createBedrockResponder, bedrockFailure } = require('./bedrock')

test('sends chat history to the selected Bedrock model using Converse', async () => {
  let command
  const respond = createBedrockResponder({
    modelId: 'anthropic.claude-model',
    region: 'us-east-1',
    client: {
      send: async (request) => {
        command = request
        return {
          output: {
            message: {
              content: [{ text: 'Hello ' }, { text: 'from Bedrock.' }],
            },
          },
        }
      },
    },
  })

  const reply = await respond([
    { role: 'user', content: 'Test the model.' },
    { role: 'assistant', content: 'Ready.' },
    { role: 'user', content: 'Confirm it works.' },
  ])

  assert.equal(command.constructor.name, 'ConverseCommand')
  assert.equal(command.input.modelId, 'anthropic.claude-model')
  assert.deepEqual(command.input.messages, [
    { role: 'user', content: [{ text: 'Test the model.' }] },
    { role: 'assistant', content: [{ text: 'Ready.' }] },
    { role: 'user', content: [{ text: 'Confirm it works.' }] },
  ])
  assert.deepEqual(command.input.inferenceConfig, { maxTokens: 512, temperature: 0.4 })
  assert.equal(reply, 'Hello from Bedrock.')
})

test('requires a Bedrock model and region', () => {
  assert.throws(
    () => createBedrockResponder({ modelId: '', region: '' }),
    (err) => err.code === 'BedrockConfigurationError',
  )
})

test('maps Bedrock access errors without exposing provider details', async () => {
  const respond = createBedrockResponder({
    modelId: 'anthropic.claude-model',
    region: 'us-east-1',
    client: {
      send: async () => {
        const error = new Error('sensitive provider detail')
        error.name = 'AccessDeniedException'
        error.$metadata = { httpStatusCode: 403, requestId: 'bedrock-request-123' }
        throw error
      },
    },
  })

  await assert.rejects(respond([{ role: 'user', content: 'Hi' }]), (err) => {
    const failure = bedrockFailure(err)
    assert.equal(failure.status, 403)
    assert.equal(failure.code, 'BedrockAccessError')
    assert.equal(failure.requestId, 'bedrock-request-123')
    assert.match(failure.message, /AWS Bedrock denied access/)
    assert.doesNotMatch(failure.message, /sensitive provider detail/)
    return true
  })
})

test('rejects empty Bedrock text responses', async () => {
  const respond = createBedrockResponder({
    modelId: 'anthropic.claude-model',
    region: 'us-east-1',
    client: { send: async () => ({ output: { message: { content: [] } } }) },
  })

  await assert.rejects(
    respond([{ role: 'user', content: 'Hi' }]),
    (err) => err.name === 'BedrockInvalidResponse',
  )
})
