import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeStreamEvent } from "../src/stderr-stream.js";

describe("writeStreamEvent", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  function makeStreamMessage(event: Record<string, unknown>) {
    return {
      type: "stream_event" as const,
      event,
      parent_tool_use_id: null,
      uuid: "test-uuid",
      session_id: "test-session",
    };
  }

  it("writes [thinking] prefix on thinking content_block_start", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking" },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("\n[thinking] ");
  });

  it("writes [text] prefix on text content_block_start", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text" },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("\n[text] ");
  });

  it("writes [tool:Name] prefix on tool_use content_block_start", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", name: "Grep" },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("\n[tool:Grep] ");
  });

  it("writes thinking delta text", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Let me think..." },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("Let me think...");
  });

  it("writes text delta text", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello world" },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("Hello world");
  });

  it("writes input_json delta text", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"pattern":' },
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith('{"pattern":');
  });

  it("writes newline on content_block_stop", () => {
    writeStreamEvent(
      makeStreamMessage({
        type: "content_block_stop",
        index: 0,
      }) as any
    );

    expect(stderrSpy).toHaveBeenCalledWith("\n");
  });

  it("ignores non-stream_event messages", () => {
    writeStreamEvent({ type: "assistant", message: { content: "hi" } } as any);
    writeStreamEvent({ type: "result", result: "done" } as any);
    writeStreamEvent({ type: "user", uuid: "u1" } as any);

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("ignores unknown stream event types", () => {
    writeStreamEvent(
      makeStreamMessage({ type: "message_start" }) as any
    );

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
