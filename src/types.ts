export type AgentMode = "explore" | "plan" | "execute";

export interface RepoEntry {
  name: string;
  path: string;
  hasCLAUDEmd: boolean;
}

export interface ModeConfig {
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode: string;
  allowDangerouslySkipPermissions: boolean;
  defaultModel: string;
  systemPromptAppend: string;
}

export interface ExecuteCheckpoint {
  sessionId: string;
  checkpointId: string;
  repoName: string;
  repoPath: string;
}

export interface AgentResult {
  text: string;
  sessionId: string;
  checkpoint?: ExecuteCheckpoint;
  queryHandle?: unknown; // Query handle for execute mode, used by server for undo
}

export interface Conversation {
  id: string;
  repoName: string;
  repoPath: string;
  sessionId: string;
  lastMode: AgentMode;
  createdAt: Date;
  lastUsedAt: Date;
  lastResultSnippet: string;
  turnCount: number;
}

export interface SiblingConfig {
  repos: Map<string, RepoEntry>;
  models: {
    explore: string;
    plan: string;
    execute: string;
  };
  maxTurns: number;
}
