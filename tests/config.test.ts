import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to test loadConfig which reads process.env and calls dotenv.
// We'll manipulate process.env directly and use temp directories for repo paths.

const TEST_DIR = join(tmpdir(), "sibling-repo-test-" + process.pid);
const REPO_A = join(TEST_DIR, "repo-a");
const REPO_B = join(TEST_DIR, "repo-b");

function freshImport() {
  // Bust the module cache so loadConfig re-reads process.env
  vi.resetModules();
  return import("../src/config.js");
}

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Create temp directories
    mkdirSync(REPO_A, { recursive: true });
    mkdirSync(REPO_B, { recursive: true });

    // Clean env vars that loadConfig reads
    delete process.env.SIBLING_REPOS;
    delete process.env.SIBLING_ENV_PATH;
    delete process.env.SIBLING_MODEL_EXPLORE;
    delete process.env.SIBLING_MODEL_PLAN;
    delete process.env.SIBLING_MODEL_EXECUTE;
    delete process.env.SIBLING_MAX_TURNS;
  });

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
    // Clean up temp dirs
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("parses SIBLING_REPOS from environment", async () => {
    process.env.SIBLING_REPOS = JSON.stringify({
      "repo-a": REPO_A,
      "repo-b": REPO_B,
    });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.repos.size).toBe(2);
    expect(config.repos.get("repo-a")).toEqual({
      name: "repo-a",
      path: REPO_A,
      hasCLAUDEmd: false,
    });
    expect(config.repos.get("repo-b")?.path).toBe(REPO_B);
  });

  it("detects CLAUDE.md in repo", async () => {
    writeFileSync(join(REPO_A, "CLAUDE.md"), "# Test");

    process.env.SIBLING_REPOS = JSON.stringify({ "repo-a": REPO_A });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.repos.get("repo-a")?.hasCLAUDEmd).toBe(true);
  });

  it("throws when SIBLING_REPOS is not set", async () => {
    delete process.env.SIBLING_REPOS;

    const { loadConfig } = await freshImport();
    expect(() => loadConfig()).toThrow("SIBLING_REPOS is not set");
  });

  it("throws on invalid JSON in SIBLING_REPOS", async () => {
    process.env.SIBLING_REPOS = "not-json";

    const { loadConfig } = await freshImport();
    expect(() => loadConfig()).toThrow("SIBLING_REPOS is not valid JSON");
  });

  it("warns but doesn't throw for missing repo paths", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env.SIBLING_REPOS = JSON.stringify({
      missing: "/nonexistent/path/that/does/not/exist",
    });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    // Repo is still registered even though path doesn't exist
    expect(config.repos.size).toBe(1);
    expect(config.repos.get("missing")?.path).toBe(
      "/nonexistent/path/that/does/not/exist"
    );

    // Warning was logged
    const warnings = stderrSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === "string" && m.includes("Warning"));
    expect(warnings.length).toBeGreaterThan(0);

    stderrSpy.mockRestore();
  });

  it("uses default model values", async () => {
    process.env.SIBLING_REPOS = JSON.stringify({ "repo-a": REPO_A });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.models).toEqual({
      explore: "sonnet",
      plan: "opus",
      execute: "opus",
    });
  });

  it("respects model overrides from environment", async () => {
    process.env.SIBLING_REPOS = JSON.stringify({ "repo-a": REPO_A });
    process.env.SIBLING_MODEL_EXPLORE = "haiku";
    process.env.SIBLING_MODEL_PLAN = "sonnet";
    process.env.SIBLING_MODEL_EXECUTE = "sonnet";

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.models).toEqual({
      explore: "haiku",
      plan: "sonnet",
      execute: "sonnet",
    });
  });

  it("uses default maxTurns of 50", async () => {
    process.env.SIBLING_REPOS = JSON.stringify({ "repo-a": REPO_A });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.maxTurns).toBe(50);
  });

  it("respects SIBLING_MAX_TURNS override", async () => {
    process.env.SIBLING_REPOS = JSON.stringify({ "repo-a": REPO_A });
    process.env.SIBLING_MAX_TURNS = "25";

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.maxTurns).toBe(25);
  });

  it("loads config from SIBLING_ENV_PATH", async () => {
    const envFile = join(TEST_DIR, "custom.env");
    writeFileSync(
      envFile,
      `SIBLING_REPOS={"repo-a":"${REPO_A}"}\nSIBLING_MAX_TURNS=10\n`
    );
    process.env.SIBLING_ENV_PATH = envFile;

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.repos.size).toBe(1);
    expect(config.maxTurns).toBe(10);
  });

  it("resolves $HOME in repo paths", async () => {
    // Use a path with $HOME that resolves to our test dir won't work literally,
    // but we can test the mechanism by checking a path that exists
    const homedir = (await import("node:os")).homedir();
    process.env.SIBLING_REPOS = JSON.stringify({ home: "$HOME" });

    const { loadConfig } = await freshImport();
    const config = loadConfig();

    expect(config.repos.get("home")?.path).toBe(homedir);
  });
});
