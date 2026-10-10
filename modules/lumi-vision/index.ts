import { requireOptionalNativeModule } from 'expo';

export interface NativeMaskFile {
  uri: string;
  width: number;
  height: number;
}

interface LumiVisionModule {
  capabilities(): { person: boolean; subject: boolean; tap: boolean; heic: boolean };
  segment(uri: string, kind: 'person' | 'subject', outPath: string, maxSide: number): Promise<NativeMaskFile>;
  segmentAt(uri: string, x: number, y: number, outPath: string, maxSide: number): Promise<NativeMaskFile>;
  encodeHeic(inputUri: string, outPath: string, quality: number, metadata: 'keep' | 'noLocation' | 'none'): Promise<string>;
}

/**
 * Apple Vision segmentation + ImageIO HEIC. Null where the native code isn't
 * compiled in: Expo Go, web, Android (requires a development build on iOS).
 */
export default requireOptionalNativeModule<LumiVisionModule>('LumiVision');
