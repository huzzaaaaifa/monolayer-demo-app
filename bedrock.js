const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

function bedrockFailure(err) {
  const code = typeof err?.name === 'string' ? err.name : 'BedrockRequestError'
  const requestId = typeof err?.$metadata?.requestId === 'string'
    ? err.$metadata.requestId
    : undefined
  const messages = {
    AccessDeniedException:
      'AWS denied the Bedrock request. Check that the connected model is enabled for your account and the service runtime role allows bedrock:InvokeModel; update the AWS connect stack if needed, then redeploy.',
    CredentialsProviderError:
      'The app could not obtain AWS credentials. Check the service runtime role and redeploy the service.',
    ResourceNotFoundException:
      'Bedrock could not find this model in the configured region. Re-select a model from the current AWS model list and redeploy.',
    ValidationException:
      'Bedrock rejected this request. The selected model may not support the Converse API or may require an inference profile; choose a compatible model from the Canvas list.',
    ModelNotReadyException:
      'The Bedrock model is not ready yet. Wait briefly and try again.',
    ModelTimeoutException:
      'The Bedrock model timed out. Try again with a shorter message.',
    ServiceQuotaExceededException:
      'The Bedrock account quota was reached. Check the model quota in AWS or try again later.',
    ThrottlingException:
      'Bedrock is throttling requests. Wait briefly and try again.',
    ServiceUnavailableException:
      'Bedrock is temporarily unavailable. Try again shortly.',
    InternalServerException:
      'Bedrock encountered a temporary error. Try again shortly.',
  }

  return {
    code,
    requestId,
    message: Object.hasOwn(messages, code)
      ? messages[code]
      : 'The Bedrock request failed. Check the service logs for its AWS error code and try again.',
  }
}

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

module.exports = { bedrockFailure, createBedrockResponder }
