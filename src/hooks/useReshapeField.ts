import { useEffect, useMemo, useState } from 'react';

import { ReshapeField, type ReshapeTextures } from '@/services/reshape';
import type { Geometry, ReshapeStroke, SourceImage } from '@/types/editing';

/**
 * Keeps one displacement field in sync with the stroke list. A drag only
 * appends points to the last stroke (or adds a stroke), so the common case
 * replays just the new segments; anything else (undo, reset, geometry
 * change) rebuilds from scratch.
 */
class FieldCache {
  private field: ReshapeField | null = null;
  private key = '';
  private strokes: readonly ReshapeStroke[] = [];
  private textures: ReshapeTextures | null = null;

  sync(strokes: readonly ReshapeStroke[], geometry: Geometry, source: SourceImage): ReshapeTextures | null {
    if (strokes.length === 0) {
      // The textures are disposed once the hook drops them; start over next time.
      this.field = null;
      this.key = '';
      this.strokes = [];
      this.textures = null;
      return null;
    }
    const key = `${source.uri}|${source.width}x${source.height}|${JSON.stringify(geometry)}`;
    if (key === this.key && strokes === this.strokes && this.textures) return this.textures;

    if (!this.field || key !== this.key || !this.extends(strokes)) {
      this.field = new ReshapeField(geometry, source.width, source.height);
      for (const s of strokes) this.field.addStroke(s);
    } else {
      const prev = this.strokes;
      const last = prev.length - 1;
      // Same stroke grew, or new strokes were appended.
      if (last >= 0 && strokes[last] !== prev[last]) {
        this.field.addStroke(strokes[last]!, prev[last]!.points.length);
      }
      for (let i = prev.length; i < strokes.length; i++) this.field.addStroke(strokes[i]!);
    }
    this.key = key;
    this.strokes = strokes;
    this.textures = this.field.toTextures();
    return this.textures;
  }

  private extends(next: readonly ReshapeStroke[]) {
    const prev = this.strokes;
    if (next.length < prev.length) return false;
    for (let i = 0; i < prev.length - 1; i++) if (next[i] !== prev[i]) return false;
    const last = prev.length - 1;
    if (last < 0) return true;
    const a = prev[last]!;
    const b = next[last]!;
    if (a === b) return true;
    return a.id === b.id && b.points.length >= a.points.length && b.points[a.points.length - 1] === a.points[a.points.length - 1];
  }
}

/** Textures are freed a little after they are replaced, once no frame can still draw them. */
function disposeLater(t: ReshapeTextures) {
  setTimeout(() => {
    t.x.dispose();
    t.y.dispose();
  }, 500);
}

export function useReshapeField(
  strokes: readonly ReshapeStroke[],
  geometry: Geometry,
  source: SourceImage | null,
): ReshapeTextures | null {
  const [cache] = useState(() => new FieldCache());
  const textures = useMemo(
    () => (source ? cache.sync(strokes, geometry, source) : null),
    [cache, strokes, geometry, source],
  );
  useEffect(() => {
    if (!textures) return;
    return () => disposeLater(textures);
  }, [textures]);
  return textures;
}
