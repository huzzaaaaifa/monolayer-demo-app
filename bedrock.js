const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime')

function bedrockFailure(err) {
  const status = Number.isInteger(err?.$metadata?.httpStatusCode)
    ? err.$metadata.httpStatusCode
    : 502
  const code = typeof err?.name === 'string' ? err.name : 'BedrockRequestError'
  const requestId = typeof err?.$metadata?.requestId === 'string'
    ? err.$metadata.requestId
    : undefined
  const failures = {
    AccessDeniedException: {
      status: 403,
      code: 'BedrockAccessError',
      message: 'AWS Bedrock denied access. Check model access and the service AWS role permissions in the configured region.',
    },
    CredentialsProviderError: {
      status: 503,
      code: 'BedrockCredentialsError',
      message: 'The service could not obtain AWS role credentials. Check the service deployment role, then retry.',
    },
    CredentialsError: {
      status: 503,
      code: 'BedrockCredentialsError',
      message: 'The service could not obtain AWS role credentials. Check the service deployment role, then retry.',
    },
    InvalidSignatureException: {
      status: 503,
      code: 'BedrockCredentialsError',
      message: 'AWS rejected the service credentials. Check the service deployment role, then retry.',
    },
    ModelNotReadyException: {
      status: 503,
      code: 'BedrockUpstreamError',
      message: 'The Bedrock model is not ready. Wait briefly and try again.',
    },
    ResourceNotFoundException: {
      status: 404,
      code: 'BedrockModelError',
      message: 'The Bedrock model was not found in the configured region. Check the selected model and region.',
    },
    ServiceUnavailableException: {
      status: 503,
      code: 'BedrockUpstreamError',
      message: 'AWS Bedrock is temporarily unavailable. Try again shortly.',
    },
    ThrottlingException: {
      status: 429,
      code: 'BedrockRateLimitError',
      message: 'AWS Bedrock is rate limiting requests. Wait briefly and try again.',
    },
    ValidationException: {
      status: 400,
      code: 'BedrockModelCompatibilityError',
      message: 'Bedrock could not use this model with the Converse API. Choose a compatible model or inference profile in Canvas and redeploy.',
    },
  }
  const mapped = Object.hasOwn(failures, code) ? failures[code] : undefined

  return {
    status: mapped?.status || status,
    code: mapped?.code || code,
    requestId,
    message: mapped?.message ||
      'The Bedrock request failed. Check model access, the connected AWS role, and the service logs, then retry.',
  }
}

function createBedrockResponder({ modelId, region, client }) {
  if (!modelId || !region) {
    const error = new Error('Bedrock model configuration is missing')
    error.code = 'BedrockConfigurationError'
    throw error
  }

  const bedrockClient = client || new BedrockRuntimeClient({ region })

  return async (messages) => {
    let response
    try {
      response = await bedrockClient.send(new ConverseCommand({
        modelId,
        messages: messages.map(({ role, content }) => ({
          role,
          content: [{ text: content }],
        })),
        inferenceConfig: {
          maxTokens: 512,
          temperature: 0.4,
        },
      }))
    } catch (cause) {
      const error = new Error('Bedrock request could not be completed')
      error.name = cause?.name || 'BedrockRequestError'
      error.$metadata = cause?.$metadata
      error.cause = cause
      throw error
    }

    const reply = response?.output?.message?.content
      ?.filter((block) => typeof block?.text === 'string')
      .map((block) => block.text)
      .join('')
    if (typeof reply !== 'string' || !reply.trim()) {
      const error = new Error('Bedrock returned no text reply')
      error.name = 'BedrockInvalidResponse'
      error.$metadata = response?.$metadata
      throw error
    }
    return reply.trim()
  }
}

module.exports = { createBedrockResponder, bedrockFailure }
