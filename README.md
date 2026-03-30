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

Register sibling-repo as an MCP server with Claude Code. No installation required — npx downloads and runs the latest version automatically:

```bash
claude mcp add --scope user sibling-repo -- npx -y sibling-repo
```

Or with a global install for faster startup:

```bash
npm install -g sibling-repo
claude mcp add --scope user sibling-repo -- sibling-repo
```

To verify: run `claude mcp list` or use `/mcp` inside a Claude Code session.

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

## Documentation

| Document | Description |
|----------|-------------|
| [Configuration](docs/configuration.md) | Environment variables, `.env` locations, per-project setup |
| [Usage](docs/usage.md) | Tools, agent modes, conversation persistence, examples |
| [Development](docs/development.md) | Contributing, project structure, running tests |

## Troubleshooting

**"SIBLING_REPOS is not set"**
Create `~/.sibling-repo/.env` with your repo configuration. See [Configuration](docs/configuration.md).

**"Authentication failed"**
Run `claude setup-token` to generate a fresh OAuth token and update your `.env` file. Ensure `ANTHROPIC_API_KEY` is not set in your shell (it takes precedence over OAuth).

**"Repo path does not exist"**
Check the path in your `SIBLING_REPOS` configuration. Paths must be absolute. `~` and `$HOME` are expanded automatically.

**Agent returns no result**
The spawned agent may have hit `SIBLING_MAX_TURNS`. Increase the limit in your `.env` or write a more specific prompt.

## Updating

- **npx:** Updates are automatic — `npx -y` fetches the latest version on each launch.
- **Global install:** Run `npm update -g sibling-repo`.
- **Local clone:** `git pull && npm install && npm run build`

## License

[MIT](LICENSE)
