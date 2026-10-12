import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowUpRight,
  ClipboardCheck,
  MapPin,
  TriangleAlert,
  UserRound,
} from 'lucide-react-native';

import { Text } from './text';
import { HeroSurface } from './brand';
import { ProgressBar } from './progress-bar';
import { Skeleton } from './skeleton';
import { cn } from '../utils/cn';
import { elevation, fonts, motion, radius } from '../theme/tokens';
import { usePalette, useTheme } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';
import { stadiumImage } from '../features/admin/stadium-images';
import { formatPercent } from '../utils/format';

/** Unique per instance so two headers on one web page never share a gradient id. */
let gradientCounter = 0;

/**
 * Which picture a stadium shows: the uploaded photo when there is one, else
 * the bundled photo for its code, else nothing (the branded placeholder).
 * A remote photo that failed to load drops to the bundled one.
 */
export function stadiumPhotoSource(
  code: string,
  imageUrl: string | null | undefined,
  remoteFailed = false,
): ImageSource | null {
  if (imageUrl && !remoteFailed) {
    // Presigned URLs change on every read; the object key does not, so the
    // cache keys on the path and a re-signed URL is not a re-download.
    return { uri: imageUrl, cacheKey: imageUrl.split('?')[0] };
  }
  return stadiumImage(code);
}

type ImageSource =
  { uri: string; cacheKey?: string } | NonNullable<ReturnType<typeof stadiumImage>>;

/**
 * The photo header of a stadium: full-bleed venue photo under a graphite
 * scrim, the code as a violet badge on the leading corner, and the name and
 * city set on the photo. The uploaded photo wins over the bundled one; unknown
 * codes without an upload get the branded graphite surface, so a newly
 * created venue still looks intentional.
 */
