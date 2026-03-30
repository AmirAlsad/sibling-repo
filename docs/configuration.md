# Configuration

sibling-repo reads its configuration from a `.env` file. On startup, it searches the following locations in order and uses the first one found:

| Priority | Location | Purpose |
|----------|----------|---------|
| 1 | `SIBLING_ENV_PATH` env var | Explicit override — point to any `.env` file |
| 2 | `~/.sibling-repo/.env` | User-level default, shared across all projects |
| 3 | `./.env` | Current working directory |

The user-level path (`~/.sibling-repo/.env`) is the default because the `.env` contains your personal OAuth token and machine-specific absolute paths — values that differ per developer, not per project.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIBLING_REPOS` | Yes | — | JSON map of repo names to absolute paths |
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | — | OAuth token from `claude setup-token` |
| `SIBLING_MODEL_EXPLORE` | No | `sonnet` | Default model for explore mode |
| `SIBLING_MODEL_PLAN` | No | `opus` | Default model for plan mode |
| `SIBLING_MODEL_EXECUTE` | No | `opus` | Default model for execute mode |
| `SIBLING_MAX_TURNS` | No | `50` | Max agent turns before termination |

## `SIBLING_REPOS` Format

A JSON object mapping short names (used in tool calls) to absolute paths:

```json
{
  "backend": "/Users/you/repos/api-server",
  "frontend": "/Users/you/repos/web-app",
  "shared": "/Users/you/repos/shared-lib"
}
```

Paths support `~` and `$HOME` expansion. Missing paths produce a startup warning but don't prevent the server from running.

## Per-Project Configuration

If you work on multiple multi-repo projects with different sibling repos, you'll want per-project config. Two options:

### Option A: `SIBLING_ENV_PATH` in the MCP Registration

Pass an environment variable pointing to a project-specific `.env` file:

```bash
claude mcp add --scope project sibling-repo \
  -e SIBLING_ENV_PATH=/path/to/your-project/.sibling-repo/.env \
  -- npx -y sibling-repo
```

### Option B: `.env` in the Project Root

If sibling-repo doesn't find the first two locations, it falls back to `./.env` in the current directory. Place your config there (and add `.env` to your `.gitignore` since it contains your token):

```bash
cat > .env << 'EOF'
CLAUDE_CODE_OAUTH_TOKEN=<your-token>
SIBLING_REPOS={"backend":"../backend","frontend":"../frontend"}
EOF
```
