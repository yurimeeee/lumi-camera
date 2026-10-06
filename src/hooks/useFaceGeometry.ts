import { useEffect, useState } from 'react';

import { detectFace, FACE_DETECTION_SUPPORTED } from '@/services/faceLandmarks';
import type { FaceGeometry } from '@/types/editing';

export type FaceStatus = 'unsupported' | 'idle' | 'detecting' | 'found' | 'none' | 'error';

/**
 * Face landmarks for the image at `uri`. Detection (and the model download
 * on first use) only starts once `enabled` is true.
 */
export function useFaceGeometry(uri: string | null, enabled: boolean): { face: FaceGeometry | null; status: FaceStatus } {
  const [state, setState] = useState<{ uri: string; face: FaceGeometry | null; status: FaceStatus } | null>(null);
  const active = FACE_DETECTION_SUPPORTED && enabled && !!uri;

  useEffect(() => {
    if (!active || !uri) return;
    let alive = true;
    detectFace(uri)
      .then((face) => alive && setState({ uri, face, status: face ? 'found' : 'none' }))
      .catch(() => alive && setState({ uri, face: null, status: 'error' }));
    return () => {
      alive = false;
    };
  }, [active, uri]);

  if (!FACE_DETECTION_SUPPORTED) return { face: null, status: 'unsupported' };
  if (!state || state.uri !== uri) return { face: null, status: active ? 'detecting' : 'idle' };
  return { face: state.face, status: state.status };
}
