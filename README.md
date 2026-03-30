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

### `list_repos`

Returns the configured repositories and their paths. No parameters.

## Agent Modes

| Mode | Default Model | Tools | Purpose |
|------|--------------|-------|---------|
| **explore** | sonnet | Read, Grep, Glob, Bash (read-only) | Codebase investigation — find endpoints, schemas, architecture |
| **plan** | opus | Read, Grep, Glob, Bash (read-only) | Design implementation plans without making changes |
| **execute** | opus | Read, Grep, Glob, Bash, Write, Edit, MultiEdit | Make changes in the sibling repo |

## Configuration

sibling-repo reads from a `.env` file, searched in order:

1. `SIBLING_ENV_PATH` environment variable (explicit override)
2. `~/.sibling-repo/.env` (user-level default)
3. `./.env` (current directory)

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

**Execute changes in a sibling repo:**
```
ask_repo("backend", "Create a new GET endpoint at /api/v1/workouts/history that returns the user's last 30 sessions from Firestore.", "execute")
```

## Development

```bash
# Clone and build
git clone https://github.com/AmirAlsad/sibling-repo.git
cd sibling-repo
npm install
npm run build

# Run tests
npm test

# Register local build with Claude Code
claude mcp add --scope user sibling-repo -- node ./dist/server.js

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

## License

[MIT](LICENSE)
