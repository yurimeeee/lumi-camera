/**
 * Frame Studio canvas document — pure data, shared by the on-screen preview,
 * the high-resolution export, templates and the tests. Every coordinate is in
 * canvas units (the document is `width × height` units; the preview and the
 * export only differ by the scale they draw it at), so whatever the preview
 * shows is what the export renders.
 */

/** An image the document references: an app-owned copy (never the user's original file). */
export interface ImageRef {
  uri: string;
  width: number;
  height: number;
  /** PNG/WebP with transparent pixels (custom frames keep their alpha). */
  hasAlpha?: boolean;
}

export type SlotShape = 'rect' | 'rounded' | 'ellipse' | 'freeform';

/** A photo window, normalised 0…1 against the element box. */
export interface SlotMask {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: SlotShape;
  /** Corner radius for `rounded`, 0…100 (% of half the short side). */
  radius: number;
  /** Closed outline for `freeform`, normalised against the element box. */
  points?: readonly { x: number; y: number }[];
}

/** Position / size / rotation / opacity of an image inside a box. Scale 1 = cover. */
export interface ImageTransform {
  scale: number;
  /** Offset as a share of the box size. */
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  /** 0…100 */
  opacity: number;
}

/** A frame image the user brought from the album. */
export interface CustomFrame {
  image: ImageRef;
  /** Where the photo goes. PNGs with transparency get it from their hole automatically. */
  slot: SlotMask;
  /** Placement of the frame image inside the element (crop = scale + move). */
  transform: ImageTransform;
}

/**
 * How a photo element is framed. `presetId` is a manifest frame id, `none`
 * (bare photo) or `custom` (album image). Sizes are percentages of the
 * asset's own borders, so 100 everywhere reproduces the SVG exactly.
 */
export interface FrameStyle {
  presetId: string;
  /** The frame's editable paper / border colour, #RRGGBB. */
  color: string;
  /** All borders together, 0…200 (%). */
  thickness: number;
  /** Per-side multipliers, 0…250 (%). */
  top: number;
  side: number;
  bottom: number;
  /** Photo window (and outer) corner radius, 0…100. */
  cornerRadius: number;
  /** Paper texture: a provided texture id, `import:<n>` for an imported one, or null. */
  texture: string | null;
  textureIntensity: number;
  /** Uneven yellowing, darker edges, foxing. 0…100 */
  aging: number;
  /** Chipped, whitened outer edges. 0…100 */
  edgeWear: number;
  /** Faded print inside the frame (lifted blacks, softer contrast). 0…100 */
  photoFade: number;
  /** Drop shadow under the print + recessed photo edge. 0…100 */
  shadow: number;
  custom: CustomFrame | null;
}

/** Photo look per slot (same filters as the editor). */
export interface SlotLook {
  filterId: string;
  intensity: number;
}

interface LayerBase {
  id: string;
  /** Top-left of the unrotated box, canvas units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, around the box centre. */
  rotation: number;
  /** 0…1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface PhotoLayer extends LayerBase {
  kind: 'photo';
  photo: ImageRef | null;
  /** Photo inside its window: scale ≥ 1 zooms past cover, x/y pan, rotation turns it. */
  content: ImageTransform;
  look: SlotLook;
  frame: FrameStyle;
  /** Layout slot this layer came from (keeps photos in place when the layout changes). */
  slot: number | null;
}

export interface DecorationLayer extends LayerBase {
  kind: 'decoration';
  assetId: string;
  /** Stroke colour for line-art decorations (#RRGGBB), null = the asset's own. */
  tint: string | null;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  color: string;
  /** Font size in canvas units. */
  fontSize: number;
}

export type StudioLayer = PhotoLayer | DecorationLayer | TextLayer;
export type LayerKind = StudioLayer['kind'];

export type PatternId = 'dots' | 'grid' | 'stripes' | 'check';

export type BackgroundFill =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'texture'; textureId: string }
  | { kind: 'pattern'; pattern: PatternId; color: string; ink: string }
  | { kind: 'image'; image: ImageRef };

export interface BackgroundAdjust {
  /** 100…300 (%) — zoom past fill. */
  scale: number;
  /** -100…100 pan. */
  x: number;
  y: number;
  /** 0…100 */
  blur: number;
  /** 0…100 */
  opacity: number;
  /** -100…100 */
  brightness: number;
  /** -100…100 */
  saturation: number;
}

export interface StudioBackground {
  fill: BackgroundFill;
  adjust: BackgroundAdjust;
}

export interface StudioDocument {
  version: 1;
  width: number;
  height: number;
  /** Layout the photo layers came from (`frame` = one print filling the canvas). */
  layoutId: string;
  /** Canvas aspect (w/h) chosen for the layout; `null` = follow the print (frame layout). */
  ratio: number | null;
  /** Frame layout only: space around the print, % of its width (0…30). */
  margin: number;
  background: StudioBackground;
  /** Bottom → top. Array order is the z-order. */
  layers: StudioLayer[];
  /** Every photo in the project, in the order added (layouts refill slots from it). */
  pool: ImageRef[];
  /** Images imported for frames / textures (`import:<n>` ids). */
  imports: Record<string, ImageRef>;
}

export interface StudioTemplate {
  id: string;
  name: string;
  createdAt: number;
  /** Document with every photo removed (layers keep their place, frame and look). */
  doc: StudioDocument;
}
