import { useCallback, useEffect, useRef, useState } from 'react';

export type AiJobStatus = 'idle' | 'running' | 'error';

/**
 * One cancellable AI operation (segmentation, inpainting). Cancelling
 * ignores the result when it arrives (the on-device work can't always be
 * interrupted); a failure leaves the edit untouched and keeps the message
 * for a retry button. Results are only applied while the screen is mounted.
 */
export function useAiJob() {
  const [status, setStatus] = useState<AiJobStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const start = useCallback(async <T,>(work: () => Promise<T>, apply: (result: T) => void, failMessage = 'AI 처리에 실패했어요') => {
    const id = ++run.current;
    setStatus('running');
    setError(null);
    try {
      const result = await work();
      if (id !== run.current || !mounted.current) return;
      apply(result);
      setStatus('idle');
    } catch (e) {
      if (id !== run.current || !mounted.current) return;
      if (__DEV__) console.warn('[ai]', e);
      setError(failMessage);
      setStatus('error');
    }
  }, []);

  const cancel = useCallback(() => {
    run.current++;
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, start, cancel };
}
