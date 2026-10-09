import type { Adjustments } from '@/types/editing';
import type { FilmEffects, FrameId } from '@/types/film';
import type { CaptureRatio, FlashSetting } from '@/types/settings';

/**
 * Film camera mode: each camera = a colour stock (FILM_STOCKS, in the filter
 * slot) + its own effects (grain, flash, halation, drift…) + defaults for the
 * frame and date stamp. Pure data: add a camera by appending an entry.
 *
 * The stock occupies filter A, so a film camera's colour is never applied
 * twice; a later filter mix in the editor stacks on top as filter B.
 */
export interface FilmCamera {
  id: string;
  name: string;
  /** Short analog label under the name (film speed / era). */
  label: string;
  description: string;
  /** FILM_STOCKS id. */
  colorPresetId: string;
  /** Spatial adjustments that belong to the camera (grain amount, vignette, fade, sharpness). */
  adjustments: Partial<Pick<Adjustments, 'grain' | 'vignette' | 'fade' | 'sharpness'>>;
  film: Partial<Omit<FilmEffects, 'seed' | 'grain' | 'bloom' | 'halation' | 'leak' | 'burn'>> & {
    grain?: Partial<FilmEffects['grain']>;
    bloom?: Partial<FilmEffects['bloom']>;
    halation?: Partial<FilmEffects['halation']>;
  };
  frameId: FrameId;
  dateStamp: boolean;
  /** The flash setting this camera is usually shot with (offered, not forced). */
  flash?: FlashSetting;
  ratio?: CaptureRatio;
  /** UI accent. */
  swatch: string;
}

export const FILM_CAMERAS: readonly FilmCamera[] = [
  {
    id: 'classic35',
    name: 'Classic 35',
    label: 'ISO 200 · 35mm',
    description: '따뜻한 하이라이트와 자연스러운 피부, 고운 입자',
    colorPresetId: 'stock-classic35',
    adjustments: { grain: 30, vignette: 10 },
    film: { grain: { size: 35, roughness: 35 }, halation: { intensity: 18, radius: 35, warmth: 40 } },
    frameId: 'none',
    dateStamp: false,
    swatch: '#E5A66D',
  },
  {
    id: 'disposable',
    name: 'Disposable',
    label: 'ISO 400 · Flash',
    description: '강한 플래시, 높은 대비, 거친 입자와 주변부 어둠',
    colorPresetId: 'stock-disposable',
    adjustments: { grain: 55, vignette: 35 },
    film: { grain: { size: 55, roughness: 70 }, flash: 60, fringing: 35 },
    frameId: 'none',
    dateStamp: true,
    flash: 'on',
    swatch: '#F2C14E',
  },
  {
    id: 'ccd2004',
    name: 'CCD 2004',
    label: '5.0MP · Digital',
    description: '차가운 화이트밸런스, 직광 플래시, 디지털 노이즈',
    colorPresetId: 'stock-ccd2004',
    adjustments: { grain: 22 },
    film: { grain: { size: 10, roughness: 85, color: 70 }, flash: 45, fringing: 25 },
    frameId: 'none',
    dateStamp: true,
    flash: 'on',
    swatch: '#8FB3DA',
  },
  {
    id: 'retroFlash',
    name: 'Retro Flash',
    label: 'Night · Flash',
    description: '어둠 속 플래시, 밝은 피사체와 깊은 배경',
    colorPresetId: 'stock-retroflash',
    adjustments: { grain: 25, vignette: 30 },
    film: { flash: 90, bloom: { intensity: 25, threshold: 80, radius: 30 } },
    frameId: 'none',
    dateStamp: true,
    flash: 'on',
    swatch: '#5B6A9A',
  },
  {
    id: 'softDiary',
    name: 'Soft Diary',
    label: 'ISO 100 · Soft',
    description: '낮은 대비, 따뜻하고 뽀얀 하이라이트',
    colorPresetId: 'stock-softdiary',
    adjustments: { grain: 10 },
    film: { bloom: { intensity: 22, threshold: 60, radius: 60 }, softFocus: 25 },
    frameId: 'none',
    dateStamp: false,
    swatch: '#F3D3B5',
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    label: 'Instant · 1:1',
    description: '부드러운 색, 은은한 색 편차, 즉석 필름 프레임',
    colorPresetId: 'stock-polaroid',
    adjustments: { grain: 12, vignette: 15 },
    film: { drift: 45, softFocus: 10 },
    frameId: 'classic_polaroid',
    dateStamp: false,
    ratio: '1:1',
    swatch: '#D7C4A3',
  },
  {
    id: 'cinema400',
    name: 'Cinema 400',
    label: 'ISO 400 · Motion',
    description: '풍부한 그림자, 부드러운 하이라이트, 할레이션',
    colorPresetId: 'stock-cinema400',
    adjustments: { grain: 32, vignette: 12 },
    film: { grain: { size: 40, roughness: 40 }, halation: { intensity: 30, radius: 45, warmth: 60 } },
    frameId: 'none',
    dateStamp: false,
    ratio: '16:9',
    swatch: '#4E7F80',
  },
  {
    id: 'monoFilm',
    name: 'Mono Film',
    label: 'ISO 400 · B&W',
    description: '흑백 톤 커브, 깊은 검정, 은은한 입자',
    colorPresetId: 'stock-monofilm',
    adjustments: { grain: 35, vignette: 12 },
    film: { grain: { size: 45, roughness: 50 } },
    frameId: 'none',
    dateStamp: false,
    swatch: '#8C8C8C',
  },
];

export const DEFAULT_FILM_CAMERA_ID = 'classic35';

export function getFilmCamera(id: string | null | undefined): FilmCamera {
  return FILM_CAMERAS.find((c) => c.id === id) ?? FILM_CAMERAS[0]!;
}
