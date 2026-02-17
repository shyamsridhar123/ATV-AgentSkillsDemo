/**
 * Stream Handler Utilities for LLM Streaming Responses
 *
 * Provides utilities for processing incremental streaming responses from LLM APIs.
 * Handles content accumulation, tool call assembly from deltas, and stream transformation.
 */

import type {
  ChatChunk,
  ChatRole,
  FinishReason,
  ToolCall,
  ToolCallDelta,
} from './types.js';

// =============================================================================
// StreamAccumulator Class
// =============================================================================

/**
 * Accumulates streamed chat response chunks into a complete response.
 *
 * Handles the complexity of:
 * - Concatenating content chunks as they arrive
 * - Assembling tool calls from incremental deltas (by index)
 * - Tracking the finish reason from the final chunk
 * - Managing multiple in-flight tool calls simultaneously
 *
 * @example
 * ```typescript
 * const accumulator = new StreamAccumulator();
 *
 * for await (const chunk of stream) {
 *   accumulator.processChunk(chunk);
 * }
 *
 * console.log(accumulator.getContent());
 * console.log(accumulator.getToolCalls());
 * console.log(accumulator.getFinishReason());
 * ```
 */
export class StreamAccumulator {
  /** Accumulated text content from all chunks */
  private content: string = '';

  /** Map of tool call index to partially assembled tool call */
  private toolCallMap: Map<number, PartialToolCall> = new Map();

  /** Finish reason from the final chunk */
  private finishReason: FinishReason | null = null;

  /** Role from the response (typically from first chunk) */
  private role: ChatRole = 'assistant';

  /**
   * Process a single chunk from the stream.
   *
   * Updates internal state with any content, tool call deltas,
   * role, or finish reason present in the chunk.
   *
   * @param chunk - The chat chunk to process
   */
  processChunk(chunk: ChatChunk): void {
    // Accumulate text content
    if (chunk.content !== null) {
      this.content += chunk.content;
    }

    // Track role (typically only in first chunk)
    if (chunk.role !== undefined) {
      this.role = chunk.role;
    }

    // Track finish reason (only in final chunk)
    if (chunk.finish_reason !== null) {
      this.finishReason = chunk.finish_reason;
    }

    // Process tool call deltas
    if (chunk.tool_calls !== undefined) {
      for (const delta of chunk.tool_calls) {
        this.processToolCallDelta(delta);
      }
    }
  }

  /**
   * Process a tool call delta and merge it into the accumulated state.
   *
   * Tool calls arrive incrementally:
   * - First chunk: id, type, function.name
   * - Subsequent chunks: function.arguments (appended)
   *
   * @param delta - The tool call delta to process
   */
  private processToolCallDelta(delta: ToolCallDelta): void {
    const { index } = delta;

    // Get or create the partial tool call for this index
    let partial = this.toolCallMap.get(index);

    if (partial === undefined) {
      // First delta for this tool call - initialize
      partial = {
        id: delta.id ?? '',
        type: delta.type ?? 'function',
        functionName: delta.function?.name ?? '',
        functionArguments: delta.function?.arguments ?? '',
      };
      this.toolCallMap.set(index, partial);
    } else {
      // Subsequent delta - merge in new data
      if (delta.id !== undefined) {
        partial.id = delta.id;
      }
      if (delta.type !== undefined) {
        partial.type = delta.type;
      }
      if (delta.function?.name !== undefined) {
        partial.functionName = delta.function.name;
      }
      if (delta.function?.arguments !== undefined) {
        // Arguments are streamed incrementally - append
        partial.functionArguments += delta.function.arguments;
      }
    }
  }

  /**
   * Get the accumulated text content.
   *
   * @returns The complete text content from all processed chunks
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Get the assembled tool calls.
   *
   * Returns tool calls sorted by their original index order.
   *
   * @returns Array of fully assembled tool calls
   */
  getToolCalls(): ToolCall[] {
    // Sort by index to maintain order
    const sortedEntries = [...this.toolCallMap.entries()].sort(
      ([a], [b]) => a - b
    );

    return sortedEntries.map(([, partial]) => ({
      id: partial.id,
      type: partial.type,
      function: {
        name: partial.functionName,
        arguments: partial.functionArguments,
      },
    }));
  }

  /**
   * Get the finish reason from the final chunk.
   *
   * @returns The finish reason, or null if stream hasn't finished
   */
  getFinishReason(): FinishReason | null {
    return this.finishReason;
  }

  /**
   * Get the role of the response.
   *
   * @returns The chat role (defaults to 'assistant' if not specified)
   */
  getRole(): ChatRole {
    return this.role;
  }

  /**
   * Reset the accumulator for reuse.
   *
   * Clears all accumulated state, allowing the accumulator to be
   * reused for processing a new stream.
   */
  reset(): void {
    this.content = '';
    this.toolCallMap.clear();
    this.finishReason = null;
    this.role = 'assistant';
  }
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Internal representation of a partially assembled tool call.
 * Used during accumulation before converting to the final ToolCall shape.
 */
interface PartialToolCall {
  /** Tool call ID */
  id: string;

  /** Tool type (always 'function' currently) */
  type: 'function';

  /** Function name */
  functionName: string;

  /** Accumulated function arguments JSON string */
  functionArguments: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Result of collecting a complete stream.
 */
export interface CollectedStreamResult {
  /** Accumulated text content */
  content: string;

  /** Assembled tool calls */
  toolCalls: ToolCall[];

  /** Finish reason from the final chunk */
  finishReason: FinishReason | null;
}

/**
 * Consume an entire stream and collect the results.
 *
 * This is a convenience function that uses StreamAccumulator internally
 * to process all chunks and return the final aggregated result.
 *
 * @param stream - Async iterable of chat chunks
 * @returns Promise resolving to the collected stream result
 *
 * @example
 * ```typescript
 * const stream = client.streamCompletion(messages);
 * const result = await collectStream(stream);
 *
 * if (result.toolCalls.length > 0) {
 *   // Handle tool calls
 * } else {
 *   console.log(result.content);
 * }
 * ```
 */
export async function collectStream(
  stream: AsyncIterable<ChatChunk>
): Promise<CollectedStreamResult> {
  const accumulator = new StreamAccumulator();

  for await (const chunk of stream) {
    accumulator.processChunk(chunk);
  }

  return {
    content: accumulator.getContent(),
    toolCalls: accumulator.getToolCalls(),
    finishReason: accumulator.getFinishReason(),
  };
}

/**
 * Transform stream chunks using a mapping function.
 *
 * Creates a new async generator that yields transformed values
 * for each chunk in the input stream.
 *
 * @typeParam T - The output type of the mapper function
 * @param stream - Async iterable of chat chunks
 * @param mapper - Function to transform each chunk
 * @returns Async generator yielding transformed values
 *
 * @example
 * ```typescript
 * // Extract just the content from each chunk
 * const contentStream = mapStream(stream, (chunk) => chunk.content ?? '');
 *
 * for await (const text of contentStream) {
 *   process.stdout.write(text);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Transform to custom event format
 * const eventStream = mapStream(stream, (chunk) => ({
 *   type: 'delta',
 *   text: chunk.content,
 *   done: chunk.finish_reason !== null,
 * }));
 * ```
 */
export async function* mapStream<T>(
  stream: AsyncIterable<ChatChunk>,
  mapper: (chunk: ChatChunk) => T
): AsyncGenerator<T> {
  for await (const chunk of stream) {
    yield mapper(chunk);
  }
}
