# sibling-repo

[![npm version](https://img.shields.io/npm/v/sibling-repo.svg)](https://www.npmjs.com/package/sibling-repo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An MCP server that gives Claude Code agents the ability to spawn fully contextualized Claude Code sessions in sibling repositories. Ask questions about a backend API from your frontend repo, plan cross-repo implementations, or trigger changes in another codebase — all through a single tool call.

## Quick Start

```bash
# 1. Generate an OAuth token from your Claude subscription
claude setup-token
# Copy the output token

# 2. Create config directory and .env file
mkdir -p ~/.sibling-repo
cat > ~/.sibling-repo/.env << 'EOF'
CLAUDE_CODE_OAUTH_TOKEN=<paste-your-token-here>
SIBLING_REPOS={"backend":"/path/to/backend","frontend":"/path/to/frontend"}
EOF

# 3. Register with Claude Code (npx — no install needed)
claude mcp add --scope user sibling-repo -- npx -y sibling-repo

# 4. Launch Claude Code and try it
claude
> Use sibling-repo to explore the backend and find the check-in endpoint contract
```

## Installation

Register sibling-repo as an MCP server with Claude Code using `claude mcp add`. Choose a **scope** that matches how you want it available:

| Scope | Flag | Config location | When to use |
|-------|------|----------------|-------------|
| **user** | `--scope user` | `~/.claude.json` | Available in every project on this machine (recommended for most users) |
| **project** | `--scope project` | `.claude/settings.json` (committed) | Shared with your team via version control |
| **local** | `--scope local` | `.claude/settings.local.json` (gitignored) | Per-project, private to your machine |

### Via npx (recommended)

No installation required — npx downloads and runs the latest version automatically:

```bash
# User scope — available everywhere (recommended)
claude mcp add --scope user sibling-repo -- npx -y sibling-repo

# Project scope — shared with your team via git
claude mcp add --scope project sibling-repo -- npx -y sibling-repo

# Local scope — this project only, not committed to git
claude mcp add --scope local sibling-repo -- npx -y sibling-repo
```

### Via global install

If you prefer a faster startup (no npx download on each launch):

```bash
npm install -g sibling-repo

claude mcp add --scope user sibling-repo -- sibling-repo
```

### Via local clone (for contributors)

```bash
git clone https://github.com/AmirAlsad/sibling-repo.git
cd sibling-repo
npm install && npm run build

claude mcp add --scope user sibling-repo -- node /absolute/path/to/sibling-repo/dist/server.js
```

### Verifying installation

```bash
# Check the server is registered
claude mcp list

# In a Claude Code session, check MCP status
> /mcp

# Test it
> Use the sibling-repo tool to list available repos
```

To remove the server:

```bash
claude mcp remove sibling-repo
```

## How It Works

```
┌─────────────────────────────────────────────┐
│  Claude Code session (e.g., in frontend repo)│
│                                             │
│  Agent calls: ask_repo("backend", prompt)   │
│         │                                   │
│         ▼                                   │
│  ┌─────────────────────────┐                │
│  │  sibling-repo MCP server│ (stdio)        │
│  │  (Node.js process)      │                │
│  └──────────┬──────────────┘                │
│             │                               │
└─────────────┼───────────────────────────────┘
              │  Spawns via Claude Agent SDK
              ▼
┌─────────────────────────────────────────────┐
│  Ephemeral Claude Code session              │
│  cwd: ~/repos/backend                       │
│  Loads backend's CLAUDE.md automatically    │
│  Tools scoped by mode (explore/plan/execute)│
│  Returns result to MCP server               │
└─────────────────────────────────────────────┘
```

When you call `ask_repo`, sibling-repo spawns a real Claude Code session in the target repository using the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview). The spawned agent loads the target repo's `CLAUDE.md`, has tools scoped to that directory, and operates in a configurable mode. From the calling agent's perspective, it's a single tool call that returns the sibling agent's answer.

## Tools

### `ask_repo`

Spawn a Claude Code agent in a sibling repository.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repo` | string | required | Repository short name from `SIBLING_REPOS` |
| `prompt` | string | required | The task or question for the sibling agent |
| `mode` | `"explore"` \| `"plan"` \| `"execute"` | `"explore"` | Agent mode |
| `model` | string | per-mode default | Model override: `"haiku"`, `"sonnet"`, `"opus"` |

### `undo_last_execute`

Revert all file changes from the last execute-mode run on a sibling repository. Restores files to their state before the execute agent made changes. Only the most recent execute per repo can be undone.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repo` | string | required | Repository short name to undo changes in |

### `list_repos`

Returns the configured repositories and their paths. No parameters.

## Agent Modes

| Mode | Default Model | Tools | Purpose |
|------|--------------|-------|---------|
| **explore** | sonnet | Read, Grep, Glob, Bash (read-only) | Codebase investigation — find endpoints, schemas, architecture |
| **plan** | opus | Read, Grep, Glob, Bash (read-only) | Design implementation plans without making changes |
| **execute** | opus | Read, Grep, Glob, Bash, Write, Edit, MultiEdit | Make changes in the sibling repo (requires plan + approval first) |

> **Plan before execute:** The `execute` mode requires a prior `plan` call and user approval. The orchestrator agent is instructed to always run `plan` first, present the plan to you for approval, and then pass the approved plan into `execute` as the prompt. This ensures you always review what will change before any code is written.

> **Safety:** Execute mode enables file checkpointing (all changes are tracked and can be reverted with `undo_last_execute`) and sandboxing (filesystem writes are restricted to the target repo, and `dangerouslyDisableSandbox` is blocked).

## Configuration

sibling-repo reads its configuration from a `.env` file. On startup, it searches the following locations in order and uses the first one found:

| Priority | Location | Purpose |
|----------|----------|---------|
| 1 | `SIBLING_ENV_PATH` env var | Explicit override — point to any `.env` file |
| 2 | `~/.sibling-repo/.env` | User-level default, shared across all projects |
| 3 | `./.env` | Current working directory |

The user-level path (`~/.sibling-repo/.env`) is the default because the `.env` contains your personal OAuth token and machine-specific absolute paths — values that differ per developer, not per project. This works well when you register sibling-repo at **user scope** and work on a single multi-repo project.

### Per-project configuration

If you work on multiple multi-repo projects with different sibling repos, or register the MCP at **project** or **local** scope, you'll want per-project config instead. Two options:

**Option A: Use `SIBLING_ENV_PATH` in the MCP registration.** Pass an environment variable pointing to a project-specific `.env` file:

```bash
# Register with a project-specific .env
claude mcp add --scope project sibling-repo \
  -e SIBLING_ENV_PATH=/path/to/your-project/.sibling-repo/.env \
  -- npx -y sibling-repo
```

**Option B: Use a `.env` in the project root.** If sibling-repo doesn't find the first two locations, it falls back to `./.env` in the current directory. Place your config there (and add `.env` to your `.gitignore` since it contains your token):

```bash
# In your project root
cat > .env << 'EOF'
CLAUDE_CODE_OAUTH_TOKEN=<your-token>
SIBLING_REPOS={"backend":"../backend","frontend":"../frontend"}
EOF
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIBLING_REPOS` | Yes | — | JSON map of repo names to absolute paths |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | — | OAuth token from `claude setup-token` |
| `SIBLING_MODEL_EXPLORE` | No | `sonnet` | Default model for explore mode |
| `SIBLING_MODEL_PLAN` | No | `opus` | Default model for plan mode |
| `SIBLING_MODEL_EXECUTE` | No | `opus` | Default model for execute mode |
| `SIBLING_MAX_TURNS` | No | `50` | Max agent turns before termination |

### `SIBLING_REPOS` format

A JSON object mapping short names (used in tool calls) to absolute paths:

```json
{
  "backend": "/Users/you/repos/api-server",
  "frontend": "/Users/you/repos/web-app",
  "shared": "/Users/you/repos/shared-lib"
}
```

Paths support `~` and `$HOME` expansion. Missing paths produce a startup warning but don't prevent the server from running.

## Usage Examples

**Explore a backend API from the frontend:**
```
ask_repo("backend", "What is the HTTP method, path, request body, and response shape for the user check-in endpoint?")
```

**Plan a cross-repo feature:**
```
ask_repo("backend", "Design a new GET endpoint at /api/v1/workouts/history that returns the user's last 30 workout sessions. Follow existing route patterns.", "plan")
```

**Execute changes in a sibling repo (plan → approve → execute):**
```
# 1. Generate a plan
ask_repo("backend", "Design a new GET endpoint at /api/v1/workouts/history that returns the user's last 30 sessions from Firestore.", "plan")

# 2. The orchestrator presents the plan to you for approval

# 3. After approval, the orchestrator passes the plan to execute
ask_repo("backend", "<the approved plan>", "execute")
```

## Development

```bash
git clone https://github.com/AmirAlsad/sibling-repo.git
cd sibling-repo
npm install
npm run build
npm test

# Development with auto-reload
npm run dev
```

### Project Structure

```
src/
  server.ts      MCP server entry point, tool registration
  agent.ts       Claude Agent SDK wrapper, mode configurations
  prompts.ts     System prompt constants (explore/plan/execute)
  config.ts      .env loading, SIBLING_REPOS parsing, path validation
  types.ts       Shared TypeScript types
tests/
  config.test.ts Config parsing, path resolution, defaults
  agent.test.ts  Mode configs, result extraction, error handling
  server.test.ts MCP integration tests via stdio client transport
```

## Troubleshooting

**"SIBLING_REPOS is not set"**
Create `~/.sibling-repo/.env` with your repo configuration. See [Configuration](#configuration).

**"Authentication failed"**
Run `claude setup-token` to generate a fresh OAuth token and update your `.env` file. Ensure `ANTHROPIC_API_KEY` is not set in your shell (it takes precedence over OAuth).

**"Repo path does not exist"**
Check the path in your `SIBLING_REPOS` configuration. Paths must be absolute. `~` and `$HOME` are expanded automatically.

**Agent returns no result**
The spawned agent may have hit `SIBLING_MAX_TURNS`. Increase the limit in your `.env` or write a more specific prompt.

## Updating

How you receive updates depends on your installation method:

- **npx (recommended):** Updates are automatic. The `-y` flag in `npx -y sibling-repo` fetches the latest version from npm on each launch.
- **Global install:** Run `npm update -g sibling-repo` to pull the latest version.
- **Local clone:** Pull the latest changes and rebuild:
  ```bash
  git pull && npm install && npm run build
  ```

No changes to your MCP registration or `.env` configuration are needed when updating — only the server binary changes.

## License

[MIT](LICENSE)
