import type { Query, RewindFilesResult } from "@anthropic-ai/claude-agent-sdk";
import type { ExecuteCheckpoint } from "./types.js";

interface UndoEntry {
  queryHandle: Query;
  checkpoint: ExecuteCheckpoint;
}

const undoStore = new Map<string, UndoEntry>();

export function storeUndo(
  repoName: string,
  queryHandle: Query,
  checkpoint: ExecuteCheckpoint
): void {
  const existing = undoStore.get(repoName);
  if (existing) {
    existing.queryHandle.close();
  }
  undoStore.set(repoName, { queryHandle, checkpoint });
}

export function getUndoInfo(repoName: string): ExecuteCheckpoint | undefined {
  return undoStore.get(repoName)?.checkpoint;
}

export async function performUndo(repoName: string): Promise<RewindFilesResult> {
  const entry = undoStore.get(repoName);
  if (!entry) {
    throw new Error(`No execute session to undo for repo "${repoName}"`);
  }

  const result = await entry.queryHandle.rewindFiles(entry.checkpoint.checkpointId);

  if (!result.canRewind) {
    throw new Error(result.error ?? "Cannot rewind files");
  }

  entry.queryHandle.close();
  undoStore.delete(repoName);

  return result;
}
