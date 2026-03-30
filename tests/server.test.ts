import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TEST_DIR = join(tmpdir(), "sibling-server-test-" + process.pid);
const REPO_A = join(TEST_DIR, "repo-a");

describe("MCP Server Integration", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeEach(async () => {
    mkdirSync(REPO_A, { recursive: true });
    writeFileSync(join(REPO_A, "CLAUDE.md"), "# Test Repo");

    transport = new StdioClientTransport({
      command: "node",
      args: [join(process.cwd(), "dist", "server.js")],
      env: {
        ...process.env,
        SIBLING_REPOS: JSON.stringify({ "repo-a": REPO_A }),
        // Point to a non-existent env file so it doesn't load user's real config
        SIBLING_ENV_PATH: join(TEST_DIR, "nonexistent.env"),
      },
    });

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("lists available tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("ask_repo");
    expect(toolNames).toContain("list_repos");
  });

  it("ask_repo tool has correct input schema", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.inputSchema.properties).toHaveProperty("repo");
    expect(askRepo.inputSchema.properties).toHaveProperty("prompt");
    expect(askRepo.inputSchema.properties).toHaveProperty("mode");
    expect(askRepo.inputSchema.properties).toHaveProperty("model");
    expect(askRepo.inputSchema.required).toContain("repo");
    expect(askRepo.inputSchema.required).toContain("prompt");
  });

  it("ask_repo description includes available repos", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.description).toContain("repo-a");
  });

  it("list_repos returns configured repositories", async () => {
    const result = await client.callTool({
      name: "list_repos",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");

    const repos = JSON.parse(content[0].text);
    expect(repos).toHaveLength(1);
    expect(repos[0]).toEqual({
      name: "repo-a",
      path: REPO_A,
      has_claude_md: true,
    });
  });

  it("ask_repo returns error for unknown repo", async () => {
    const result = await client.callTool({
      name: "ask_repo",
      arguments: {
        repo: "nonexistent",
        prompt: "test",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('Unknown repo "nonexistent"');
    expect(content[0].text).toContain("repo-a");
  });

  it("ask_repo returns error for repo with deleted path", async () => {
    // Remove the repo directory after config was loaded
    rmSync(REPO_A, { recursive: true, force: true });

    const result = await client.callTool({
      name: "ask_repo",
      arguments: {
        repo: "repo-a",
        prompt: "test",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Repo path does not exist");
  });
});
