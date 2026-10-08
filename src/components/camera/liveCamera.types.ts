import type { ResolvedProcessing } from '@/services/imageProcessing';
import type { CameraFacing, FlashSetting } from '@/types/settings';

export interface CapturedPhoto {
  uri: string;
  /** Whether the file (after EXIF orientation) is mirrored left-right. */
  mirrored: boolean;
}

export interface LiveCameraHandle {
  takePhoto: () => Promise<CapturedPhoto>;
  /** Focus + meter at a point in view coordinates. Resolves false when unsupported. */
  focusAt: (x: number, y: number) => Promise<boolean>;
}

export interface LiveCameraProps {
  facing: CameraFacing;
  flash: FlashSetting;
  /** Preview mirror for the front camera (the native fallback also bakes it into the photo). */
  mirror: boolean;
  active: boolean;
  /** Look to run on every frame; null = untouched frames. */
  look: ResolvedProcessing | null;
  /** Filter id, for the fallback's blend-mode approximation. */
  filterId: string;
  /** Exposure bias, -1…1 of the device range (live camera only). */
  exposure: number;
  onReady: () => void;
  onError: (message: string) => void;
}

/** Capabilities of the camera backend in use (see LiveCamera). */
export interface LiveCameraCapabilities {
  /** Filters run on the camera frames themselves (GPU), not a blend overlay. */
  frameFilter: boolean;
  focus: boolean;
  exposure: boolean;
}
