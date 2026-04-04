# Development

## Setup

```bash
git clone https://github.com/AmirAlsad/sibling-repo.git
cd sibling-repo
npm install
npm run build
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run tests (vitest) |
| `npm run dev` | Development with auto-reload (tsx watch) |
| `node dist/server.js` | Run the MCP server directly |

## Project Structure

```
src/
  server.ts           MCP server entry point, tool registration
  agent.ts            Claude Agent SDK wrapper, mode configurations
  conversations.ts    In-memory conversation store
  jobs.ts             In-memory background job store
  stderr-stream.ts    Streams sub-agent activity to stderr for CLI visibility
  undo.ts             Execute undo state management
  prompts.ts          System prompt constants (explore/plan/execute)
  config.ts           .env loading, SIBLING_REPOS parsing, path validation
  types.ts            Shared TypeScript types
tests/
  config.test.ts      Config parsing, path resolution, defaults
  agent.test.ts       Mode configs, result extraction, checkpointing
  conversations.test.ts  Conversation store CRUD operations
  jobs.test.ts        Background job store CRUD operations
  stderr-stream.test.ts  Stderr streaming formatter unit tests
  undo.test.ts        Undo state management, rewind operations
  server.test.ts      MCP integration tests via stdio client transport
```

## Registering a Local Build

```bash
claude mcp add --scope user sibling-repo -- node /absolute/path/to/sibling-repo/dist/server.js
```
