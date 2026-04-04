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

  it("lists available tools including list_conversations", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("ask_repo");
    expect(toolNames).toContain("undo_last_execute");
    expect(toolNames).toContain("list_repos");
    expect(toolNames).toContain("list_conversations");
  });

  it("ask_repo tool has conversation_id in input schema", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.inputSchema.properties).toHaveProperty("repo");
    expect(askRepo.inputSchema.properties).toHaveProperty("prompt");
    expect(askRepo.inputSchema.properties).toHaveProperty("mode");
    expect(askRepo.inputSchema.properties).toHaveProperty("model");
    expect(askRepo.inputSchema.properties).toHaveProperty("conversation_id");
    expect(askRepo.inputSchema.required).toContain("repo");
    expect(askRepo.inputSchema.required).toContain("prompt");
    // conversation_id should be optional
    expect(askRepo.inputSchema.required).not.toContain("conversation_id");
  });

  it("ask_repo description includes conversation guidance", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.description).toContain("repo-a");
    expect(askRepo.description).toContain("conversation_id");
  });

  it("ask_repo description requires plan before execute", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.description).toContain("Always run \"plan\" mode first");
    expect(askRepo.description).toContain("user approval");
  });

  it("undo_last_execute uses conversation_id parameter", async () => {
    const { tools } = await client.listTools();
    const undo = tools.find((t) => t.name === "undo_last_execute")!;

    expect(undo.inputSchema.properties).toHaveProperty("conversation_id");
    expect(undo.inputSchema.properties).not.toHaveProperty("repo");
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

  it("list_conversations returns empty initially", async () => {
    const result = await client.callTool({
      name: "list_conversations",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("No active conversations.");
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

  it("ask_repo returns error for unknown conversation_id", async () => {
    const result = await client.callTool({
      name: "ask_repo",
      arguments: {
        repo: "repo-a",
        prompt: "test",
        conversation_id: "nonexistent-conv-id",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('Conversation "nonexistent-conv-id" not found');
  });

  it("undo_last_execute returns error when no execute has been run", async () => {
    const result = await client.callTool({
      name: "undo_last_execute",
      arguments: { conversation_id: "some-conv-id" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("No execute session to undo");
  });

  it("lists check_job in available tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("check_job");
  });

  it("ask_repo tool has background in input schema", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.inputSchema.properties).toHaveProperty("background");
    // background should be optional (has default)
    expect(askRepo.inputSchema.required).not.toContain("background");
  });

  it("ask_repo description includes background guidance", async () => {
    const { tools } = await client.listTools();
    const askRepo = tools.find((t) => t.name === "ask_repo")!;

    expect(askRepo.description).toContain("background");
    expect(askRepo.description).toContain("check_job");
  });

  it("check_job returns empty list when no jobs exist", async () => {
    const result = await client.callTool({
      name: "check_job",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe("No background jobs.");
  });

  it("check_job returns error for unknown job_id", async () => {
    const result = await client.callTool({
      name: "check_job",
      arguments: { job_id: "nonexistent-job-id" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('Job "nonexistent-job-id" not found');
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
