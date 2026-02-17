/**
 * Stream Handler Utility Tests
 *
 * Tests for StreamAccumulator, collectStream, and mapStream.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StreamAccumulator, collectStream, mapStream } from './streaming.js';
import type { ChatChunk, ToolCallDelta } from './types.js';

/**
 * Helper to create async iterable from array of chunks.
 */
async function* asyncIterableFromArray(chunks: ChatChunk[]): AsyncGenerator<ChatChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Helper to create a basic ChatChunk.
 */
function createChunk(overrides: Partial<ChatChunk> = {}): ChatChunk {
  return {
    id: 'test-id',
    content: null,
    finish_reason: null,
    ...overrides,
  };
}

describe('StreamAccumulator', () => {
  describe('content accumulation', () => {
    it('should accumulate content from multiple chunks', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Hello' }));
      accumulator.processChunk(createChunk({ content: ' ' }));
      accumulator.processChunk(createChunk({ content: 'World' }));

      assert.strictEqual(accumulator.getContent(), 'Hello World');
    });

    it('should return empty string when no content received', () => {
      const accumulator = new StreamAccumulator();

      assert.strictEqual(accumulator.getContent(), '');
    });

    it('should handle single chunk with content', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Complete message' }));

      assert.strictEqual(accumulator.getContent(), 'Complete message');
    });

    it('should skip null content chunks (no accumulation)', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Start' }));
      accumulator.processChunk(createChunk({ content: null }));
      accumulator.processChunk(createChunk({ content: 'End' }));

      assert.strictEqual(accumulator.getContent(), 'StartEnd');
    });

    it('should handle empty string content', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'A' }));
      accumulator.processChunk(createChunk({ content: '' }));
      accumulator.processChunk(createChunk({ content: 'B' }));

      assert.strictEqual(accumulator.getContent(), 'AB');
    });
  });

  describe('role tracking', () => {
    it('should track role from first chunk', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ role: 'assistant', content: 'Hello' }));
      accumulator.processChunk(createChunk({ content: ' World' }));

      assert.strictEqual(accumulator.getRole(), 'assistant');
    });

    it('should default to assistant role', () => {
      const accumulator = new StreamAccumulator();

      assert.strictEqual(accumulator.getRole(), 'assistant');
    });

    it('should update role if provided in later chunk', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ role: 'user' }));
      accumulator.processChunk(createChunk({ role: 'assistant' }));

      assert.strictEqual(accumulator.getRole(), 'assistant');
    });
  });

  describe('finish_reason tracking', () => {
    it('should track finish_reason from final chunk', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Hello' }));
      accumulator.processChunk(createChunk({ content: ' World', finish_reason: 'stop' }));

      assert.strictEqual(accumulator.getFinishReason(), 'stop');
    });

    it('should return null if stream has not finished', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Hello' }));

      assert.strictEqual(accumulator.getFinishReason(), null);
    });

    it('should handle tool_calls finish reason', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ finish_reason: 'tool_calls' }));

      assert.strictEqual(accumulator.getFinishReason(), 'tool_calls');
    });

    it('should handle length finish reason', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ finish_reason: 'length' }));

      assert.strictEqual(accumulator.getFinishReason(), 'length');
    });

    it('should handle content_filter finish reason', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ finish_reason: 'content_filter' }));

      assert.strictEqual(accumulator.getFinishReason(), 'content_filter');
    });
  });

  describe('tool call assembly', () => {
    it('should assemble tool calls from deltas', () => {
      const accumulator = new StreamAccumulator();

      // First chunk: id, type, function name (beginning of tool call)
      const delta1: ToolCallDelta = {
        index: 0,
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '',
        },
      };

      // Second chunk: arguments (streamed incrementally)
      const delta2: ToolCallDelta = {
        index: 0,
        function: {
          arguments: '{"city":',
        },
      };

      // Third chunk: more arguments
      const delta3: ToolCallDelta = {
        index: 0,
        function: {
          arguments: '"NYC"}',
        },
      };

      accumulator.processChunk(createChunk({ tool_calls: [delta1] }));
      accumulator.processChunk(createChunk({ tool_calls: [delta2] }));
      accumulator.processChunk(createChunk({ tool_calls: [delta3] }));

      const toolCalls = accumulator.getToolCalls();

      assert.strictEqual(toolCalls.length, 1);
      assert.strictEqual(toolCalls[0].id, 'call_123');
      assert.strictEqual(toolCalls[0].type, 'function');
      assert.strictEqual(toolCalls[0].function.name, 'get_weather');
      assert.strictEqual(toolCalls[0].function.arguments, '{"city":"NYC"}');
    });

    it('should handle multiple simultaneous tool calls (different indices)', () => {
      const accumulator = new StreamAccumulator();

      // First tool call
      const delta0: ToolCallDelta = {
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'tool_a', arguments: '{}' },
      };

      // Second tool call
      const delta1: ToolCallDelta = {
        index: 1,
        id: 'call_2',
        type: 'function',
        function: { name: 'tool_b', arguments: '{"x":1}' },
      };

      accumulator.processChunk(createChunk({ tool_calls: [delta0, delta1] }));

      const toolCalls = accumulator.getToolCalls();

      assert.strictEqual(toolCalls.length, 2);
      assert.strictEqual(toolCalls[0].id, 'call_1');
      assert.strictEqual(toolCalls[0].function.name, 'tool_a');
      assert.strictEqual(toolCalls[1].id, 'call_2');
      assert.strictEqual(toolCalls[1].function.name, 'tool_b');
    });

    it('should sort tool calls by index', () => {
      const accumulator = new StreamAccumulator();

      // Receive tool calls out of order
      accumulator.processChunk(
        createChunk({
          tool_calls: [
            { index: 2, id: 'call_3', type: 'function', function: { name: 'c', arguments: '' } },
          ],
        })
      );
      accumulator.processChunk(
        createChunk({
          tool_calls: [
            { index: 0, id: 'call_1', type: 'function', function: { name: 'a', arguments: '' } },
          ],
        })
      );
      accumulator.processChunk(
        createChunk({
          tool_calls: [
            { index: 1, id: 'call_2', type: 'function', function: { name: 'b', arguments: '' } },
          ],
        })
      );

      const toolCalls = accumulator.getToolCalls();

      assert.strictEqual(toolCalls.length, 3);
      assert.strictEqual(toolCalls[0].function.name, 'a');
      assert.strictEqual(toolCalls[1].function.name, 'b');
      assert.strictEqual(toolCalls[2].function.name, 'c');
    });

    it('should return empty array when no tool calls', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Hello' }));

      const toolCalls = accumulator.getToolCalls();

      assert.deepStrictEqual(toolCalls, []);
    });

    it('should handle tool call with empty function details', () => {
      const accumulator = new StreamAccumulator();

      const delta: ToolCallDelta = {
        index: 0,
      };

      accumulator.processChunk(createChunk({ tool_calls: [delta] }));

      const toolCalls = accumulator.getToolCalls();

      assert.strictEqual(toolCalls.length, 1);
      assert.strictEqual(toolCalls[0].id, '');
      assert.strictEqual(toolCalls[0].function.name, '');
      assert.strictEqual(toolCalls[0].function.arguments, '');
    });

    it('should merge tool call updates correctly', () => {
      const accumulator = new StreamAccumulator();

      // First: partial info
      accumulator.processChunk(
        createChunk({
          tool_calls: [{ index: 0, id: 'original_id' }],
        })
      );

      // Second: update with name
      accumulator.processChunk(
        createChunk({
          tool_calls: [{ index: 0, function: { name: 'my_function' } }],
        })
      );

      // Third: update with arguments
      accumulator.processChunk(
        createChunk({
          tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }],
        })
      );

      const toolCalls = accumulator.getToolCalls();

      assert.strictEqual(toolCalls[0].id, 'original_id');
      assert.strictEqual(toolCalls[0].function.name, 'my_function');
      assert.strictEqual(toolCalls[0].function.arguments, '{"a":1}');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'Hello', role: 'user' }));
      accumulator.processChunk(createChunk({ finish_reason: 'stop' }));
      accumulator.processChunk(
        createChunk({
          tool_calls: [
            { index: 0, id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } },
          ],
        })
      );

      accumulator.reset();

      assert.strictEqual(accumulator.getContent(), '');
      assert.strictEqual(accumulator.getRole(), 'assistant');
      assert.strictEqual(accumulator.getFinishReason(), null);
      assert.deepStrictEqual(accumulator.getToolCalls(), []);
    });

    it('should allow reuse after reset', () => {
      const accumulator = new StreamAccumulator();

      accumulator.processChunk(createChunk({ content: 'First' }));
      accumulator.reset();
      accumulator.processChunk(createChunk({ content: 'Second' }));

      assert.strictEqual(accumulator.getContent(), 'Second');
    });
  });
});

