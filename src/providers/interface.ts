/**
 * LLM Provider Interface
 *
 * Abstract base class and interfaces for LLM provider implementations.
 * Designed to be provider-agnostic, enabling support for Azure OpenAI,
 * Claude, Ollama, and other providers.
 */

import type {
  ChatMessage,
  ChatChunk,
  ToolDefinition,
  LLMResponse,
  LLMConfig,
} from './types.js';

// =============================================================================
// Request Options
// =============================================================================

/**
 * Options for a chat completion request.
 *
 * These options allow overriding the provider's default configuration
 * on a per-request basis. All fields are optional.
 */
export interface ChatRequestOptions {
  /** Tool definitions for function calling */
  tools?: ToolDefinition[];

  /** Sampling temperature (0-2). Higher = more creative, lower = more deterministic */
  temperature?: number;

  /** Maximum tokens to generate in the completion */
  maxTokens?: number;

  /** Top-p (nucleus) sampling. Only sample from tokens comprising top-p probability mass */
  topP?: number;

  /** Frequency penalty (-2 to 2). Reduces repetition based on token frequency */
  frequencyPenalty?: number;

  /** Presence penalty (-2 to 2). Reduces repetition based on token presence */
  presencePenalty?: number;

  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Abstract base class for LLM provider implementations.
 *
 * Provides a unified interface for interacting with different LLM providers.
 * Concrete implementations handle provider-specific API details while
 * conforming to this common contract.
 *
 * @example
 * ```typescript
 * class AzureOpenAIProvider extends LLMProviderBase {
 *   get name() { return 'azure-openai'; }
 *   get isConfigured() { return !!this.config.apiKey; }
 *
 *   async chat(messages, options) {
 *     // Azure-specific implementation
 *   }
 *
 *   async *chatStream(messages, options) {
 *     // Azure-specific streaming implementation
 *   }
 *
 *   async countTokens(messages) {
 *     // Token counting implementation
 *   }
 * }
 * ```
 */
export abstract class LLMProviderBase {
  /** Provider configuration */
  protected readonly config: LLMConfig;

  /**
   * Create a new provider instance.
   *
   * @param config - Provider configuration including credentials and model settings
   */
  constructor(config: LLMConfig) {
    this.config = config;
  }

  // ===========================================================================
  // Abstract Properties
  // ===========================================================================

  /**
   * Unique identifier for this provider.
   *
   * Used for logging, error messages, and provider selection.
   *
   * @example 'azure-openai', 'claude', 'ollama'
   */
  abstract get name(): string;

  /**
   * Check if the provider has valid configuration.
   *
   * Returns true if all required configuration fields are present
   * and properly formatted. Does not validate credentials with the API.
   */
  abstract get isConfigured(): boolean;

  // ===========================================================================
  // Abstract Methods
  // ===========================================================================

  /**
   * Send a non-streaming chat completion request.
   *
   * Sends the conversation history to the LLM and returns the complete
   * response when generation finishes. Use this for simple request/response
   * patterns where streaming is not needed.
   *
   * @param messages - Conversation history as an array of chat messages
   * @param options - Optional request configuration overrides
   * @returns The complete LLM response including message and usage stats
   * @throws {LLMError} On API errors (rate limit, auth, network, etc.)
   *
   * @example
   * ```typescript
   * const response = await provider.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Hello!' }
   * ]);
   * console.log(response.choices[0].message.content);
   * ```
   */
  abstract chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): Promise<LLMResponse>;

  /**
   * Send a streaming chat completion request.
   *
   * Sends the conversation history to the LLM and yields response chunks
   * as they are generated. Use this for real-time output display or
   * when handling large responses.
   *
   * @param messages - Conversation history as an array of chat messages
   * @param options - Optional request configuration overrides
   * @yields ChatChunk objects containing incremental response content
   * @throws {LLMError} On API errors (rate limit, auth, network, etc.)
   *
   * @example
   * ```typescript
   * const stream = provider.chatStream([
   *   { role: 'user', content: 'Write a poem' }
   * ]);
   *
   * for await (const chunk of stream) {
   *   if (chunk.content) {
   *     process.stdout.write(chunk.content);
   *   }
   * }
   * ```
   */
  abstract chatStream(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<ChatChunk, void, undefined>;

  /**
   * Count the number of tokens in a message array.
   *
   * Estimates token usage before sending a request. Useful for:
   * - Checking if messages fit within context limits
   * - Managing conversation history (trimming old messages)
   * - Cost estimation
   *
   * Note: Token counting is model-specific. The implementation should
   * use the appropriate tokenizer for the configured model.
   *
   * @param messages - Messages to count tokens for
   * @returns Estimated token count
   *
   * @example
   * ```typescript
   * const count = await provider.countTokens(messages);
   * if (count > 100000) {
   *   // Trim conversation history
   * }
   * ```
   */
  abstract countTokens(messages: ChatMessage[]): Promise<number>;

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the configured model name or deployment.
   *
   * Returns the model specified in the provider configuration.
   */
  get model(): string {
    return this.config.model;
  }

  /**
   * Get a redacted summary of the configuration for logging.
   *
   * Returns configuration information safe for logging, with
   * sensitive values (API keys, endpoints) masked.
   */
  getConfigSummary(): Record<string, string> {
    return {
      provider: this.name,
      model: this.config.model,
      endpoint: this.maskEndpoint(this.config.endpoint),
      apiKey: this.config.apiKey ? '***' : '(not set)',
    };
  }

  /**
   * Mask an endpoint URL for safe logging.
   *
   * Preserves the host but masks path segments to avoid leaking
   * deployment names or resource identifiers.
   *
   * @param endpoint - Full endpoint URL
   * @returns Masked endpoint safe for logging
   */
  private maskEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return `${url.protocol}//${url.host}/***`;
    } catch {
      return '(invalid url)';
    }
  }
}

// =============================================================================
// Provider Factory Types
// =============================================================================

/**
 * Factory function type for creating provider instances.
 *
 * Used by the provider registry to instantiate providers from configuration.
 */
export type ProviderFactory = (config: LLMConfig) => LLMProviderBase;

/**
 * Registry of available provider factories.
 *
 * Maps provider names to their factory functions, enabling
 * dynamic provider instantiation based on configuration.
 */
export type ProviderRegistry = Map<string, ProviderFactory>;
