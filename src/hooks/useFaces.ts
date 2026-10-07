import { useEffect, useState } from 'react';

import { detectFaces, FACE_DETECTION_SUPPORTED } from '@/services/faceDetection/FaceDetector';
import type { DetectedFace } from '@/services/faceDetection/types';
import type { SourceImage } from '@/types/editing';

export type FaceStatus = 'unsupported' | 'idle' | 'detecting' | 'found' | 'none' | 'error';

const NO_FACES: DetectedFace[] = [];

/**
 * Faces in the editor's source image (landmarks normalised to the source,
 * so they follow later rotate / flip / crop). Detection starts once
 * `enabled` is true and is cached per image, so the export reuses it.
 */
export function useFaces(source: SourceImage | null, enabled: boolean): { faces: DetectedFace[]; status: FaceStatus } {
  const [state, setState] = useState<{ uri: string; faces: DetectedFace[]; status: FaceStatus } | null>(null);
  const uri = source?.uri ?? null;
  const active = FACE_DETECTION_SUPPORTED && enabled && !!source;

  useEffect(() => {
    if (!active || !source) return;
    let alive = true;
    detectFaces(source)
      .then((faces) => alive && setState({ uri: source.uri, faces, status: faces.length ? 'found' : 'none' }))
      .catch((e) => {
        if (__DEV__) console.warn('[faces]', e);
        if (alive) setState({ uri: source.uri, faces: NO_FACES, status: 'error' });
      });
    return () => {
      alive = false;
    };
    // The source is identified by its uri.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uri]);

  if (!FACE_DETECTION_SUPPORTED) return { faces: NO_FACES, status: 'unsupported' };
  if (!state || state.uri !== uri) return { faces: NO_FACES, status: active ? 'detecting' : 'idle' };
  return { faces: state.faces, status: state.status };
}