describe('collectStream', () => {
  it('should collect complete stream into result', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ role: 'assistant', content: 'Hello' }),
      createChunk({ content: ' World' }),
      createChunk({ content: '!', finish_reason: 'stop' }),
    ];

    const result = await collectStream(asyncIterableFromArray(chunks));

    assert.strictEqual(result.content, 'Hello World!');
    assert.strictEqual(result.finishReason, 'stop');
    assert.deepStrictEqual(result.toolCalls, []);
  });

  it('should return content, toolCalls, and finishReason', async () => {
    const chunks: ChatChunk[] = [
      createChunk({
        content: '',
        tool_calls: [
          { index: 0, id: 'tc_1', type: 'function', function: { name: 'test', arguments: '{}' } },
        ],
      }),
      createChunk({ finish_reason: 'tool_calls' }),
    ];

    const result = await collectStream(asyncIterableFromArray(chunks));

    assert.strictEqual(result.finishReason, 'tool_calls');
    assert.strictEqual(result.toolCalls.length, 1);
    assert.strictEqual(result.toolCalls[0].id, 'tc_1');
  });

  it('should work with empty stream', async () => {
    const chunks: ChatChunk[] = [];

    const result = await collectStream(asyncIterableFromArray(chunks));

    assert.strictEqual(result.content, '');
    assert.strictEqual(result.finishReason, null);
    assert.deepStrictEqual(result.toolCalls, []);
  });

  it('should handle stream with only null content', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ content: null }),
      createChunk({ content: null, finish_reason: 'stop' }),
    ];

    const result = await collectStream(asyncIterableFromArray(chunks));

    assert.strictEqual(result.content, '');
    assert.strictEqual(result.finishReason, 'stop');
  });
});

