/** Shapes of the frame kit's JSON files (assets/frames). */

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManifestFrame {
  id: string;
  asset: string;
  canvas: { width: number; height: number };
  photoSlot: NormalizedBox;
  layerOrder: string[];
  editableColor: string;
}

export interface FrameManifest {
  version: number;
  frames: ManifestFrame[];
  textures: string[];
  decorations: string[];
  layouts: string[];
}

export interface LayoutJson {
  id: string;
  slots: NormalizedBox[];
}
