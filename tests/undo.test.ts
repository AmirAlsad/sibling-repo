import { describe, it, expect, vi, beforeEach } from "vitest";
import { storeUndo, getUndoInfo, performUndo } from "../src/undo.js";
import type { ExecuteCheckpoint } from "../src/types.js";

function mockQueryHandle(rewindResult?: any) {
  return {
    close: vi.fn(),
    rewindFiles: vi.fn().mockResolvedValue(
      rewindResult ?? {
        canRewind: true,
        filesChanged: ["src/index.ts", "src/utils.ts"],
        insertions: 10,
        deletions: 5,
      }
    ),
    // Async generator stubs (not used in undo tests)
    [Symbol.asyncIterator]: vi.fn(),
  } as any;
}

function makeCheckpoint(repoName = "backend"): ExecuteCheckpoint {
  return {
    sessionId: "sess-123",
    checkpointId: "checkpoint-456",
    repoName,
    repoPath: `/tmp/${repoName}`,
  };
}

describe("undo", () => {
  beforeEach(() => {
    // Clear any stored state between tests by performing cleanup
    // We store and clear for repos we might have used
    try {
      // Use a fresh handle to avoid "no entry" errors
    } catch {}
  });

  it("storeUndo and getUndoInfo round-trip", () => {
    const handle = mockQueryHandle();
    const checkpoint = makeCheckpoint();

    storeUndo("backend", handle, checkpoint);
    expect(getUndoInfo("backend")).toEqual(checkpoint);
  });

  it("getUndoInfo returns undefined for unknown repo", () => {
    expect(getUndoInfo("nonexistent")).toBeUndefined();
  });

  it("storeUndo replaces previous entry and closes old handle", () => {
    const handle1 = mockQueryHandle();
    const handle2 = mockQueryHandle();
    const checkpoint1 = makeCheckpoint();
    const checkpoint2 = { ...makeCheckpoint(), checkpointId: "checkpoint-789" };

    storeUndo("backend", handle1, checkpoint1);
    storeUndo("backend", handle2, checkpoint2);

    expect(handle1.close).toHaveBeenCalledOnce();
    expect(getUndoInfo("backend")).toEqual(checkpoint2);
  });

  it("performUndo calls rewindFiles and clears entry", async () => {
    const handle = mockQueryHandle();
    const checkpoint = makeCheckpoint();

    storeUndo("backend", handle, checkpoint);
    const result = await performUndo("backend");

    expect(handle.rewindFiles).toHaveBeenCalledWith("checkpoint-456");
    expect(result.canRewind).toBe(true);
    expect(result.filesChanged).toEqual(["src/index.ts", "src/utils.ts"]);
    expect(handle.close).toHaveBeenCalled();
    expect(getUndoInfo("backend")).toBeUndefined();
  });

  it("performUndo throws when no entry exists", async () => {
    await expect(performUndo("nonexistent")).rejects.toThrow(
      'No execute session to undo for repo "nonexistent"'
    );
  });

  it("performUndo throws when rewind fails", async () => {
    const handle = mockQueryHandle({
      canRewind: false,
      error: "Files have been modified externally",
    });
    const checkpoint = makeCheckpoint();

    storeUndo("backend", handle, checkpoint);

    await expect(performUndo("backend")).rejects.toThrow(
      "Files have been modified externally"
    );
  });
});