describe('mapStream', () => {
  it('should transform chunks through mapper function', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ content: 'A' }),
      createChunk({ content: 'B' }),
      createChunk({ content: 'C' }),
    ];

    const mappedStream = mapStream(asyncIterableFromArray(chunks), (chunk) => chunk.content ?? '');

    const results: string[] = [];
    for await (const value of mappedStream) {
      results.push(value);
    }

    assert.deepStrictEqual(results, ['A', 'B', 'C']);
  });

  it('should preserve iteration order', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ id: '1', content: 'first' }),
      createChunk({ id: '2', content: 'second' }),
      createChunk({ id: '3', content: 'third' }),
    ];

    const mappedStream = mapStream(asyncIterableFromArray(chunks), (chunk) => chunk.id);

    const results: string[] = [];
    for await (const value of mappedStream) {
      results.push(value);
    }

    assert.deepStrictEqual(results, ['1', '2', '3']);
  });

  it('should transform to different type', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ content: 'hello' }),
      createChunk({ content: 'world' }),
    ];

    const mappedStream = mapStream(asyncIterableFromArray(chunks), (chunk) => ({
      text: chunk.content,
      length: chunk.content?.length ?? 0,
    }));

    const results: { text: string | null; length: number }[] = [];
    for await (const value of mappedStream) {
      results.push(value);
    }

    assert.deepStrictEqual(results, [
      { text: 'hello', length: 5 },
      { text: 'world', length: 5 },
    ]);
  });

  it('should work with empty stream', async () => {
    const chunks: ChatChunk[] = [];

    const mappedStream = mapStream(asyncIterableFromArray(chunks), (chunk) => chunk.content);

    const results: (string | null)[] = [];
    for await (const value of mappedStream) {
      results.push(value);
    }

    assert.deepStrictEqual(results, []);
  });

  it('should handle mapper that extracts complex data', async () => {
    const chunks: ChatChunk[] = [
      createChunk({ id: 'c1', content: 'text', finish_reason: null }),
      createChunk({ id: 'c2', content: null, finish_reason: 'stop' }),
    ];

    const mappedStream = mapStream(asyncIterableFromArray(chunks), (chunk) => ({
      id: chunk.id,
      done: chunk.finish_reason !== null,
    }));

    const results: { id: string; done: boolean }[] = [];
    for await (const value of mappedStream) {
      results.push(value);
    }

    assert.deepStrictEqual(results, [
      { id: 'c1', done: false },
      { id: 'c2', done: true },
    ]);
  });
});
