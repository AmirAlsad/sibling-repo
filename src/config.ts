import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RepoEntry, SiblingConfig } from "./types.js";

function resolvePath(rawPath: string): string {
  const home = homedir();
  if (rawPath.startsWith("~/")) {
    return join(home, rawPath.slice(2));
  }
  return rawPath.replace(/\$HOME/g, home);
}

function findEnvFile(): string | null {
  const candidates = [
    process.env.SIBLING_ENV_PATH,
    join(homedir(), ".sibling-repo", ".env"),
    join(process.cwd(), ".env"),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function loadConfig(): SiblingConfig {
  const envPath = findEnvFile();
  if (envPath) {
    dotenvConfig({ path: envPath });
    console.error(`[sibling-repo] Loaded config from ${envPath}`);
  } else {
    console.error(
      "[sibling-repo] No .env file found. Checking environment variables..."
    );
  }

  const rawRepos = process.env.SIBLING_REPOS;
  if (!rawRepos) {
    throw new Error(
      'SIBLING_REPOS is not set. Create ~/.sibling-repo/.env with:\n' +
        'SIBLING_REPOS={"backend":"/path/to/backend","frontend":"/path/to/frontend"}\n' +
        "See README.md for setup instructions."
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(rawRepos);
  } catch {
    throw new Error(
      `SIBLING_REPOS is not valid JSON: ${rawRepos}\n` +
        'Expected format: {"name":"/absolute/path"}'
    );
  }

  const repos = new Map<string, RepoEntry>();

  for (const [name, rawPath] of Object.entries(parsed)) {
    const resolvedPath = resolvePath(rawPath);
    const pathExists = existsSync(resolvedPath);
    const hasCLAUDEmd =
      pathExists && existsSync(join(resolvedPath, "CLAUDE.md"));

    if (!pathExists) {
      console.error(
        `[sibling-repo] Warning: repo "${name}" path does not exist: ${resolvedPath}`
      );
    } else {
      console.error(
        `[sibling-repo] Registered repo "${name}" → ${resolvedPath}${hasCLAUDEmd ? " (has CLAUDE.md)" : ""}`
      );
    }

    repos.set(name, { name, path: resolvedPath, hasCLAUDEmd });
  }

  const models = {
    explore: process.env.SIBLING_MODEL_EXPLORE ?? "sonnet",
    plan: process.env.SIBLING_MODEL_PLAN ?? "opus",
    execute: process.env.SIBLING_MODEL_EXECUTE ?? "opus",
  };

  const maxTurns = parseInt(process.env.SIBLING_MAX_TURNS ?? "50", 10);

  console.error(
    `[sibling-repo] ${repos.size} repo(s) configured, maxTurns=${maxTurns}`
  );

  return { repos, models, maxTurns };
}
