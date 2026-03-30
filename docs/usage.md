# Usage

## Tools

### `ask_repo`

Spawn a Claude Code agent in a sibling repository.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repo` | string | required | Repository short name from `SIBLING_REPOS` |
| `prompt` | string | required | The task or question for the sibling agent |
| `mode` | `"explore"` \| `"plan"` \| `"execute"` | `"explore"` | Agent mode |
| `model` | string | per-mode default | Model override: `"haiku"`, `"sonnet"`, `"opus"` |
| `conversation_id` | string | — | Resume an existing conversation |

### `undo_last_execute`

Revert all file changes from the last execute-mode run on a sibling repository. Only the most recent execute per conversation can be undone.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repo` | string | required | Repository short name to undo changes in |

### `list_repos`

Returns the configured repositories and their paths. No parameters.

### `list_conversations`

Returns active conversations and their metadata. No parameters.

## Agent Modes

| Mode | Default Model | Tools | Purpose |
|------|--------------|-------|---------|
| **explore** | sonnet | Read, Grep, Glob, Bash (read-only) | Codebase investigation — find endpoints, schemas, architecture |
| **plan** | opus | Read, Grep, Glob, Bash (read-only) | Design implementation plans without making changes |
| **execute** | opus | Read, Grep, Glob, Bash, Write, Edit, MultiEdit | Make changes in the sibling repo (requires plan + approval first) |

### Plan Before Execute

The `execute` mode requires a prior `plan` call and user approval. The orchestrator agent is instructed to always run `plan` first, present the plan to you for approval, and then pass the approved plan into `execute` as the prompt.

### Execute Safety

Execute mode enables file checkpointing (all changes are tracked and can be reverted with `undo_last_execute`) and sandboxing (filesystem writes are restricted to the target repo).

## Conversation Persistence

Conversations enable multi-turn workflows with full context preserved across `ask_repo` calls.

- **New conversation**: Omit `conversation_id` — a new conversation is created and its ID returned.
- **Resume**: Pass `conversation_id` to continue with full context. Mode can change between turns (e.g., explore -> plan -> execute).
- **Lifetime**: Conversations are stored in-memory and persist for the MCP server's lifetime (which matches the orchestrating agent's session).

## Examples

**Explore a backend API from the frontend:**
```
ask_repo("backend", "What is the HTTP method, path, request body, and response shape for the user check-in endpoint?")
```

**Plan a cross-repo feature:**
```
ask_repo("backend", "Design a new GET endpoint at /api/v1/workouts/history that returns the user's last 30 workout sessions. Follow existing route patterns.", "plan")
```

**Execute changes (plan -> approve -> execute):**
```
# 1. Generate a plan
ask_repo("backend", "Design a new GET endpoint at /api/v1/workouts/history that returns the user's last 30 sessions from Firestore.", "plan")

# 2. The orchestrator presents the plan to you for approval

# 3. After approval, the orchestrator passes the plan to execute
ask_repo("backend", "<the approved plan>", "execute")
```
