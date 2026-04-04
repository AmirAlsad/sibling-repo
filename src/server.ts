#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent.js";
import { storeUndo, performUndo } from "./undo.js";
import {
  createConversation,
  getConversation,
  updateConversation,
  listConversations,
} from "./conversations.js";
import { createJob, completeJob, failJob, getJob, listJobs } from "./jobs.js";
import type { AgentMode } from "./types.js";
import type { Query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  const config = loadConfig();

  const repoNames = Array.from(config.repos.keys());
  const repoListStr = repoNames.join(", ");

  const server = new McpServer({
    name: "sibling-repo",
    version: "0.2.0",
  });

  server.tool(
    "ask_repo",
    `Spawn a Claude Code agent in a sibling repository to explore code, plan implementations, or execute changes. Use this when you need to understand APIs, schemas, architecture, or conventions from another repo in this project.

Available repos: ${repoListStr}

Modes:
- explore: Read-only investigation. Use for questions about endpoints, schemas, architecture, conventions, or "how does X work" queries.
- plan: Generate an implementation plan without writing code. Use when you need a step-by-step plan for changes in the sibling repo.
- execute: Read-write. Actually make changes in the sibling repo. IMPORTANT: Always run "plan" mode first and get user approval before using "execute". Pass the approved plan as the prompt to the execute call so the agent follows it exactly. Execute mode is sandboxed to the target repo and all changes are tracked — use undo_last_execute to revert if needed.

Conversations:
- Omit conversation_id to start a new conversation. The response includes a conversation_id you can use to resume.
- Pass conversation_id to continue an existing conversation with full context preserved.
- You can change modes between turns (e.g., explore → plan → execute) within the same conversation.

Background execution:
- Set background: true to run the agent asynchronously. Returns a job_id immediately.
- Use check_job with the job_id to poll for status and retrieve results.
- Use check_job without a job_id to list all jobs.
- Multiple background agents can run in parallel across different repos or the same repo.`,
    {
      repo: z.string().describe("Repository short name from SIBLING_REPOS"),
      prompt: z.string().describe("The task or question for the sibling agent"),
      mode: z
        .enum(["explore", "plan", "execute"])
        .default("explore")
        .describe(
          "Agent mode: explore (read-only), plan (design), execute (read-write)"
        ),
      model: z
        .string()
        .optional()
        .describe('Model override: "haiku", "sonnet", "opus"'),
      conversation_id: z
        .string()
        .optional()
        .describe(
          "Resume an existing conversation. Omit to start a new one."
        ),
      background: z
        .boolean()
        .default(false)
        .describe(
          "Run the agent in the background. Returns a job_id immediately. Use check_job to poll for results."
        ),
    },
    async ({ repo, prompt, mode, model, conversation_id, background }) => {
      const entry = config.repos.get(repo);
      if (!entry) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown repo "${repo}". Available repos: ${repoListStr}`,
            },
          ],
          isError: true,
        };
      }

      if (!existsSync(entry.path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Repo path does not exist: ${entry.path}`,
            },
          ],
          isError: true,
        };
      }

      // Resolve resume session ID from existing conversation
      let resumeSessionId: string | undefined;
      if (conversation_id) {
        const existing = getConversation(conversation_id);
        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Conversation "${conversation_id}" not found. Use list_conversations to see active conversations, or omit conversation_id to start a new one.`,
              },
            ],
            isError: true,
          };
        }
        if (existing.repoName !== repo) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Conversation "${conversation_id}" belongs to repo "${existing.repoName}", not "${repo}".`,
              },
            ],
            isError: true,
          };
        }
        resumeSessionId = existing.sessionId;
      }

      const resolvedModel = model ?? config.models[mode as AgentMode];

      if (mode === "execute") {
        console.error(
          `[sibling-repo] EXECUTE mode invoked on "${repo}" at ${entry.path}`
        );
      }

      // Helper: post-processing after agent completes
      const handleAgentResult = (
        agentResult: { text: string; sessionId: string; checkpoint?: import("./types.js").ExecuteCheckpoint; queryHandle?: unknown },
        conversationId: string,
        isNewConversation: boolean
      ) => {
        if (isNewConversation) {
          updateConversation(
            conversationId,
            agentResult.sessionId,
            mode as AgentMode,
            agentResult.text
          );
        } else {
          updateConversation(
            conversationId,
            agentResult.sessionId,
            mode as AgentMode,
            agentResult.text
          );
        }

        if (agentResult.checkpoint && agentResult.queryHandle) {
          storeUndo(
            conversationId,
            agentResult.queryHandle as Query,
            agentResult.checkpoint
          );
        }
      };

      // Pre-allocate conversation so we always have an ID to return
      let conversationId: string;
      if (conversation_id) {
        conversationId = conversation_id;
      } else {
        const conversation = createConversation(
          repo,
          entry.path,
          "",
          mode as AgentMode,
          background ? "(running in background...)" : ""
        );
        conversationId = conversation.id;
      }

      if (background) {
        const job = createJob(repo, mode as AgentMode, prompt, conversationId);

        // Fire and forget — no await
        runAgent(
          entry.path,
          prompt,
          mode as AgentMode,
          resolvedModel,
          config.maxTurns,
          repo,
          resumeSessionId
        )
          .then((agentResult) => {
            handleAgentResult(agentResult, conversationId, !conversation_id);
            completeJob(job.id, agentResult.text, !!agentResult.checkpoint);
          })
          .catch((err) => {
            failJob(job.id, err instanceof Error ? err.message : String(err));
          });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  background: true,
                  job_id: job.id,
                  conversation_id: conversationId,
                  status: "running",
                  message: `Agent started in background. Use check_job with job_id "${job.id}" to check progress.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Synchronous (blocking) mode — original behavior
      try {
        const agentResult = await runAgent(
          entry.path,
          prompt,
          mode as AgentMode,
          resolvedModel,
          config.maxTurns,
          repo,
          resumeSessionId
        );

        handleAgentResult(agentResult, conversationId, !conversation_id);

        let responseText = agentResult.text;
        responseText += `\n\n---\nconversation_id: ${conversationId}`;
        if (agentResult.checkpoint) {
          responseText += `\nExecute session recorded. Use \`undo_last_execute\` with conversation_id "${conversationId}" to revert all file changes.`;
        }

        return {
          content: [{ type: "text" as const, text: responseText }],
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Agent error: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "undo_last_execute",
    `Revert all file changes from the last execute-mode run on a conversation. This restores files to their state before the execute agent made changes.`,
    {
      conversation_id: z
        .string()
        .describe("Conversation ID to undo execute changes for"),
    },
    async ({ conversation_id }) => {
      // Block undo if a background job is still running on this conversation
      const activeJob = listJobs().find(
        (j) => j.conversationId === conversation_id && j.status === "running"
      );
      if (activeJob) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot undo: a background job (${activeJob.id}) is still running on this conversation. Wait for it to complete first.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await performUndo(conversation_id);
        const filesStr = (result.filesChanged ?? []).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Reverted ${result.filesChanged?.length ?? 0} file(s): ${filesStr} (+${result.insertions ?? 0}/-${result.deletions ?? 0})`,
            },
          ],
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Undo error: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_repos",
    "List all configured sibling repositories and their paths.",
    {},
    async () => {
      const repos = Array.from(config.repos.values()).map((r) => ({
        name: r.name,
        path: r.path,
        has_claude_md: r.hasCLAUDEmd,
      }));
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(repos, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "list_conversations",
    "List all active conversations across sibling repositories. Shows conversation ID, repo, last mode used, timestamps, result snippet, and turn count.",
    {},
    async () => {
      const conversations = listConversations().map((c) => ({
        id: c.id,
        repo: c.repoName,
        last_mode: c.lastMode,
        created_at: c.createdAt.toISOString(),
        last_used_at: c.lastUsedAt.toISOString(),
        last_result_snippet: c.lastResultSnippet,
        turn_count: c.turnCount,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: conversations.length > 0
              ? JSON.stringify(conversations, null, 2)
              : "No active conversations.",
          },
        ],
      };
    }
  );

  server.tool(
    "check_job",
    `Check the status of a background agent job, or list all jobs.

- With job_id: Returns the job's status (running/completed/failed), and the full result when complete.
- Without job_id: Lists all background jobs with their statuses.`,
    {
      job_id: z
        .string()
        .optional()
        .describe("Job ID to check. Omit to list all jobs."),
    },
    async ({ job_id }) => {
      if (!job_id) {
        const allJobs = listJobs().map((j) => ({
          job_id: j.id,
          status: j.status,
          repo: j.repo,
          mode: j.mode,
          conversation_id: j.conversationId,
          created_at: j.createdAt.toISOString(),
          completed_at: j.completedAt?.toISOString() ?? null,
          result_snippet: j.result?.slice(0, 200) ?? null,
          error: j.error ?? null,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: allJobs.length > 0
                ? JSON.stringify(allJobs, null, 2)
                : "No background jobs.",
            },
          ],
        };
      }

      const job = getJob(job_id);
      if (!job) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Job "${job_id}" not found. Use check_job without a job_id to list all jobs.`,
            },
          ],
          isError: true,
        };
      }

      if (job.status === "running") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  job_id: job.id,
                  status: "running",
                  conversation_id: job.conversationId,
                  repo: job.repo,
                  mode: job.mode,
                  started_at: job.createdAt.toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (job.status === "failed") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  job_id: job.id,
                  status: "failed",
                  conversation_id: job.conversationId,
                  error: job.error,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // completed
      let responseText = job.result!;
      responseText += `\n\n---\njob_id: ${job.id}\nconversation_id: ${job.conversationId}`;
      if (job.hasCheckpoint) {
        responseText += `\nExecute session recorded. Use \`undo_last_execute\` with conversation_id "${job.conversationId}" to revert.`;
      }
      return {
        content: [{ type: "text" as const, text: responseText }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[sibling-repo] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[sibling-repo] Fatal:", err);
  process.exit(1);
});
