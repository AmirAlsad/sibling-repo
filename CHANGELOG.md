# Changelog

## 0.1.1 (2026-03-30)

### Added

- Real-time stderr streaming of sub-agent thinking, text, and tool calls for CLI visibility
- `stderr-stream.ts` module with formatted output prefixes (`[thinking]`, `[text]`, `[tool:Name]`)

### Fixed

- Plan mode now returns the complete plan in its response text instead of referencing a non-existent plan file
- Changed plan mode from `permissionMode: "plan"` to `bypassPermissions` to avoid triggering Claude Code's built-in plan-file behavior

## 0.1.0 (2026-03-29)

### Added

- `ask_repo` tool — spawn a Claude Code agent in a sibling repository with explore, plan, or execute mode
- `list_repos` tool — discover configured repositories and their paths
- Subscription-friendly auth via `CLAUDE_CODE_OAUTH_TOKEN`
- Configurable default models per mode (`SIBLING_MODEL_EXPLORE`, `SIBLING_MODEL_PLAN`, `SIBLING_MODEL_EXECUTE`)
- `.env` file loading with search order: `SIBLING_ENV_PATH` → `~/.sibling-repo/.env` → `./.env`
- Full CLAUDE.md loading in spawned agents via `claude_code` system prompt preset
- Path validation with startup warnings for missing repos
