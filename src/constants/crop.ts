import type { CropAspectId } from '@/types/editing';

export const CROP_ASPECTS: readonly { id: CropAspectId; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

/** Output aspect (w/h) for a locked crop, or null for free/original. */
export function aspectRatioOf(id: CropAspectId): number | null {
  return CROP_ASPECTS.find((a) => a.id === id)?.ratio ?? null;
}
