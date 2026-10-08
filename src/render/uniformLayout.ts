import type { SkRuntimeEffect, Uniforms } from '@shopify/react-native-skia';

/**
 * Flattens named uniforms into the effect's float slots, for code that calls
 * `makeShaderWithChildren` directly (the camera frame worklet) instead of
 * going through <Shader uniforms>. Values are the same dictionary
 * buildUniforms() produces for every other render.
 */
export function flattenUniforms(effect: SkRuntimeEffect, values: Uniforms): number[] {
  const out = new Array<number>(effect.getUniformFloatCount()).fill(0);
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const name = effect.getUniformName(i);
    const v = values[name];
    if (v === undefined) throw new Error(`uniform ${name} missing`);
    const flat: number[] = [];
    const push = (x: unknown) => {
      if (typeof x === 'number') flat.push(x);
      else if (Array.isArray(x)) x.forEach(push);
      else if (x instanceof Float32Array) flat.push(...x);
      else if (x && typeof x === 'object' && 'x' in x && 'y' in x) flat.push((x as { x: number }).x, (x as { y: number }).y);
    };
    push(v);
    const slot = effect.getUniform(i).slot;
    for (let k = 0; k < flat.length; k++) out[slot + k] = flat[k]!;
  }
  return out;
}

/** Float slot of a uniform (e.g. to patch the frame size per camera frame). */
export function uniformSlot(effect: SkRuntimeEffect, name: string): number {
  for (let i = 0; i < effect.getUniformCount(); i++) {
    if (effect.getUniformName(i) === name) return effect.getUniform(i).slot;
  }
  throw new Error(`uniform ${name} not found`);
}
