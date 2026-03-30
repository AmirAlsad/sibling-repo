# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**sibling-repo** is an MCP server (stdio transport) that lets a Claude Code agent spawn fully contextualized Claude Code sessions in sibling repositories. It exposes three tools — `ask_repo` (spawn an agent in a configured repo with explore/plan/execute mode), `undo_last_execute` (revert file changes from the last execute run), and `list_repos` (discover configured repos). Built on the Claude Agent SDK and MCP SDK.

## Build, Test & Run

```bash
npm install
npm run build          # tsc → dist/
npm test               # vitest (unit + integration)
npm run dev            # tsx watch mode
node dist/server.js    # run the MCP server directly
```

Register with Claude Code:
```bash
# Via npx (end users)
claude mcp add --scope user sibling-repo -- npx -y sibling-repo

# Via local build (contributors)
claude mcp add --scope user sibling-repo -- node ./dist/server.js
```

## Architecture

```
src/
  server.ts    — MCP server entry point, tool registration (stdio transport)
  agent.ts     — Claude Agent SDK wrapper; configures mode-specific tools, permissions, model
  undo.ts      — Execute undo state management; stores Query handles for rewindFiles
  prompts.ts   — System prompt constants for explore/plan/execute modes
  config.ts    — .env loading (SIBLING_ENV_PATH → ~/.sibling-repo/.env → ./.env),
                 SIBLING_REPOS JSON parsing, path validation
  types.ts     — Shared TypeScript types (includes ExecuteCheckpoint, AgentResult)
tests/
  config.test.ts  — Config parsing, path resolution, defaults
  agent.test.ts   — Mode configs, result extraction, checkpointing, sandbox (mocked SDK)
  undo.test.ts    — Undo state management, rewind operations (mocked Query handles)
  server.test.ts  — MCP integration tests via stdio client transport
```

**Key dependencies:** `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `dotenv`, `zod`

## Agent Modes

| Mode | allowedTools | disallowedTools | Permission | Default Model |
|------|-------------|-----------------|-----------|---------------|
| explore | Read, Grep, Glob, Bash | Write, Edit, MultiEdit | bypassPermissions | sonnet |
| plan | Read, Grep, Glob, Bash | Write, Edit, MultiEdit | plan | opus |
| execute | Read, Grep, Glob, Bash, Write, Edit, MultiEdit | (none) | acceptEdits | opus |

`allowedTools` auto-approves tools; `disallowedTools` hard-blocks them (overrides everything including bypassPermissions).

Execute mode additionally enables: file checkpointing (track all changes, enable undo via `Query.rewindFiles()`), sandbox (filesystem writes scoped to target repo, `allowUnsandboxedCommands: false`). The `Query` handle is stored in `undo.ts` for the `undo_last_execute` tool.

## Critical Implementation Detail

Spawned agents use `systemPrompt: { type: "preset", preset: "claude_code", append: modePrompt }` to get full Claude Code behavior including CLAUDE.md loading in the target repo. The `cwd` option sets the working directory for the spawned agent.

## Configuration

The server reads from `.env` (searched in order: `SIBLING_ENV_PATH` env var → `~/.sibling-repo/.env` → `./.env`):
- `SIBLING_REPOS` — JSON map of short names to absolute paths (e.g., `{"backend":"/path/to/api"}`)
- `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` (subscription auth)
- `SIBLING_MODEL_EXPLORE`, `SIBLING_MODEL_PLAN`, `SIBLING_MODEL_EXECUTE` — optional model overrides
- `SIBLING_MAX_TURNS` — max agent turns (default: 50)

## Error Handling Convention

All errors are returned as MCP tool responses with `isError: true`, never thrown exceptions. This ensures the calling agent gets useful messages.
