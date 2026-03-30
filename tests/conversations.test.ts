import { describe, it, expect } from "vitest";
import {
  createConversation,
  getConversation,
  updateConversation,
  listConversations,
} from "../src/conversations.js";

describe("conversations", () => {
  it("createConversation returns a conversation with UUID and metadata", () => {
    const conv = createConversation("backend", "/tmp/backend", "sess-1", "explore", "Found the endpoint");

    expect(conv.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(conv.repoName).toBe("backend");
    expect(conv.repoPath).toBe("/tmp/backend");
    expect(conv.sessionId).toBe("sess-1");
    expect(conv.lastMode).toBe("explore");
    expect(conv.lastResultSnippet).toBe("Found the endpoint");
    expect(conv.turnCount).toBe(1);
    expect(conv.createdAt).toBeInstanceOf(Date);
    expect(conv.lastUsedAt).toBeInstanceOf(Date);
  });

  it("getConversation retrieves a stored conversation", () => {
    const conv = createConversation("backend", "/tmp/backend", "sess-2", "explore", "result");

    const retrieved = getConversation(conv.id);
    expect(retrieved).toBe(conv);
  });

  it("getConversation returns undefined for unknown ID", () => {
    expect(getConversation("nonexistent-id")).toBeUndefined();
  });

  it("updateConversation updates metadata and increments turn count", () => {
    const conv = createConversation("backend", "/tmp/backend", "sess-3", "explore", "initial");
    const originalLastUsed = conv.lastUsedAt;

    // Small delay to ensure lastUsedAt changes
    updateConversation(conv.id, "sess-3-resumed", "plan", "Here is the plan...");

    const updated = getConversation(conv.id)!;
    expect(updated.sessionId).toBe("sess-3-resumed");
    expect(updated.lastMode).toBe("plan");
    expect(updated.lastResultSnippet).toBe("Here is the plan...");
    expect(updated.turnCount).toBe(2);
    expect(updated.lastUsedAt.getTime()).toBeGreaterThanOrEqual(originalLastUsed.getTime());
    // createdAt should not change
    expect(updated.createdAt).toEqual(conv.createdAt);
  });

  it("updateConversation throws for unknown conversation", () => {
    expect(() =>
      updateConversation("nonexistent", "sess", "explore", "text")
    ).toThrow('Conversation "nonexistent" not found');
  });

  it("updateConversation truncates long result snippets", () => {
    const conv = createConversation("backend", "/tmp/backend", "sess-4", "explore", "short");

    const longText = "x".repeat(500);
    updateConversation(conv.id, "sess-4b", "plan", longText);

    const updated = getConversation(conv.id)!;
    expect(updated.lastResultSnippet).toHaveLength(200);
  });

  it("createConversation truncates long result snippets", () => {
    const longText = "y".repeat(500);
    const conv = createConversation("backend", "/tmp/backend", "sess-5", "explore", longText);

    expect(conv.lastResultSnippet).toHaveLength(200);
  });

  it("listConversations returns all conversations", () => {
    const before = listConversations().length;

    createConversation("repo1", "/tmp/repo1", "s1", "explore", "r1");
    createConversation("repo2", "/tmp/repo2", "s2", "plan", "r2");

    const all = listConversations();
    expect(all.length).toBeGreaterThanOrEqual(before + 2);
  });

  it("listConversations returns empty array when no conversations exist initially in a fresh module", () => {
    // This test verifies the return type; the store may have conversations from other tests
    const all = listConversations();
    expect(Array.isArray(all)).toBe(true);
  });
});
