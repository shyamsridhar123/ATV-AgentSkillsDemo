/**
 * Retry Utility for LLM API Calls
 *
 * Provides exponential backoff retry logic with jitter for handling
 * transient errors in LLM API calls. Designed to prevent thundering herd
 * problems and gracefully handle rate limits and temporary failures.
 */

/**
 * Network error codes that indicate transient failures.
 */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
  'EAI_AGAIN',
]);

/**
 * HTTP status codes that indicate retryable errors.
 */
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/**
 * Options for configuring retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelay?: number;

  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;

  /** Whether to add randomized jitter to prevent thundering herd (default: true) */
  jitter?: boolean;

  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];

  /** Optional callback invoked before each retry attempt */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * Error thrown when all retry attempts have been exhausted.
 */
export class RetryError extends Error {
  /** Number of attempts made before giving up */
  readonly attempts: number;

  /** The last error that caused the final retry to fail */
  readonly lastError: Error;

  /**
   * Create a new RetryError
   * @param message - Human-readable error message
   * @param attempts - Number of retry attempts made
   * @param lastError - The error from the final attempt
   */
  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RetryError);
    }
  }
}

/**
 * Shape of an error object with an optional status code property.
 * Used for type-safe status code extraction from various error types.
 */
interface ErrorWithStatus {
  statusCode?: number;
  status?: number;
  code?: string;
}

/**
 * Calculate the delay before the next retry attempt.
 *
 * Uses exponential backoff: `baseDelay * 2^attempt`, capped at `maxDelay`.
 * When jitter is enabled, multiplies by a random factor between 0.5 and 1.5.
 *
 * @param attempt - Zero-based attempt number (0 = first retry)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @param jitter - Whether to apply random jitter
 * @returns Calculated delay in milliseconds
 *
 * @example
 * ```typescript
 * // First retry, base 1000ms, no jitter
 * calculateDelay(0, 1000, 30000, false); // 1000
 *
 * // Second retry, base 1000ms, no jitter
 * calculateDelay(1, 1000, 30000, false); // 2000
 *
 * // With jitter, result varies between 500-1500 for first retry
 * calculateDelay(0, 1000, 30000, true); // 500-1500
 * ```
 */
export function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Apply jitter: multiply by random factor between 0.5 and 1.5
  if (jitter) {
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(cappedDelay * jitterFactor);
  }

  return cappedDelay;
}

/**
 * Determine if an error is transient and should be retried.
 *
 * Checks for:
 * - HTTP status codes: 429 (rate limit), 500, 502, 503, 504 (server errors)
 * - Network errors: ECONNRESET, ETIMEDOUT, ECONNREFUSED, etc.
 *
 * @param error - The error to check
 * @param retryableStatuses - HTTP status codes considered retryable
 * @returns True if the error is transient and should be retried
 *
 * @example
 * ```typescript
 * // HTTP 429 Too Many Requests
 * const rateLimitError = new Error('Rate limited');
 * (rateLimitError as any).status = 429;
 * isTransientError(rateLimitError); // true
 *
 * // Network error
 * const networkError = new Error('Connection reset');
 * (networkError as any).code = 'ECONNRESET';
 * isTransientError(networkError); // true
 *
 * // Client error (not retryable)
 * const clientError = new Error('Bad request');
 * (clientError as any).status = 400;
 * isTransientError(clientError); // false
 * ```
 */
export function isTransientError(
  error: Error,
  retryableStatuses: number[] = DEFAULT_RETRYABLE_STATUSES
): boolean {
  const errorWithStatus = error as ErrorWithStatus;

  // Check for HTTP status codes
  const statusCode = errorWithStatus.statusCode ?? errorWithStatus.status;
  if (statusCode !== undefined && retryableStatuses.includes(statusCode)) {
    return true;
  }

  // Check for network error codes
  const errorCode = errorWithStatus.code;
  if (errorCode !== undefined && TRANSIENT_ERROR_CODES.has(errorCode)) {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration.
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with automatic retry on transient failures.
 *
 * Uses exponential backoff with optional jitter to retry failed operations.
 * Only retries on transient errors (rate limits, server errors, network issues).
 *
 * @typeParam T - The return type of the async function
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the successful function call
 * @throws {RetryError} When all retry attempts are exhausted
 * @throws {Error} When a non-transient error occurs
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await retry(() => fetchFromLLM(prompt));
 *
 * // With custom options
 * const result = await retry(
 *   () => fetchFromLLM(prompt),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 2000,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  // Total attempts = 1 initial + maxRetries
  const totalAttempts = maxRetries + 1;

  while (attempt < totalAttempts) {
    try {
      return await fn();
    } catch (error) {
      // Ensure we have an Error object
      const errorObj = error instanceof Error ? error : new Error(String(error));
      lastError = errorObj;

      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        throw new RetryError(
          `All ${totalAttempts} attempts failed. Last error: ${errorObj.message}`,
          totalAttempts,
          errorObj
        );
      }

      // Check if error is retryable
      if (!isTransientError(errorObj, retryableStatuses)) {
        // Non-transient error, don't retry
        throw errorObj;
      }

      // Calculate delay for next retry
      const delay = calculateDelay(attempt, baseDelay, maxDelay, jitter);

      // Invoke onRetry callback if provided
      if (onRetry) {
        onRetry(errorObj, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);

      attempt++;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new RetryError(
    `All ${totalAttempts} attempts failed.`,
    totalAttempts,
    lastError ?? new Error('Unknown error')
  );
}
