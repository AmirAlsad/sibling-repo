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

export interface SiblingConfig {
  repos: Map<string, RepoEntry>;
  models: {
    explore: string;
    plan: string;
    execute: string;
  };
  maxTurns: number;
}
