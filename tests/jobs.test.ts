import { describe, it, expect } from "vitest";
import {
  createJob,
  completeJob,
  failJob,
  getJob,
  listJobs,
} from "../src/jobs.js";

describe("jobs", () => {
  it("createJob returns a job with running status and UUID", () => {
    const job = createJob("backend", "explore", "find the API", "conv-1");

    expect(job.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(job.status).toBe("running");
    expect(job.repo).toBe("backend");
    expect(job.mode).toBe("explore");
    expect(job.prompt).toBe("find the API");
    expect(job.conversationId).toBe("conv-1");
    expect(job.createdAt).toBeInstanceOf(Date);
    expect(job.hasCheckpoint).toBe(false);
    expect(job.completedAt).toBeUndefined();
    expect(job.result).toBeUndefined();
    expect(job.error).toBeUndefined();
  });

  it("getJob retrieves a stored job", () => {
    const job = createJob("backend", "plan", "plan the migration", "conv-2");
    expect(getJob(job.id)).toBe(job);
  });

  it("getJob returns undefined for unknown ID", () => {
    expect(getJob("nonexistent-job-id")).toBeUndefined();
  });

  it("completeJob sets status, result, hasCheckpoint, and completedAt", () => {
    const job = createJob("backend", "execute", "run it", "conv-3");
    completeJob(job.id, "Changes applied successfully", true);

    const updated = getJob(job.id)!;
    expect(updated.status).toBe("completed");
    expect(updated.result).toBe("Changes applied successfully");
    expect(updated.hasCheckpoint).toBe(true);
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("failJob sets status, error, and completedAt", () => {
    const job = createJob("backend", "explore", "investigate", "conv-4");
    failJob(job.id, "Auth token expired");

    const updated = getJob(job.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("Auth token expired");
    expect(updated.completedAt).toBeInstanceOf(Date);
  });

  it("completeJob is a no-op for unknown job ID", () => {
    expect(() => completeJob("unknown", "result", false)).not.toThrow();
  });

  it("failJob is a no-op for unknown job ID", () => {
    expect(() => failJob("unknown", "error")).not.toThrow();
  });

  it("listJobs returns all jobs", () => {
    const before = listJobs().length;

    createJob("repo1", "explore", "q1", "conv-5");
    createJob("repo2", "plan", "q2", "conv-6");

    const all = listJobs();
    expect(all.length).toBeGreaterThanOrEqual(before + 2);
  });
});
