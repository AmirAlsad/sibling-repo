import { randomUUID } from "node:crypto";
import type { AgentMode, Conversation } from "./types.js";

const conversations = new Map<string, Conversation>();

const SNIPPET_LENGTH = 200;

export function createConversation(
  repoName: string,
  repoPath: string,
  sessionId: string,
  mode: AgentMode,
  resultText: string
): Conversation {
  const now = new Date();
  const conversation: Conversation = {
    id: randomUUID(),
    repoName,
    repoPath,
    sessionId,
    lastMode: mode,
    createdAt: now,
    lastUsedAt: now,
    lastResultSnippet: resultText.slice(0, SNIPPET_LENGTH),
    turnCount: 1,
  };
  conversations.set(conversation.id, conversation);
  return conversation;
}

export function getConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

export function updateConversation(
  id: string,
  sessionId: string,
  mode: AgentMode,
  resultText: string
): void {
  const conversation = conversations.get(id);
  if (!conversation) {
    throw new Error(`Conversation "${id}" not found`);
  }
  conversation.sessionId = sessionId;
  conversation.lastMode = mode;
  conversation.lastUsedAt = new Date();
  conversation.lastResultSnippet = resultText.slice(0, SNIPPET_LENGTH);
  conversation.turnCount += 1;
}

export function listConversations(): Conversation[] {
  return Array.from(conversations.values());
}
