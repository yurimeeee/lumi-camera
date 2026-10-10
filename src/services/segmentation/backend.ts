import LumiVision from '../../../modules/lumi-vision';
import { newMaskFileUri } from '../appFiles';

import { MASK_STORE_SIDE, type SegmentationBackend } from './types';

const native = LumiVision;
const caps = native?.capabilities() ?? null;

/**
 * iOS: Apple Vision through the local `lumi-vision` module — person
 * segmentation (iOS 15+) and subject lifting / tap-to-select (iOS 17+). The
 * module only exists in a development build; in Expo Go (and on Android)
 * this is null and the AI tools say so.
 */
export const backend: SegmentationBackend | null =
  native && caps
    ? {
        id: 'apple-vision',
        supports: { subject: caps.subject || caps.person, person: caps.person, skin: false, tap: caps.tap },
        async segment(source, kind) {
          // Without subject lifting (iOS 15–16), people are the subject.
          const k = kind === 'subject' && !caps.subject ? 'person' : kind === 'person' ? 'person' : 'subject';
          const out = await native.segment(source.uri, k, newMaskFileUri(`seg-${k}`), MASK_STORE_SIDE);
          return { ...out, model: k === 'person' ? 'vision-person' : 'vision-foreground+person' };
        },
        async segmentAt(source, point) {
          try {
            const out = await native.segmentAt(source.uri, point.x, point.y, newMaskFileUri('seg-tap'), MASK_STORE_SIDE);
            return { ...out, model: 'vision-foreground-instance' };
          } catch {
            return null;
          }
        },
      }
    : null;
