/**
 * Azure OpenAI Provider
 *
 * LLM provider implementation for Azure OpenAI using the Responses API.
 * Uses Entra ID authentication via TokenCredential.
 */

import { AzureOpenAI } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
  ChatCompletionTool,
  ChatCompletion,
  ChatCompletionMessageToolCall,
} from 'openai/resources/index';
import { getBearerTokenProvider } from '@azure/identity';

import type {
  ChatMessage,
  ChatChunk,
  LLMResponse,
  LLMConfig,
  ToolCallDelta,
  FinishReason,
  LLMErrorCode,
} from './types.js';
import { LLMError } from './types.js';
import { LLMProviderBase, type ChatRequestOptions } from './interface.js';
import { retry, isTransientError } from './retry.js';

// =============================================================================
// Constants
// =============================================================================

/** Azure Cognitive Services scope for token acquisition */
const AZURE_COGNITIVE_SERVICES_SCOPE =
  'https://cognitiveservices.azure.com/.default';

/** Provider name identifier */
const PROVIDER_NAME = 'azure-openai';

// =============================================================================
// Azure OpenAI Provider
// =============================================================================

/**
 * Azure OpenAI provider implementation.
 *
 * Uses the OpenAI SDK's AzureOpenAI client with Entra ID authentication.
 * Supports both streaming and non-streaming chat completions with tool calling.
 *
 * @example
 * ```typescript
 * import { DefaultAzureCredential } from '@azure/identity';
 *
 * const provider = new AzureOpenAIProvider({
 *   provider: 'azure-openai',
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   model: 'gpt-4',
 *   credential: new DefaultAzureCredential(),
 *   apiVersion: '2025-03-01-preview',
 * });
 *
 * const response = await provider.chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export class AzureOpenAIProvider extends LLMProviderBase {
  /** Azure OpenAI client instance */
  private client: AzureOpenAI;

  /**
   * Create a new Azure OpenAI provider instance.
   *
   * @param config - Provider configuration with Entra ID credentials
   */
  constructor(config: LLMConfig) {
    super(config);

    // Create token provider from TokenCredential
    const tokenProvider = getBearerTokenProvider(
      config.credential,
      AZURE_COGNITIVE_SERVICES_SCOPE
    );

    // Initialize AzureOpenAI client with Entra ID auth
    this.client = new AzureOpenAI({
      endpoint: config.endpoint,
      deployment: config.model,
      apiVersion: config.apiVersion ?? '2025-03-01-preview',
      azureADTokenProvider: tokenProvider,
    });
  }

  // ===========================================================================
  // Abstract Property Implementations
  // ===========================================================================

  /**
   * Provider identifier.
   */
  get name(): string {
    return PROVIDER_NAME;
  }

  /**
   * Check if the provider is properly configured.
   *
   * Validates that endpoint, model, and credential are present.
   */
  get isConfigured(): boolean {
    return Boolean(
      this.config.endpoint &&
        this.config.model &&
        this.config.credential
    );
  }

  // ===========================================================================
  // Abstract Method Implementations
  // ===========================================================================

  /**
   * Send a non-streaming chat completion request.
   *
   * @param messages - Conversation history
   * @param options - Request options (tools, temperature, etc.)
   * @returns Complete LLM response with message and usage stats
   * @throws {LLMError} On API errors
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): Promise<LLMResponse> {
    return retry(
      async () => {
        try {
          const response = await this.client.chat.completions.create(
            {
              model: this.config.model,
              messages: this.mapMessages(messages),
              tools: options?.tools ? this.mapTools(options.tools) : undefined,
              temperature: options?.temperature ?? this.config.temperature,
              max_tokens: options?.maxTokens ?? this.config.maxTokens,
              top_p: options?.topP ?? this.config.topP,
              frequency_penalty:
                options?.frequencyPenalty ?? this.config.frequencyPenalty,
              presence_penalty:
                options?.presencePenalty ?? this.config.presencePenalty,
              stream: false,
            },
            {
              signal: options?.signal,
            }
          );

          return this.mapResponse(response);
        } catch (error) {
          throw this.wrapError(error);
        }
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt, delay) => {
          // Could add logging here if needed
          void error;
          void attempt;
          void delay;
        },
      }
    );
  }

  /**
   * Send a streaming chat completion request.
   *
   * @param messages - Conversation history
   * @param options - Request options (tools, temperature, etc.)
   * @yields ChatChunk objects with incremental content
   * @throws {LLMError} On API errors
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<ChatChunk, void, undefined> {
    let stream: AsyncIterable<ChatCompletionChunk>;

    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages: this.mapMessages(messages),
          tools: options?.tools ? this.mapTools(options.tools) : undefined,
          temperature: options?.temperature ?? this.config.temperature,
          max_tokens: options?.maxTokens ?? this.config.maxTokens,
          top_p: options?.topP ?? this.config.topP,
          frequency_penalty:
            options?.frequencyPenalty ?? this.config.frequencyPenalty,
          presence_penalty:
            options?.presencePenalty ?? this.config.presencePenalty,
          stream: true,
        },
        {
          signal: options?.signal,
        }
      );
    } catch (error) {
      throw this.wrapError(error);
    }

    try {
      for await (const chunk of stream) {
        yield this.mapChunk(chunk);
      }
    } catch (error) {
      // Handle errors during streaming
      const wrappedError = this.wrapError(error);

      // If it's a transient error, we could potentially retry,
      // but for streaming we throw immediately
      throw wrappedError;
    }
  }

  /**
   * Estimate token count for messages.
   *
   * Uses a rough estimation based on character count divided by 4.
   * This is an approximation suitable for basic usage tracking and
   * context window management.
   *
   * @param messages - Messages to count tokens for
   * @returns Estimated token count
   */
  async countTokens(messages: ChatMessage[]): Promise<number> {
    // Rough estimation: ~4 characters per token on average
    // This is a common heuristic for English text with GPT models
    let totalChars = 0;

    for (const message of messages) {
      // Count content
      totalChars += message.content.length;

      // Count role (approximate overhead)
      totalChars += message.role.length + 4; // ~4 chars for formatting

      // Count name if present
      if (message.name) {
        totalChars += message.name.length + 2;
      }

      // Count tool calls if present
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          totalChars += toolCall.function.name.length;
          totalChars += toolCall.function.arguments.length;
          totalChars += 20; // Overhead for structure
        }
      }

      // Count tool_call_id if present
      if (message.tool_call_id) {
        totalChars += message.tool_call_id.length + 4;
      }
    }

    // Divide by 4 and round up for safety
    return Math.ceil(totalChars / 4);
  }

  // ===========================================================================
  // Message Mapping
  // ===========================================================================

  /**
   * Map internal ChatMessage format to OpenAI API format.
   *
   * @param messages - Internal message format
   * @returns OpenAI-compatible message array
   */
  private mapMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    return messages.map((msg): ChatCompletionMessageParam => {
      switch (msg.role) {
        case 'system':
          return {
            role: 'system',
            content: msg.content,
          };

        case 'user':
          return {
            role: 'user',
            content: msg.content,
            name: msg.name,
          };

        case 'assistant':
          return {
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.tool_calls?.map((tc) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          };

        case 'tool':
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.tool_call_id ?? '',
          };

        default:
          // TypeScript should catch this, but just in case
          return {
            role: 'user',
            content: msg.content,
          };
      }
    });
  }

  /**
   * Map internal ToolDefinition format to OpenAI API format.
   *
   * @param tools - Internal tool definitions
   * @returns OpenAI-compatible tool array
   */
  private mapTools(
    tools: NonNullable<ChatRequestOptions['tools']>
  ): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map OpenAI API response to internal LLMResponse format.
   *
   * @param response - OpenAI API response
   * @returns Internal response format
   */
  private mapResponse(response: ChatCompletion): LLMResponse {
    return {
      id: response.id,
      choices: response.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content ?? '',
          tool_calls: this.mapToolCalls(choice.message.tool_calls),
        },
        // finish_reason is required in LLMResponseChoice; default to 'stop' if not provided
        finish_reason: this.mapFinishReason(choice.finish_reason) ?? 'stop',
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  /**
   * Map tool calls from OpenAI format, filtering out non-function types.
   *
   * @param toolCalls - OpenAI tool calls array
   * @returns Internal tool calls array or undefined
   */
  private mapToolCalls(
    toolCalls: ChatCompletion.Choice['message']['tool_calls']
  ): ChatMessage['tool_calls'] {
    if (!toolCalls) {
      return undefined;
    }

    // Filter to only function-type tool calls and map to internal format
    type FunctionToolCall = ChatCompletionMessageToolCall & {
      type: 'function';
      function: { name: string; arguments: string };
    };

    const functionCalls = toolCalls.filter(
      (tc: ChatCompletionMessageToolCall): tc is FunctionToolCall =>
        tc.type === 'function' && 'function' in tc
    );

    if (functionCalls.length === 0) {
      return undefined;
    }

    return functionCalls.map((tc: FunctionToolCall) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }

  /**
   * Map OpenAI streaming chunk to internal ChatChunk format.
   *
   * @param chunk - OpenAI streaming chunk
   * @returns Internal chunk format
   */
  private mapChunk(chunk: ChatCompletionChunk): ChatChunk {
    const choice = chunk.choices[0];

    if (!choice) {
      // Empty chunk (can happen at start/end)
      return {
        id: chunk.id,
        content: null,
        finish_reason: null,
      };
    }

    const delta = choice.delta;

    // Map tool call deltas if present
    let toolCallDeltas: ToolCallDelta[] | undefined;
    if (delta.tool_calls) {
      toolCallDeltas = delta.tool_calls.map(
        (tc: ChatCompletionChunk.Choice.Delta.ToolCall) => ({
          index: tc.index,
          id: tc.id,
          type: tc.type,
          function: tc.function
            ? {
                name: tc.function.name,
                arguments: tc.function.arguments,
              }
            : undefined,
        })
      );
    }

    return {
      id: chunk.id,
      content: delta.content ?? null,
      role: delta.role as ChatChunk['role'],
      finish_reason: this.mapFinishReason(choice.finish_reason),
      tool_calls: toolCallDeltas,
    };
  }

  /**
   * Map OpenAI finish reason to internal FinishReason type.
   *
   * @param reason - OpenAI finish reason string
   * @returns Internal finish reason or null
   */
  private mapFinishReason(
    reason: string | null | undefined
  ): FinishReason | null {
    if (!reason) {
      return null;
    }

    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        // Unknown reason, treat as stop
        return 'stop';
    }
  }

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  /**
   * Wrap an error from the OpenAI SDK into an LLMError.
   *
   * Maps HTTP status codes and error types to appropriate LLMErrorCode values.
   *
   * @param error - The original error
   * @returns Wrapped LLMError
   */
  private wrapError(error: unknown): LLMError {
    // If already an LLMError, return as-is
    if (error instanceof LLMError) {
      return error;
    }

    // Handle non-Error objects
    if (!(error instanceof Error)) {
      return new LLMError(
        String(error),
        'SERVER_ERROR',
        PROVIDER_NAME,
        { retryable: false }
      );
    }

    // Extract status code from OpenAI error structure
    const statusCode = this.extractStatusCode(error);
    const code = this.mapStatusToErrorCode(statusCode, error);
    const retryable = isTransientError(error);

    return new LLMError(error.message, code, PROVIDER_NAME, {
      statusCode,
      retryable,
      cause: error,
    });
  }

  /**
   * Extract HTTP status code from various error types.
   *
   * @param error - Error object to inspect
   * @returns HTTP status code or undefined
   */
  private extractStatusCode(error: Error): number | undefined {
    // OpenAI SDK errors have a 'status' property
    const errorWithStatus = error as Error & {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
    };

    return (
      errorWithStatus.status ??
      errorWithStatus.statusCode ??
      errorWithStatus.response?.status
    );
  }

  /**
   * Map HTTP status code to LLMErrorCode.
   *
   * @param statusCode - HTTP status code
   * @param error - Original error for additional context
   * @returns Appropriate LLMErrorCode
   */
  private mapStatusToErrorCode(
    statusCode: number | undefined,
    error: Error
  ): LLMErrorCode {
    // Map by status code first
    if (statusCode !== undefined) {
      switch (statusCode) {
        case 401:
        case 403:
          return 'AUTH_FAILED';
        case 429:
          return 'RATE_LIMITED';
        case 408:
          return 'TIMEOUT';
        case 400:
        case 422:
          return 'INVALID_REQUEST';
        case 500:
        case 502:
        case 503:
        case 504:
          return 'SERVER_ERROR';
        default:
          if (statusCode >= 400 && statusCode < 500) {
            return 'INVALID_REQUEST';
          }
          if (statusCode >= 500) {
            return 'SERVER_ERROR';
          }
      }
    }

    // Check for network errors by error code
    const errorWithCode = error as Error & { code?: string };
    const networkErrorCodes = new Set([
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN',
    ]);

    if (errorWithCode.code && networkErrorCodes.has(errorWithCode.code)) {
      return 'NETWORK_ERROR';
    }

    // Check error message for timeout indicators
    if (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
    ) {
      return 'TIMEOUT';
    }

    // Default to server error for unknown cases
    return 'SERVER_ERROR';
  }
}
