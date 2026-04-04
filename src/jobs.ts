import { randomUUID } from "node:crypto";
import type { AgentMode, BackgroundJob } from "./types.js";

const jobs = new Map<string, BackgroundJob>();

export function createJob(
  repo: string,
  mode: AgentMode,
  prompt: string,
  conversationId: string
): BackgroundJob {
  const job: BackgroundJob = {
    id: randomUUID(),
    status: "running",
    conversationId,
    repo,
    mode,
    prompt,
    createdAt: new Date(),
    hasCheckpoint: false,
  };
  jobs.set(job.id, job);
  return job;
}

export function completeJob(
  jobId: string,
  result: string,
  hasCheckpoint: boolean
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "completed";
  job.result = result;
  job.hasCheckpoint = hasCheckpoint;
  job.completedAt = new Date();
}

export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.error = error;
  job.completedAt = new Date();
}

export function getJob(jobId: string): BackgroundJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(): BackgroundJob[] {
  return Array.from(jobs.values());
}
