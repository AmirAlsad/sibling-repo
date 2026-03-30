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
  // Use unique conversation IDs per test to avoid cross-test state
  let testId = 0;
  function uniqueId() {
    return `conv-${++testId}`;
  }

  it("storeUndo and getUndoInfo round-trip", () => {
    const id = uniqueId();
    const handle = mockQueryHandle();
    const checkpoint = makeCheckpoint();

    storeUndo(id, handle, checkpoint);
    expect(getUndoInfo(id)).toEqual(checkpoint);
  });

  it("getUndoInfo returns undefined for unknown conversation", () => {
    expect(getUndoInfo("nonexistent")).toBeUndefined();
  });

  it("storeUndo replaces previous entry and closes old handle", () => {
    const id = uniqueId();
    const handle1 = mockQueryHandle();
    const handle2 = mockQueryHandle();
    const checkpoint1 = makeCheckpoint();
    const checkpoint2 = { ...makeCheckpoint(), checkpointId: "checkpoint-789" };

    storeUndo(id, handle1, checkpoint1);
    storeUndo(id, handle2, checkpoint2);

    expect(handle1.close).toHaveBeenCalledOnce();
    expect(getUndoInfo(id)).toEqual(checkpoint2);
  });

  it("performUndo calls rewindFiles and clears entry", async () => {
    const id = uniqueId();
    const handle = mockQueryHandle();
    const checkpoint = makeCheckpoint();

    storeUndo(id, handle, checkpoint);
    const result = await performUndo(id);

    expect(handle.rewindFiles).toHaveBeenCalledWith("checkpoint-456");
    expect(result.canRewind).toBe(true);
    expect(result.filesChanged).toEqual(["src/index.ts", "src/utils.ts"]);
    expect(handle.close).toHaveBeenCalled();
    expect(getUndoInfo(id)).toBeUndefined();
  });

  it("performUndo throws when no entry exists", async () => {
    await expect(performUndo("nonexistent")).rejects.toThrow(
      'No execute session to undo for conversation "nonexistent"'
    );
  });

  it("performUndo throws when rewind fails", async () => {
    const id = uniqueId();
    const handle = mockQueryHandle({
      canRewind: false,
      error: "Files have been modified externally",
    });
    const checkpoint = makeCheckpoint();

    storeUndo(id, handle, checkpoint);

    await expect(performUndo(id)).rejects.toThrow(
      "Files have been modified externally"
    );
  });

  it("supports multiple conversations independently", () => {
    const id1 = uniqueId();
    const id2 = uniqueId();
    const handle1 = mockQueryHandle();
    const handle2 = mockQueryHandle();
    const checkpoint1 = makeCheckpoint("backend");
    const checkpoint2 = makeCheckpoint("frontend");

    storeUndo(id1, handle1, checkpoint1);
    storeUndo(id2, handle2, checkpoint2);

    expect(getUndoInfo(id1)).toEqual(checkpoint1);
    expect(getUndoInfo(id2)).toEqual(checkpoint2);
  });
});