export function StadiumPhotoHeader({
  code,
  name,
  city,
  imageUrl,
  inactive = false,
  height = 180,
  rounded = 'top',
}: {
  code: string;
  name: string;
  city?: string | null;
  /** Uploaded photo (presigned GET); preferred over the bundled one. */
  imageUrl?: string | null;
  inactive?: boolean;
  height?: number;
  rounded?: 'top' | 'all';
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const imagePath = imageUrl?.split('?')[0] ?? null;
  // Remembers which photo failed, so a new photo gets a fresh chance to load.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const remoteFailed = imagePath !== null && failedPath === imagePath;
  const source = stadiumPhotoSource(code, imageUrl, remoteFailed);
  const gradientId = useGradientId();

  const content = (
    <>
      <View className="absolute start-4 top-4 flex-row gap-2">
        <View className="rounded-sm bg-accent px-2.5 py-1">
          <Text variant="overline" tone="onHero">
            {code}
          </Text>
        </View>
        {inactive ? (
          <View className="rounded-sm bg-surface px-2.5 py-1">
            <Text variant="overline" tone="danger">
              {t('stadiums.inactive')}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="absolute bottom-0 end-0 start-0 gap-1 px-4 pb-4">
        <Text variant="title" tone="onHero" numberOfLines={2}>
          {name}
        </Text>
        {city ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color={palette.onHero} />
            <Text variant="caption" tone="onHero" className="opacity-90">
              {city}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const shape =
    rounded === 'top'
      ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }
      : { borderRadius: radius.lg };

  if (!source) {
    return (
      <HeroSurface style={[{ height, overflow: 'hidden' }, shape]}>
        <View className="flex-1 items-end justify-start pe-5 pt-12">
          <Text variant="numeral" tone="onHero" className="opacity-15">
            {code}
          </Text>
        </View>
        {content}
      </HeroSurface>
    );
  }

  return (
    <View style={[{ height, overflow: 'hidden', backgroundColor: palette.heroTo }, shape]}>
      <Image
        source={source}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          start: 0,
          end: 0,
          opacity: inactive ? 0.55 : 1,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
        onError={() => {
          if (imagePath && !remoteFailed) setFailedPath(imagePath);
        }}
        accessibilityIgnoresInvertColors
      />
      {/* The scrim: clear at the top, graphite under the name. */}
      <Svg
        style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.heroTo} stopOpacity={0.05} />
            <Stop offset="0.45" stopColor={palette.heroTo} stopOpacity={0.15} />
            <Stop offset="1" stopColor={palette.heroTo} stopOpacity={0.88} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      {content}
    </View>
  );
}

function useGradientId(): string {
  const [id] = useState(() => `stadium-scrim-${(gradientCounter += 1)}`);
  return id;
}

export interface StadiumCardStats {
  inspections: number;
  /** Planned inspections for the period; null when the API has no target. */
  inspectionsExpected: number | null;
  findings: number;
  compliancePercent: number | null;
  /** 0..1 for the bar, with its label. */
  progress: number | null;
  progressLabel: string;
}

/**
 * One venue in the stadiums grid, per the client's layout: photo header,
 * assigned inspector, three stat tiles, a progress bar and a full-width
 * "Open stadium" action.
 */
export function StadiumCard({
  code,
  name,
  city,
  imageUrl,
  inactive,
  assignee,
  stats,
  statsLoading,
  onOpen,
}: {
  code: string;
  name: string;
  city?: string | null;
  imageUrl?: string | null;
  inactive?: boolean;
  /** Display name(s) of the assigned inspector(s); null when nobody is assigned. */
  assignee: string | null | undefined;
  stats: StadiumCardStats | null;
  statsLoading?: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  // Graphite on a light card; on a dark card graphite would vanish, so the
  // action takes the volt fill instead.
  const { isDark } = useTheme();
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View
      className="overflow-hidden rounded-lg border border-card-border bg-surface"
      style={elevation.card}
    >
      <StadiumPhotoHeader
        code={code}
        name={name}
        city={city}
        imageUrl={imageUrl}
        inactive={inactive}
      />

      <View className="gap-4 p-4">
        {/* Assigned inspector */}
        <View className="flex-row items-center gap-3 border-b border-border pb-3">
          <UserRound size={20} color={palette.accent} />
          <View className="flex-1">
            <Text variant="overline" tone="subtle">
              {t('stadiums.assignedInspector')}
            </Text>
            {assignee === undefined ? (
              <Skeleton height={16} width="60%" />
            ) : (
              <Text variant="callout" numberOfLines={1} tone={assignee ? 'default' : 'muted'}>
                {assignee ?? t('stadiums.unassigned')}
              </Text>
            )}
          </View>
        </View>

        {/* Stat tiles */}
        <View className="flex-row gap-2">
          <StatTile
            tone="info"
            icon={<ClipboardCheck size={18} color={palette.info} />}
            value={
              stats
                ? stats.inspectionsExpected !== null
                  ? `${stats.inspections}/${stats.inspectionsExpected}`
                  : String(stats.inspections)
                : null
            }
            label={t('kpi.inspections')}
            loading={statsLoading}
          />
          <StatTile
            tone="warning"
            icon={<TriangleAlert size={18} color={palette.warning} />}
            value={stats ? String(stats.findings) : null}
            label={t('kpi.findings')}
            loading={statsLoading}
          />
          <StatTile
            tone="success"
            value={stats ? formatPercent(stats.compliancePercent, '—') : null}
            label={t('kpi.compliance')}
            loading={statsLoading}
          />
        </View>

        {/* Progress */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="caption" tone="muted">
              {stats?.progressLabel ?? t('stadiums.inspectionProgress')}
            </Text>
            <Text variant="caption" tabular>
              {stats?.progress !== null && stats?.progress !== undefined
                ? `${Math.round(stats.progress * 100)}%`
                : '—'}
            </Text>
          </View>
          <ProgressBar value={stats?.progress ?? 0} />
        </View>

        <Animated.View style={pressStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('stadiums.open')}: ${name}`}
            onPressIn={() => (scale.value = withSpring(0.97, motion.spring))}
            onPressOut={() => (scale.value = withSpring(1, motion.spring))}
            onPress={() => {
              haptics.answer();
              onOpen();
            }}
            className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-md active:opacity-90"
            style={{ backgroundColor: isDark ? palette.primaryFill : palette.heroTo }}
          >
            <Text
              variant="callout"
              tone={isDark ? 'onPrimary' : 'onHero'}
              style={{ fontFamily: fonts.semibold }}
            >
              {t('stadiums.open')}
            </Text>
            <ArrowUpRight size={18} color={isDark ? palette.onPrimary : palette.primaryFill} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const toneText = {
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
} as const;

const tileClass = {
  info: 'bg-info-soft',
  warning: 'bg-warning-soft',
  success: 'bg-success-soft',
} as const;

function StatTile({
  tone,
  icon,
  value,
  label,
  loading,
}: {
  tone: keyof typeof tileClass;
  icon?: React.ReactNode;
  value: string | null;
  label: string;
  loading?: boolean;
}): React.JSX.Element {
  return (
    <View
      className={cn(
        'min-h-[84px] flex-1 items-center justify-center gap-1 rounded-md px-1 py-3',
        tileClass[tone],
      )}
    >
      {icon}
      {loading || value === null ? (
        <Skeleton height={24} width="50%" />
      ) : (
        <Text variant="heading" className={toneText[tone]} tabular numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text variant="overline" className={toneText[tone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
