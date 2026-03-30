import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { runAgent } from "../src/agent.js";

const mockQuery = vi.mocked(query);

// Helper to create an async iterable from an array of messages
function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < items.length) {
            return { value: items[i++], done: false };
          }
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };
}

describe("runAgent", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns result from a successful agent run", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "assistant", message: { content: "thinking..." } },
        {
          type: "result",
          subtype: "success",
          result: "The endpoint is POST /api/v1/check-in",
        },
      ])
    );

    const result = await runAgent("/tmp/repo", "find the endpoint", "explore", "sonnet", 50);

    expect(result).toBe("The endpoint is POST /api/v1/check-in");
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it("passes correct options for explore mode", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "result", subtype: "success", result: "found it" },
      ])
    );

    await runAgent("/tmp/repo", "search", "explore", "sonnet", 30);

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toBe("search");
    expect(callArgs.options.cwd).toBe("/tmp/repo");
    expect(callArgs.options.model).toBe("sonnet");
    expect(callArgs.options.maxTurns).toBe(30);
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
    expect(callArgs.options.allowedTools).toEqual(["Read", "Grep", "Glob", "Bash"]);
    expect(callArgs.options.disallowedTools).toEqual(["Write", "Edit", "MultiEdit"]);
    expect(callArgs.options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: expect.stringContaining("READ-ONLY"),
    });
  });

  it("passes correct options for plan mode", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "result", subtype: "success", result: "plan" },
      ])
    );

    await runAgent("/tmp/repo", "plan it", "plan", "opus", 50);

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.permissionMode).toBe("plan");
    expect(opts.disallowedTools).toEqual(["Write", "Edit", "MultiEdit"]);
    // bypassPermissions should NOT be set for plan mode
    expect(opts.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("passes correct options for execute mode", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "result", subtype: "success", result: "done" },
      ])
    );

    await runAgent("/tmp/repo", "create endpoint", "execute", "opus", 50);

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.permissionMode).toBe("acceptEdits");
    expect(opts.allowedTools).toContain("Write");
    expect(opts.allowedTools).toContain("Edit");
    expect(opts.allowedTools).toContain("MultiEdit");
    expect(opts.disallowedTools).toEqual([]);
    expect(opts.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("uses claude_code system prompt preset", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "result", subtype: "success", result: "ok" },
      ])
    );

    await runAgent("/tmp/repo", "test", "explore", "sonnet", 50);

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.systemPrompt.type).toBe("preset");
    expect(opts.systemPrompt.preset).toBe("claude_code");
  });

  it("throws on agent error result", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        {
          type: "result",
          subtype: "error_during_execution",
          errors: ["something went wrong"],
        },
      ])
    );

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50)
    ).rejects.toThrow("Agent error (error_during_execution): something went wrong");
  });

  it("throws when agent returns no result", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([
        { type: "assistant", message: { content: "..." } },
      ])
    );

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50)
    ).rejects.toThrow("Agent returned no result");
  });

  it("wraps auth errors with setup-token instructions", async () => {
    mockQuery.mockReturnValue(
      asyncIterable([])
    );
    mockQuery.mockImplementation(() => {
      throw new Error("unauthorized: invalid token");
    });

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50)
    ).rejects.toThrow("Authentication failed");
    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50)
    ).rejects.toThrow("claude setup-token");
  });
});
