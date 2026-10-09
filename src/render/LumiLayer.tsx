import {
  Image as SkiaImage,
  ImageShader,
  MitchellCubicSampling,
  Rect,
  Shader,
  type SkImage,
  type Uniforms,
} from '@shopify/react-native-skia';
import { memo } from 'react';

import { curveTexture, identityCurveTexture, LUT_ROWS } from '@/services/color/curveTexture';
import { LUT_SIZE } from '@/services/color/curves';
import { neutralReshapeTextures, type ReshapeTextures } from '@/services/reshape';
import { getLumiEffect } from '@/shaders/lumiShader';

import { lowResOf } from './lowRes';

/**
 * Mitchell cubic: smooth resampling for both up- and down-scaling.
 * (Skia's <ImageShader> routes non-cubic sampling options through
 * makeShaderCubic, so filter/mipmap options must not be used here.)
 */
const SAMPLING = MitchellCubicSampling;
/** B-spline: smooth and never overshoots, so the 16-bit byte pairs stay in 0…1. */
const FIELD_SAMPLING = { B: 1, C: 0 } as const;
/** Interpolating cubic: exact at texel centres, which is all the shader reads from the curve LUT. */
const LUT_SAMPLING = { B: 0, C: 0 } as const;
const LUT_RECT = { x: 0, y: 0, width: LUT_SIZE, height: LUT_ROWS };

interface Props {
  image: SkImage;
  width: number;
  height: number;
  /** How the image maps into width×height. Thumbnails use `cover`. */
  fit?: 'fill' | 'cover';
  /** `null` draws the untouched image (used for Before). */
  uniforms: Uniforms | null;
  /** 터치 보정 displacement field for this frame. */
  reshape?: ReshapeTextures | null;
  /** Composed tone curves (ResolvedProcessing.curves); null = linear. */
  curves?: Float32Array | null;
  /** Filter-mix (look B) curves (ResolvedProcessing.mix.curves); null = linear. */
  mixCurves?: Float32Array | null;
}

/**
 * Skia drawing nodes for a processed photo. Not a Canvas — it is composed
 * into on-screen canvases and into offscreen export renders alike.
 * Always drawn at the origin (the shader's vignette/grain use local
 * coordinates); position it with a parent <Group transform>.
 */
export const LumiLayer = memo(function LumiLayer({ image, width, height, fit = 'fill', uniforms, reshape, curves, mixCurves }: Props) {
  if (!uniforms) {
    return <SkiaImage image={image} x={0} y={0} width={width} height={height} fit={fit} sampling={SAMPLING} />;
  }
  const rect = { x: 0, y: 0, width, height };
  const field = reshape ?? neutralReshapeTextures();
  const lut = ((curves || mixCurves) && curveTexture(curves ?? null, mixCurves ?? null)) || identityCurveTexture();
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={getLumiEffect()} uniforms={{ ...uniforms, uReshape: reshape ? 1 : 0 }}>
        <ImageShader image={image} fit={fit} rect={rect} tx="clamp" ty="clamp" sampling={SAMPLING} />
        <ImageShader image={field.x} fit="fill" rect={rect} tx="clamp" ty="clamp" sampling={FIELD_SAMPLING} />
        <ImageShader image={field.y} fit="fill" rect={rect} tx="clamp" ty="clamp" sampling={FIELD_SAMPLING} />
        <ImageShader image={lut} fit="fill" rect={LUT_RECT} tx="clamp" ty="clamp" sampling={LUT_SAMPLING} />
        <ImageShader image={lowResOf(image)} fit={fit} rect={rect} tx="clamp" ty="clamp" sampling={SAMPLING} />
      </Shader>
    </Rect>
  );
});
