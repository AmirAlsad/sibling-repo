# Changelog

## 0.1.0 (2026-03-29)

### Added

- `ask_repo` tool — spawn a Claude Code agent in a sibling repository with explore, plan, or execute mode
- `list_repos` tool — discover configured repositories and their paths
- Subscription-friendly auth via `CLAUDE_CODE_OAUTH_TOKEN`
- Configurable default models per mode (`SIBLING_MODEL_EXPLORE`, `SIBLING_MODEL_PLAN`, `SIBLING_MODEL_EXECUTE`)
- `.env` file loading with search order: `SIBLING_ENV_PATH` → `~/.sibling-repo/.env` → `./.env`
- Full CLAUDE.md loading in spawned agents via `claude_code` system prompt preset
- Path validation with startup warnings for missing repos
