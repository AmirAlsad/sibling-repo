# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**sibling-repo** is an MCP server (stdio transport) that lets a Claude Code agent spawn fully contextualized Claude Code sessions in sibling repositories. It exposes four tools — `ask_repo` (spawn or resume an agent in a configured repo with explore/plan/execute mode), `undo_last_execute` (revert file changes from a conversation's execute run), `list_repos` (discover configured repos), and `list_conversations` (see active conversations). Conversations persist in-memory for the MCP server's lifetime, enabling multi-turn workflows like explore → plan → execute with full context preserved. Built on the Claude Agent SDK and MCP SDK.

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
  conversations.ts — In-memory conversation store; create/get/update/list conversations
  stderr-stream.ts — Streams sub-agent thinking, text, and tool calls to stderr for CLI visibility
  undo.ts      — Execute undo state management; stores Query handles for rewindFiles (keyed by conversation ID)
  prompts.ts   — System prompt constants for explore/plan/execute modes
  config.ts    — .env loading (SIBLING_ENV_PATH → ~/.sibling-repo/.env → ./.env),
                 SIBLING_REPOS JSON parsing, path validation
  types.ts     — Shared TypeScript types (includes Conversation, ExecuteCheckpoint, AgentResult)
tests/
  config.test.ts  — Config parsing, path resolution, defaults
  agent.test.ts   — Mode configs, result extraction, checkpointing, resume, sandbox (mocked SDK)
  conversations.test.ts — Conversation store CRUD operations
  stderr-stream.test.ts — Stderr streaming formatter unit tests
  undo.test.ts    — Undo state management, rewind operations (keyed by conversation ID)
  server.test.ts  — MCP integration tests via stdio client transport
```

**Key dependencies:** `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `dotenv`, `zod`

## Agent Modes

| Mode | allowedTools | disallowedTools | Permission | Default Model |
|------|-------------|-----------------|-----------|---------------|
| explore | Read, Grep, Glob, Bash | Write, Edit, MultiEdit | bypassPermissions | sonnet |
| plan | Read, Grep, Glob, Bash | Write, Edit, MultiEdit | bypassPermissions | opus |
| execute | Read, Grep, Glob, Bash, Write, Edit, MultiEdit | (none) | acceptEdits | opus |

`allowedTools` auto-approves tools; `disallowedTools` hard-blocks them (overrides everything including bypassPermissions). Both explore and plan modes use `bypassPermissions` with Write/Edit/MultiEdit in `disallowedTools` to ensure read-only access without triggering Claude Code's built-in plan-mode file-writing behavior.

Execute mode additionally enables: file checkpointing (track all changes, enable undo via `Query.rewindFiles()`), sandbox (filesystem writes scoped to target repo, `allowUnsandboxedCommands: false`). The `Query` handle is stored in `undo.ts` keyed by conversation ID for the `undo_last_execute` tool.

## Conversation Persistence

Conversations enable multi-turn workflows with full context preservation across `ask_repo` calls. The SDK's `resume: sessionId` feature handles server-side session continuity.

- **Creation**: Omit `conversation_id` from `ask_repo` — a new conversation is created and its ID returned in the response.
- **Resumption**: Pass `conversation_id` to continue with full context. Mode can change between turns (e.g., explore → plan → execute).
- **Storage**: In-memory `Map` in `conversations.ts`. Dies with the MCP server process (which dies with the orchestrating agent).
- **Undo**: Keyed by conversation ID, not repo name. Multiple execute conversations on the same repo each get independent undo.
- **Metadata**: Each conversation tracks: ID, repo, session ID, last mode, created_at, last_used_at, result snippet, turn count.

## Stderr Streaming

All sub-agent activity is streamed to stderr in real-time via `includePartialMessages: true`. The `stderr-stream.ts` module formats `SDKPartialAssistantMessage` events with prefixes: `[thinking]`, `[text]`, `[tool:Name]`. This is always on — stderr is safe since the MCP protocol uses stdin/stdout.

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
