import type { Look } from '@/stores/editorStore';

/**
 * Batch edit job (일괄 보정): pure data + pure transitions, persisted after
 * every step so a job survives the app being closed or killed. Photos are
 * processed one at a time (never all loaded at once); originals are never
 * written to — each result is a new photo.
 */

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export type BatchSource =
  | { kind: 'asset'; assetId: string; previewUri: string }
  | { kind: 'uri'; uri: string; takenAt: number | null };

export interface BatchItem {
  id: string;
  source: BatchSource;
  status: BatchItemStatus;
  attempts: number;
  error?: string;
  /** Saved result (file URI or data URL on web). */
  outputUri?: string;
  /** Result size (frame included). */
  width?: number;
  height?: number;
}

export type BatchState = 'running' | 'paused' | 'cancelled' | 'done';

export interface BatchJob {
  version: 1;
  id: string;
  createdAt: number;
  /** What is applied (a snapshot: later recipe edits don't change a running job). */
  look: Look;
  lookName: string;
  items: BatchItem[];
  state: BatchState;
}

export const BATCH_LIMIT = 50;

export function createJob(sources: readonly BatchSource[], look: Look, lookName: string, now = Date.now()): BatchJob {
  return {
    version: 1,
    id: `b${now.toString(36)}`,
    createdAt: now,
    look,
    lookName,
    items: sources.slice(0, BATCH_LIMIT).map((source, i) => ({ id: `i${i}`, source, status: 'pending', attempts: 0 })),
    state: 'running',
  };
}

export function nextPending(job: BatchJob): BatchItem | null {
  return job.items.find((i) => i.status === 'pending') ?? null;
}

export function updateItem(job: BatchJob, id: string, patch: Partial<BatchItem>): BatchJob {
  return { ...job, items: job.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

/** Stops after the photo in progress: everything still waiting is cancelled. */
export function cancelJob(job: BatchJob): BatchJob {
  return {
    ...job,
    state: 'cancelled',
    items: job.items.map((i) => (i.status === 'pending' ? { ...i, status: 'cancelled' } : i)),
  };
}

/** Failed (and cancelled) photos go back in the queue. */
export function retryFailed(job: BatchJob): BatchJob {
  return {
    ...job,
    state: 'running',
    items: job.items.map((i) => (i.status === 'failed' || i.status === 'cancelled' ? { ...i, status: 'pending', error: undefined } : i)),
  };
}

/**
 * After the app was closed mid-job: the photo that was being processed is
 * redone, and the job waits for the user to continue.
 */
export function recoverJob(job: BatchJob): BatchJob {
  const interrupted = job.items.some((i) => i.status === 'running') || (job.state === 'running' && nextPending(job) !== null);
  return {
    ...job,
    state: interrupted ? 'paused' : job.state,
    items: job.items.map((i) => (i.status === 'running' ? { ...i, status: 'pending' } : i)),
  };
}

export function summarize(job: BatchJob) {
  const count = (s: BatchItemStatus) => job.items.filter((i) => i.status === s).length;
  const done = count('done');
  const failed = count('failed');
  const cancelled = count('cancelled');
  const total = job.items.length;
  return { total, done, failed, cancelled, pending: count('pending') + count('running'), finished: done + failed + cancelled };
}

export interface RunDeps {
  /** Renders and saves one photo; resolves with the saved result. */
  process: (item: BatchItem, job: BatchJob) => Promise<{ uri: string; width: number; height: number }>;
  /** Persists the job (called after every change). */
  save: (job: BatchJob) => Promise<void> | void;
  /** True once the user asked to stop. */
  shouldStop: () => boolean;
  onUpdate?: (job: BatchJob) => void;
}

/** Processes pending photos one by one until none are left or the user stops. */
export async function runBatch(start: BatchJob, deps: RunDeps): Promise<BatchJob> {
  let job: BatchJob = { ...start, state: 'running' };
  const commit = async (next: BatchJob) => {
    job = next;
    await deps.save(job);
    deps.onUpdate?.(job);
  };
  await commit(job);
  for (let item = nextPending(job); item; item = nextPending(job)) {
    if (deps.shouldStop()) {
      await commit(cancelJob(job));
      return job;
    }
    await commit(updateItem(job, item.id, { status: 'running', attempts: item.attempts + 1 }));
    try {
      const out = await deps.process(item, job);
      await commit(updateItem(job, item.id, { status: 'done', outputUri: out.uri, width: out.width, height: out.height, error: undefined }));
    } catch (e) {
      await commit(updateItem(job, item.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) }));
    }
  }
  await commit({ ...job, state: deps.shouldStop() ? 'cancelled' : 'done' });
  return job;
}

export function serializeJob(job: BatchJob): string {
  return JSON.stringify(job);
}

export function parseJob(json: string | null): BatchJob | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<BatchJob>;
    if (raw?.version !== 1 || !Array.isArray(raw.items) || !raw.look) return null;
    return raw as BatchJob;
  } catch {
    return null;
  }
}
