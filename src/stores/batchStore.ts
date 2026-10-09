import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SkTypeface } from '@shopify/react-native-skia';
import { create } from 'zustand';

import { processBatchItem } from '@/services/batch/processItem';
import {
  cancelJob,
  createJob,
  parseJob,
  recoverJob,
  retryFailed,
  runBatch,
  serializeJob,
  type BatchJob,
  type BatchSource,
} from '@/services/batch/queue';

import type { Look } from './editorStore';

const KEY = 'lumi.batch';

interface BatchStore {
  job: BatchJob | null;
  running: boolean;
  /** Set when the user asks to stop; the photo in progress still finishes. */
  stopping: boolean;
  /** Loads a saved job (after a restart, an interrupted job waits as "paused"). */
  load: () => Promise<BatchJob | null>;
  start: (sources: readonly BatchSource[], look: Look, lookName: string, typeface: SkTypeface | null) => void;
  resume: (typeface: SkTypeface | null) => void;
  retry: (typeface: SkTypeface | null) => void;
  cancel: () => void;
  clear: () => void;
}

const save = (job: BatchJob) => AsyncStorage.setItem(KEY, serializeJob(job));

export const useBatchStore = create<BatchStore>()((set, get) => {
  const run = async (job: BatchJob, typeface: SkTypeface | null) => {
    if (get().running) return;
    set({ job, running: true, stopping: false });
    try {
      await runBatch(job, {
        process: (item, j) => processBatchItem(item, j, typeface),
        save,
        shouldStop: () => get().stopping,
        onUpdate: (next) => set({ job: next }),
      });
    } finally {
      set({ running: false, stopping: false });
    }
  };

  return {
    job: null,
    running: false,
    stopping: false,
    load: async () => {
      if (get().job) return get().job;
      const saved = parseJob(await AsyncStorage.getItem(KEY).catch(() => null));
      const job = saved ? recoverJob(saved) : null;
      set({ job });
      return job;
    },
    start: (sources, look, lookName, typeface) => void run(createJob(sources, look, lookName), typeface),
    resume: (typeface) => {
      const { job } = get();
      if (job) void run(job, typeface);
    },
    retry: (typeface) => {
      const { job } = get();
      if (job) void run(retryFailed(job), typeface);
    },
    cancel: () => {
      const { job, running } = get();
      if (!job) return;
      if (running) set({ stopping: true });
      else {
        const next = cancelJob(job);
        set({ job: next });
        void save(next);
      }
    },
    clear: () => {
      if (get().running) return;
      set({ job: null });
      void AsyncStorage.removeItem(KEY);
    },
  };
});
