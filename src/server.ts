#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { runAgent } from "./agent.js";
import type { AgentMode } from "./types.js";

async function main() {
  const config = loadConfig();

  const repoNames = Array.from(config.repos.keys());
  const repoListStr = repoNames.join(", ");

  const server = new McpServer({
    name: "sibling-repo",
    version: "0.1.0",
  });

  server.tool(
    "ask_repo",
    `Spawn a Claude Code agent in a sibling repository to explore code, plan implementations, or execute changes. Use this when you need to understand APIs, schemas, architecture, or conventions from another repo in this project.

Available repos: ${repoListStr}

Modes:
- explore: Read-only investigation. Use for questions about endpoints, schemas, architecture, conventions, or "how does X work" queries.
- plan: Generate an implementation plan without writing code. Use when you need a step-by-step plan for changes in the sibling repo.
- execute: Read-write. Actually make changes in the sibling repo. IMPORTANT: Always run "plan" mode first and get user approval before using "execute". Pass the approved plan as the prompt to the execute call so the agent follows it exactly.`,
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
    },
    async ({ repo, prompt, mode, model }) => {
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

      const resolvedModel = model ?? config.models[mode as AgentMode];

      if (mode === "execute") {
        console.error(
          `[sibling-repo] EXECUTE mode invoked on "${repo}" at ${entry.path}`
        );
      }

      try {
        const result = await runAgent(
          entry.path,
          prompt,
          mode as AgentMode,
          resolvedModel,
          config.maxTurns
        );
        return {
          content: [{ type: "text" as const, text: result }],
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[sibling-repo] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[sibling-repo] Fatal:", err);
  process.exit(1);
});
