import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { StudioTab } from '@/features/frame-studio/screens/FrameStudioScreen';

import { FRAME_VIEWS, type FrameView } from './editorNav';
import { DateSection, FrameSection, Scroll } from './FilmPanel';
import { SubTabs } from './SubTabs';

interface Props {
  view: FrameView;
  onViewChange: (view: FrameView) => void;
  /** Renders the edit and opens Frame Studio on the given tab. */
  onOpenStudio: (tab: StudioTab) => void;
  opening: boolean;
}

/**
 * 프레임: the photo's own frame and date stamp are edited here; layouts,
 * backgrounds and decorations work on a canvas of several layers, so those
 * tabs hand the current edit to Frame Studio (opened on the matching tab).
 */
export function FramePanel({ view, onViewChange, onOpenStudio, opening }: Props) {
  let body;
  switch (view) {
    case 'frames':
      body = (
        <>
          <FrameSection />
          <StudioLink label="앨범 사진으로 나만의 프레임 만들기" opening={opening} onPress={() => onOpenStudio('frames')} />
        </>
      );
      break;
    case 'layouts':
      body = (
        <StudioCard
          icon="grid-outline"
          title="레이아웃 · 콜라주"
          text="한 장 · 그리드 · 포토 스트립 · 스크랩북 · 자유 배치. 지금 편집한 사진이 첫 장으로 들어가요."
          opening={opening}
          onPress={() => onOpenStudio('layouts')}
        />
      );
      break;
    case 'background':
      body = (
        <StudioCard
          icon="image-outline"
          title="배경"
          text="색 · 그라데이션 · 종이 · 텍스처 · 패턴 · 앨범 사진을 사진 뒤 캔버스에 깔아요."
          opening={opening}
          onPress={() => onOpenStudio('background')}
        />
      );
      break;
    case 'decorate':
      body = (
        <>
          <DateSection />
          <StudioLink label="테이프 · 스티커 · 텍스트 · 종이 조각 붙이기" opening={opening} onPress={() => onOpenStudio('decorate')} />
        </>
      );
      break;
  }

  return (
    <View>
      <SubTabs options={FRAME_VIEWS} value={view} onChange={onViewChange} accessibilityLabel="프레임 메뉴" />
      {body}
    </View>
  );
}

function StudioLink({ label, opening, onPress }: { label: string; opening: boolean; onPress: () => void }) {
  return (
    <PressableScale
      style={styles.link}
      onPress={onPress}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`${label} (Frame Studio)`}
    >
      <Text style={styles.linkText}>{label}</Text>
      {opening ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />}
    </PressableScale>
  );
}

function StudioCard({
  icon,
  title,
  text,
  opening,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  opening: boolean;
  onPress: () => void;
}) {
  return (
    <Scroll>
      <View style={styles.card}>
        <Ionicons name={icon} size={22} color={colors.text} />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardText}>{text}</Text>
        </View>
      </View>
      <PressableScale
        style={[styles.open, opening && styles.openBusy]}
        onPress={onPress}
        disabled={opening}
        accessibilityRole="button"
        accessibilityLabel={`Frame Studio에서 ${title} 열기`}
      >
        {opening ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.openText}>Frame Studio에서 열기</Text>}
      </PressableScale>
    </Scroll>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
  },
  linkText: {
    ...typography.filterName,
    fontSize: 11,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.callout,
  },
  cardText: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
  },
  open: {
    alignSelf: 'center',
    minHeight: 40,
    minWidth: 180,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBusy: {
    opacity: 0.7,
  },
  openText: {
    ...typography.headline,
    fontSize: 14,
    color: colors.white,
  },
});
