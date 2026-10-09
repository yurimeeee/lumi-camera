import { layoutJson, MANIFEST } from '@/image-engine/frame/registry';
import type { NormalizedBox } from '@/image-engine/frame/registryTypes';

/**
 * Layouts: the kit's layout JSON files (slots) plus two of Lumi's own —
 * `frame` (one print filling the canvas, the canvas follows the print's
 * proportions) and `free` (no slots, everything moves freely). The kit's JSON
 * has no canvas size, so each layout gets a default aspect here; the user can
 * change it in Customize.
 */

export interface StudioLayout {
  id: string;
  name: string;
  source: 'kit' | 'lumi';
  slots: NormalizedBox[];
  /** Default canvas aspect (w/h); null = follow the print. */
  ratio: number | null;
  /** Per-slot tilt (scrapbook). */
  rotations?: number[];
}

const KIT_META: Record<string, { name: string; ratio: number; rotations?: number[] }> = {
  single: { name: '한 장', ratio: 4 / 5 },
  duo_vertical: { name: '두 장 · 세로', ratio: 4 / 5 },
  duo_horizontal: { name: '두 장 · 가로', ratio: 3 / 2 },
  grid_2x2: { name: '네 장', ratio: 1 },
  strip_3: { name: '포토 스트립', ratio: 1 / 2 },
  grid_3x3: { name: '아홉 장', ratio: 1 },
  editorial: { name: '에디토리얼', ratio: 3 / 2 },
  scrapbook: { name: '스크랩북', ratio: 4 / 5, rotations: [-5, 4] },
  contact_sheet: { name: '컨택트 시트', ratio: 850 / 1250 },
};

export const FRAME_LAYOUT_ID = 'frame';
export const FREE_LAYOUT_ID = 'free';

let layouts: StudioLayout[] | null = null;

export function studioLayouts(): StudioLayout[] {
  if (!layouts) {
    const kit = MANIFEST.layouts.map((id): StudioLayout => {
      const json = layoutJson(id);
      if (!json) throw new Error(`layout ${id} missing`);
      const meta = KIT_META[id] ?? { name: id, ratio: 1 };
      return { id, name: meta.name, source: 'kit', slots: json.slots, ratio: meta.ratio, rotations: meta.rotations };
    });
    layouts = [
      { id: FRAME_LAYOUT_ID, name: '프레임', source: 'lumi', slots: [{ x: 0, y: 0, width: 1, height: 1 }], ratio: null },
      ...kit,
      { id: FREE_LAYOUT_ID, name: '자유 배치', source: 'lumi', slots: [], ratio: 4 / 5 },
    ];
  }
  return layouts;
}

export function getLayout(id: string): StudioLayout {
  return studioLayouts().find((l) => l.id === id) ?? studioLayouts()[0]!;
}

export const CANVAS_RATIOS: readonly { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
  { label: '1:2', value: 1 / 2 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
];
