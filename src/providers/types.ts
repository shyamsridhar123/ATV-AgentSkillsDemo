/**
 * LLM Provider Types
 *
 * Type definitions for the LLM provider abstraction layer.
 * Designed to be compatible with OpenAI/Azure OpenAI API shapes (Responses API).
 */

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for LLM provider errors.
 * Used to categorize failures and determine retry behavior.
 */
export type LLMErrorCode =
  | 'AUTH_FAILED'      // Authentication/authorization failure
  | 'RATE_LIMITED'     // Rate limit exceeded
  | 'TIMEOUT'          // Request timed out
  | 'INVALID_REQUEST'  // Malformed request or invalid parameters
  | 'SERVER_ERROR'     // Provider server error (5xx)
  | 'NETWORK_ERROR';   // Network connectivity issue

/**
 * Custom error class for LLM provider errors.
 * Includes metadata for error handling and retry logic.
 */
export class LLMError extends Error {
  /** Categorized error code for programmatic handling */
  readonly code: LLMErrorCode;

  /** HTTP status code if applicable */
  readonly statusCode: number | undefined;

  /** Whether this error can be retried */
  readonly retryable: boolean;

  /** Provider that generated this error */
  readonly provider: string;

  /** Original error that caused this error */
  readonly cause?: Error;

  constructor(
    message: string,
    code: LLMErrorCode,
    provider: string,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.provider = provider;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? this.isRetryableByDefault(code);

    // Set cause for error chaining (ES2022+)
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Determines default retry behavior based on error code.
   */
  private isRetryableByDefault(code: LLMErrorCode): boolean {
    switch (code) {
      case 'RATE_LIMITED':
      case 'TIMEOUT':
      case 'SERVER_ERROR':
      case 'NETWORK_ERROR':
        return true;
      case 'AUTH_FAILED':
      case 'INVALID_REQUEST':
        return false;
      default:
        return false;
    }
  }
}

// =============================================================================
// Message Types
// =============================================================================

/**
 * Role of a message in a chat conversation.
 */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A function call within a tool call.
 */
export interface ToolCallFunction {
  /** Name of the function to call */
  name: string;

  /** JSON-encoded arguments for the function */
  arguments: string;
}

/**
 * A tool call requested by the model.
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;

  /** Type of tool (currently only 'function' is supported) */
  type: 'function';

  /** Function call details */
  function: ToolCallFunction;
}

/**
 * A message in a chat conversation.
 * Represents a single turn from system, user, assistant, or tool.
 */
export interface ChatMessage {
  /** The role of the message author */
  role: ChatRole;

  /** The content of the message */
  content: string;

  /** Optional name of the author (for multi-user conversations) */
  name?: string;

  /** Tool call ID this message is responding to (for tool role) */
  tool_call_id?: string;

  /** Tool calls requested by the assistant */
  tool_calls?: ToolCall[];
}

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * Reason the model stopped generating.
 */
export type FinishReason =
  | 'stop'           // Natural completion
  | 'tool_calls'     // Model wants to call tools
  | 'length'         // Max tokens reached
  | 'content_filter'; // Content filtered by safety system

/**
 * Delta for a tool call in a streaming response.
 * Fields are optional as they arrive incrementally.
 */
export interface ToolCallDelta {
  /** Index of the tool call in the array */
  index: number;

  /** Tool call ID (sent in first chunk) */
  id?: string;

  /** Type of tool (sent in first chunk) */
  type?: 'function';

  /** Function details (arrives incrementally) */
  function?: {
    /** Function name (sent in first chunk) */
    name?: string;

    /** Arguments (streamed incrementally) */
    arguments?: string;
  };
}

/**
 * A chunk of a streaming chat response.
 * Represents incremental content as it's generated.
 */
export interface ChatChunk {
  /** Unique identifier for this completion */
  id: string;

  /** Incremental content (null when no content in this chunk) */
  content: string | null;

  /** Role of the response (typically only in first chunk) */
  role?: ChatRole;

  /** Reason for stopping (only in final chunk) */
  finish_reason: FinishReason | null;

  /** Incremental tool call data */
  tool_calls?: ToolCallDelta[];
}

// =============================================================================
// Tool Definition Types
// =============================================================================

/**
 * JSON Schema definition for function parameters.
 * Uses Record for flexibility with standard JSON Schema properties.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Function definition within a tool.
 */
export interface ToolFunctionDefinition {
  /** Name of the function */
  name: string;

  /** Description of what the function does */
  description: string;

  /** JSON Schema describing the function parameters */
  parameters: JSONSchema;
}

/**
 * A tool definition that can be provided to the model.
 * Defines tools the model can choose to call.
 */
export interface ToolDefinition {
  /** Type of tool (currently only 'function' is supported) */
  type: 'function';

  /** Function definition */
  function: ToolFunctionDefinition;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Supported LLM providers.
 */
export type LLMProvider = 'azure-openai';

/**
 * Configuration for an LLM provider connection.
 * Contains credentials, model selection, and generation parameters.
 */
export interface LLMConfig {
  /** The LLM provider to use */
  provider: LLMProvider;

  /** Model or deployment name */
  model: string;

  /** API endpoint URL */
  endpoint: string;

  /** API key for authentication */
  apiKey: string;

  /** API version (required for Azure OpenAI) */
  apiVersion?: string;

  /** Sampling temperature (0-2, default varies by provider) */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Top-p (nucleus) sampling parameter (0-1) */
  topP?: number;

  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;

  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Token usage statistics for a completion.
 */
export interface TokenUsage {
  /** Number of tokens in the prompt */
  prompt_tokens: number;

  /** Number of tokens in the completion */
  completion_tokens: number;

  /** Total tokens used (prompt + completion) */
  total_tokens: number;
}

/**
 * A choice within an LLM response.
 * Represents one possible completion (typically just one for chat).
 */
export interface LLMResponseChoice {
  /** Index of this choice */
  index: number;

  /** The generated message */
  message: ChatMessage;

  /** Reason the model stopped generating */
  finish_reason: FinishReason;
}

/**
 * Full (non-streaming) response from an LLM.
 */
export interface LLMResponse {
  /** Unique identifier for this completion */
  id: string;

  /** List of completion choices */
  choices: LLMResponseChoice[];

  /** Token usage statistics */
  usage: TokenUsage;
}
