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

import { getLumiEffect } from '@/shaders/lumiShader';

/**
 * Mitchell cubic: smooth resampling for both up- and down-scaling.
 * (Skia's <ImageShader> routes non-cubic sampling options through
 * makeShaderCubic, so filter/mipmap options must not be used here.)
 */
const SAMPLING = MitchellCubicSampling;

interface Props {
  image: SkImage;
  width: number;
  height: number;
  /** How the image maps into width×height. Thumbnails use `cover`. */
  fit?: 'fill' | 'cover';
  /** `null` draws the untouched image (used for Before). */
  uniforms: Uniforms | null;
}

/**
 * Skia drawing nodes for a processed photo. Not a Canvas — it is composed
 * into on-screen canvases and into offscreen export renders alike.
 * Always drawn at the origin (the shader's vignette/grain use local
 * coordinates); position it with a parent <Group transform>.
 */
export const LumiLayer = memo(function LumiLayer({ image, width, height, fit = 'fill', uniforms }: Props) {
  if (!uniforms) {
    return <SkiaImage image={image} x={0} y={0} width={width} height={height} fit={fit} sampling={SAMPLING} />;
  }
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={getLumiEffect()} uniforms={uniforms}>
        <ImageShader
          image={image}
          fit={fit}
          rect={{ x: 0, y: 0, width, height }}
          tx="clamp"
          ty="clamp"
          sampling={SAMPLING}
        />
      </Shader>
    </Rect>
  );
});
