import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Track active content blocks by index to label deltas correctly
const activeBlocks = new Map<number, string>();

export function writeStreamEvent(message: SDKMessage): void {
  if (message.type !== "stream_event") return;

  const event = (message as { event: { type: string } }).event;
  const type = event.type;

  if (type === "content_block_start") {
    const e = event as ContentBlockStart;
    const block = e.content_block;
    if (block.type === "thinking") {
      activeBlocks.set(e.index, "thinking");
      process.stderr.write("\n[thinking] ");
    } else if (block.type === "text") {
      activeBlocks.set(e.index, "text");
      process.stderr.write("\n[text] ");
    } else if (block.type === "tool_use") {
      const name = block.name ?? "unknown";
      activeBlocks.set(e.index, `tool_use:${name}`);
      process.stderr.write(`\n[tool:${name}] `);
    }
  } else if (type === "content_block_delta") {
    const e = event as ContentBlockDelta;
    const deltaType = e.delta.type;
    if (deltaType === "thinking_delta") {
      process.stderr.write(e.delta.thinking ?? "");
    } else if (deltaType === "text_delta") {
      process.stderr.write(e.delta.text ?? "");
    } else if (deltaType === "input_json_delta") {
      process.stderr.write(e.delta.partial_json ?? "");
    }
  } else if (type === "content_block_stop") {
    const e = event as ContentBlockStop;
    activeBlocks.delete(e.index);
    process.stderr.write("\n");
  }
}

// Minimal types for the stream events we handle
interface ContentBlockStart {
  type: "content_block_start";
  index: number;
  content_block: { type: string; name?: string };
}

interface ContentBlockDelta {
  type: "content_block_delta";
  index: number;
  delta: { type: string; thinking?: string; text?: string; partial_json?: string };
}

interface ContentBlockStop {
  type: "content_block_stop";
  index: number;
}
