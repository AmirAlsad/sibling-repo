import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMode, AgentResult, ModeConfig } from "./types.js";
import { EXPLORE_PROMPT, PLAN_PROMPT, EXECUTE_PROMPT } from "./prompts.js";
import { storeUndo } from "./undo.js";

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  explore: {
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    disallowedTools: ["Write", "Edit", "MultiEdit"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    defaultModel: "sonnet",
    systemPromptAppend: EXPLORE_PROMPT,
  },
  plan: {
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    disallowedTools: ["Write", "Edit", "MultiEdit"],
    permissionMode: "plan",
    allowDangerouslySkipPermissions: false,
    defaultModel: "opus",
    systemPromptAppend: PLAN_PROMPT,
  },
  execute: {
    allowedTools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit", "MultiEdit"],
    disallowedTools: [],
    permissionMode: "acceptEdits",
    allowDangerouslySkipPermissions: false,
    defaultModel: "opus",
    systemPromptAppend: EXECUTE_PROMPT,
  },
};

export async function runAgent(
  repoPath: string,
  prompt: string,
  mode: AgentMode,
  model: string,
  maxTurns: number,
  repoName: string
): Promise<AgentResult> {
  const config = MODE_CONFIGS[mode];
  const isExecute = mode === "execute";

  const options: Parameters<typeof query>[0]["options"] = {
    cwd: repoPath,
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: config.systemPromptAppend,
    },
    allowedTools: config.allowedTools,
    disallowedTools: config.disallowedTools,
    permissionMode: config.permissionMode as "default" | "plan" | "acceptEdits" | "bypassPermissions",
    model,
    maxTurns,
  };

  if (config.allowDangerouslySkipPermissions) {
    options.allowDangerouslySkipPermissions = true;
  }

  if (isExecute) {
    options.enableFileCheckpointing = true;
    options.extraArgs = { "replay-user-messages": null };
    options.sandbox = {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowWrite: [repoPath],
      },
    };
  }

  try {
    let result = "";
    let checkpointId = "";
    let sessionId = "";

    const queryHandle: Query = query({ prompt, options });

    for await (const message of queryHandle) {
      if (isExecute && message.type === "user" && !checkpointId && "uuid" in message && message.uuid) {
        checkpointId = message.uuid as string;
      }

      if (message.type === "result") {
        if ("session_id" in message) {
          sessionId = message.session_id as string;
        }
        if ("result" in message) {
          result = message.result as string;
        } else if ("errors" in message) {
          const errors = (message.errors as string[]).join("; ");
          throw new Error(`Agent error (${message.subtype}): ${errors}`);
        }
      }
    }

    if (!result) {
      throw new Error("Agent returned no result");
    }

    const agentResult: AgentResult = { text: result };

    if (isExecute && sessionId && checkpointId) {
      const checkpoint = { sessionId, checkpointId, repoName, repoPath };
      agentResult.checkpoint = checkpoint;
      storeUndo(repoName, queryHandle, checkpoint);
    }

    return agentResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (
      msg.includes("auth") ||
      msg.includes("token") ||
      msg.includes("unauthorized") ||
      msg.includes("401")
    ) {
      throw new Error(
        `Authentication failed. Run \`claude setup-token\` to generate a new OAuth token ` +
          `and add it to your .env file as CLAUDE_CODE_OAUTH_TOKEN. Original error: ${msg}`
      );
    }

    throw err;
  }
}
