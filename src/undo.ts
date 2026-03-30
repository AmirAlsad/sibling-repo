import type { Query, RewindFilesResult } from "@anthropic-ai/claude-agent-sdk";
import type { ExecuteCheckpoint } from "./types.js";

interface UndoEntry {
  queryHandle: Query;
  checkpoint: ExecuteCheckpoint;
}

const undoStore = new Map<string, UndoEntry>();

export function storeUndo(
  conversationId: string,
  queryHandle: Query,
  checkpoint: ExecuteCheckpoint
): void {
  const existing = undoStore.get(conversationId);
  if (existing) {
    existing.queryHandle.close();
  }
  undoStore.set(conversationId, { queryHandle, checkpoint });
}

export function getUndoInfo(conversationId: string): ExecuteCheckpoint | undefined {
  return undoStore.get(conversationId)?.checkpoint;
}

export async function performUndo(conversationId: string): Promise<RewindFilesResult> {
  const entry = undoStore.get(conversationId);
  if (!entry) {
    throw new Error(`No execute session to undo for conversation "${conversationId}"`);
  }

  const result = await entry.queryHandle.rewindFiles(entry.checkpoint.checkpointId);

  if (!result.canRewind) {
    throw new Error(result.error ?? "Cannot rewind files");
  }

  entry.queryHandle.close();
  undoStore.delete(conversationId);

  return result;
}
