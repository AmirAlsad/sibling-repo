import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../src/undo.js", () => ({
  storeUndo: vi.fn(),
}));

vi.mock("../src/stderr-stream.js", () => ({
  writeStreamEvent: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { storeUndo } from "../src/undo.js";
import { runAgent } from "../src/agent.js";

const mockQuery = vi.mocked(query);
const mockStoreUndo = vi.mocked(storeUndo);

// Helper to create a mock Query handle (async generator with close method)
function mockQueryHandle<T>(items: T[]) {
  const handle = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < items.length) {
            return { value: items[i++], done: false as const };
          }
          return { value: undefined, done: true as const };
        },
      };
    },
    close: vi.fn(),
    // Stub other Query methods that may be checked
    rewindFiles: vi.fn(),
  };
  return handle;
}

describe("runAgent", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockStoreUndo.mockReset();
  });

  it("returns AgentResult from a successful agent run", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "assistant", message: { content: "thinking..." } },
        {
          type: "result",
          subtype: "success",
          result: "The endpoint is POST /api/v1/check-in",
          session_id: "sess-1",
        },
      ]) as any
    );

    const result = await runAgent("/tmp/repo", "find the endpoint", "explore", "sonnet", 50, "backend");

    expect(result.text).toBe("The endpoint is POST /api/v1/check-in");
    expect(result.checkpoint).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it("passes correct options for explore mode", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "result", subtype: "success", result: "found it", session_id: "s1" },
      ]) as any
    );

    await runAgent("/tmp/repo", "search", "explore", "sonnet", 30, "backend");

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
    // explore mode should NOT have checkpointing or sandbox
    expect(callArgs.options.enableFileCheckpointing).toBeUndefined();
    expect(callArgs.options.sandbox).toBeUndefined();
  });

  it("passes correct options for plan mode", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "result", subtype: "success", result: "plan", session_id: "s1" },
      ]) as any
    );

    await runAgent("/tmp/repo", "plan it", "plan", "opus", 50, "backend");

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.disallowedTools).toEqual(["Write", "Edit", "MultiEdit"]);
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.enableFileCheckpointing).toBeUndefined();
    expect(opts.sandbox).toBeUndefined();
  });

  it("passes correct options for execute mode", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "result", subtype: "success", result: "done", session_id: "s1" },
      ]) as any
    );

    await runAgent("/tmp/repo", "create endpoint", "execute", "opus", 50, "backend");

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.permissionMode).toBe("acceptEdits");
    expect(opts.allowedTools).toContain("Write");
    expect(opts.allowedTools).toContain("Edit");
    expect(opts.allowedTools).toContain("MultiEdit");
    expect(opts.disallowedTools).toEqual([]);
    expect(opts.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("execute mode enables file checkpointing and sandbox", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "result", subtype: "success", result: "done", session_id: "s1" },
      ]) as any
    );

    await runAgent("/tmp/repo", "make changes", "execute", "opus", 50, "backend");

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.enableFileCheckpointing).toBe(true);
    expect(opts.extraArgs).toEqual({ "replay-user-messages": null });
    expect(opts.sandbox).toEqual({
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowWrite: ["/tmp/repo"],
      },
    });
  });

  it("execute mode captures checkpoint from user message and stores undo", async () => {
    const handle = mockQueryHandle([
      { type: "user", uuid: "checkpoint-uuid-123" },
      { type: "result", subtype: "success", result: "changes made", session_id: "sess-abc" },
    ]);
    mockQuery.mockReturnValue(handle as any);

    const result = await runAgent("/tmp/repo", "implement feature", "execute", "opus", 50, "backend");

    expect(result.text).toBe("changes made");
    expect(result.checkpoint).toEqual({
      sessionId: "sess-abc",
      checkpointId: "checkpoint-uuid-123",
      repoName: "backend",
      repoPath: "/tmp/repo",
    });
    expect(mockStoreUndo).toHaveBeenCalledWith(
      "backend",
      handle,
      {
        sessionId: "sess-abc",
        checkpointId: "checkpoint-uuid-123",
        repoName: "backend",
        repoPath: "/tmp/repo",
      }
    );
  });

  it("non-execute modes return no checkpoint", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "user", uuid: "some-uuid" },
        { type: "result", subtype: "success", result: "explored", session_id: "s1" },
      ]) as any
    );

    const result = await runAgent("/tmp/repo", "search", "explore", "sonnet", 50, "backend");

    expect(result.checkpoint).toBeUndefined();
    expect(mockStoreUndo).not.toHaveBeenCalled();
  });

  it("uses claude_code system prompt preset", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "result", subtype: "success", result: "ok", session_id: "s1" },
      ]) as any
    );

    await runAgent("/tmp/repo", "test", "explore", "sonnet", 50, "backend");

    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.systemPrompt.type).toBe("preset");
    expect(opts.systemPrompt.preset).toBe("claude_code");
  });

  it("throws on agent error result", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        {
          type: "result",
          subtype: "error_during_execution",
          errors: ["something went wrong"],
        },
      ]) as any
    );

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50, "backend")
    ).rejects.toThrow("Agent error (error_during_execution): something went wrong");
  });

  it("throws when agent returns no result", async () => {
    mockQuery.mockReturnValue(
      mockQueryHandle([
        { type: "assistant", message: { content: "..." } },
      ]) as any
    );

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50, "backend")
    ).rejects.toThrow("Agent returned no result");
  });

  it("wraps auth errors with setup-token instructions", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("unauthorized: invalid token");
    });

    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50, "backend")
    ).rejects.toThrow("Authentication failed");
    await expect(
      runAgent("/tmp/repo", "test", "explore", "sonnet", 50, "backend")
    ).rejects.toThrow("claude setup-token");
  });
});
