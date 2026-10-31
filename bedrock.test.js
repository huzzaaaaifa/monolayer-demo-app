const test = require('node:test')
const assert = require('node:assert/strict')
const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')
const { createBedrockResponder } = require('./bedrock')

test('sends chat history to the configured model and returns its text response', async () => {
  let command
  let options
  const client = {
    send: async (actualCommand, actualOptions) => {
      command = actualCommand
      options = actualOptions
      return {
        output: {
          message: {
            content: [{ text: 'Hello ' }, { text: 'from Bedrock.' }],
          },
        },
      }
    },
  }
  const respond = createBedrockResponder(client, 'test-model')

  const reply = await respond([
    { role: 'user', content: 'Say hello.' },
    { role: 'assistant', content: 'Hello.' },
    { role: 'user', content: 'Confirm the model is working.' },
  ])

  assert.ok(command instanceof ConverseCommand)
  assert.equal(command.input.modelId, 'test-model')
  assert.deepEqual(command.input.messages, [
    { role: 'user', content: [{ text: 'Say hello.' }] },
    { role: 'assistant', content: [{ text: 'Hello.' }] },
    { role: 'user', content: [{ text: 'Confirm the model is working.' }] },
  ])
  assert.equal(command.input.inferenceConfig.maxTokens, 512)
  assert.equal(reply, 'Hello from Bedrock.')
  assert.ok(options.abortSignal instanceof AbortSignal)
})

test('does not treat an empty model response as a successful answer', async () => {
  const respond = createBedrockResponder({
    send: async () => ({ output: { message: { content: [] } } }),
  }, 'test-model')

  await assert.rejects(
    respond([{ role: 'user', content: 'Hi' }]),
    /Bedrock returned an empty response/,
  )
})
