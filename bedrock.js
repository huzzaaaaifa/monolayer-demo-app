const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

function createBedrockResponder(client, modelId) {
  return async (messages) => {
    const response = await client.send(new ConverseCommand({
      modelId,
      messages: messages.map(({ role, content }) => ({
        role,
        content: [{ text: content }],
      })),
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.4,
      },
    }), { abortSignal: AbortSignal.timeout(30_000) })

    const reply = (response.output?.message?.content || [])
      .filter((block) => typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim()

    if (!reply) throw new Error('Bedrock returned an empty response')
    return reply
  }
}

module.exports = { createBedrockResponder }
