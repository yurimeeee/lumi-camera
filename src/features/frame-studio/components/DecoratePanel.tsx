import { Ionicons } from '@expo/vector-icons';
import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas } from '@shopify/react-native-skia';
import { useCallback } from 'react';
import { View } from 'react-native';

import { colors } from '@/constants/theme';
import { decorationPresets, type DecorationPreset } from '@/image-engine/frame/registry';

import { useThumbnail } from '../hooks/useStudioAssets';
import { addDecoration } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import { ActionPill, Hint, Tile, TileRow } from './controls';

function VectorThumb({ deco, onAdd }: { deco: Extract<DecorationPreset, { type: 'vector' }>; onAdd: (id: string) => void }) {
  const draw = useCallback(
    (canvas: SkCanvas, scale: number) => {
      const vb = deco.spec.viewBox;
      const s = (40 * scale) / Math.max(vb.width, vb.height);
      canvas.translate(8 * scale, 8 * scale);
      canvas.scale(s, s);
      for (const el of deco.spec.elements) {
        if (el.type !== 'path' && el.type !== 'polyline') continue;
        const path =
          el.type === 'path' ? Skia.Path.MakeFromSVGString(el.d) : Skia.PathBuilder.Make().addPoly(el.points.map((p) => Skia.Point(p.x, p.y)), el.closed).build();
        if (!path || !el.stroke) continue;
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        paint.setColor(Skia.Color(el.stroke));
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(el.strokeWidth * 1.4);
        paint.setStrokeJoin(StrokeJoin.Round);
        paint.setStrokeCap(StrokeCap.Round);
        canvas.drawPath(path, paint);
      }
    },
    [deco],
  );
  const uri = useThumbnail(`deco:${deco.id}`, 56, 56, draw);
  return <Tile label={deco.name} uri={uri} width={56} height={56} onPress={() => onAdd(deco.id)} accessibilityLabel={`장식 ${deco.name} 추가`} />;
}

/** Decorations from the kit (tapes, doodles) and text. Each tap adds a new layer. */
export function DecoratePanel({ onAddText }: { onAddText: () => void }) {
  const add = (id: string) => {
    useStudioStore.getState().apply((d) => addDecoration(d, id));
    const doc = useStudioStore.getState().doc;
    const last = doc?.layers[doc.layers.length - 1];
    if (last) useStudioStore.getState().select({ id: last.id, mode: 'layer' });
  };
  return (
    <View style={{ gap: 10 }}>
      <TileRow>
        {decorationPresets().map((d) =>
          d.type === 'image' ? (
            <Tile key={d.id} label={d.name} source={d.source} width={72} height={56} onPress={() => add(d.id)} accessibilityLabel={`장식 ${d.name} 추가`} />
          ) : (
            <VectorThumb key={d.id} deco={d} onAdd={add} />
          ),
        )}
      </TileRow>
      <TileRow>
        <ActionPill label="텍스트" icon={<Ionicons name="text-outline" size={15} color={colors.text} />} onPress={onAddText} />
      </TileRow>
      <Hint>장식을 탭해 고르고 끌어서 옮겨요. 두 손가락으로 크기와 각도를 바꿀 수 있어요.</Hint>
    </View>
  );
}
