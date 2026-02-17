/**
 * LLM Provider Module
 *
 * Barrel exports for the LLM provider abstraction layer.
 * Provides Azure OpenAI integration with Entra ID authentication.
 */

// Types
export type {
  LLMErrorCode,
  ChatRole,
  ToolCallFunction,
  ToolCall,
  ChatMessage,
  FinishReason,
  ToolCallDelta,
  ChatChunk,
  JSONSchema,
  ToolFunctionDefinition,
  ToolDefinition,
  LLMProvider,
  LLMConfig,
  TokenUsage,
  LLMResponseChoice,
  LLMResponse,
} from './types.js';

export { LLMError } from './types.js';

// Interface
export type {
  ChatRequestOptions,
  ProviderFactory,
  ProviderRegistry,
} from './interface.js';

export { LLMProviderBase } from './interface.js';

// Retry
export type { RetryOptions } from './retry.js';

export {
  RetryError,
  calculateDelay,
  isTransientError,
  retry,
} from './retry.js';

// Streaming
export type { CollectedStreamResult } from './streaming.js';

export {
  StreamAccumulator,
  collectStream,
  mapStream,
} from './streaming.js';

// Config
export type { ProviderConfig } from './config.js';

export {
  ConfigError,
  parseDotEnv,
  loadConfig,
} from './config.js';

// Azure OpenAI Provider
export { AzureOpenAIProvider } from './azure.js';
