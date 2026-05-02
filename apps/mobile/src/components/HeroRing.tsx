import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, typography } from '../theme';

interface Props {
  /** 0-100 score. Null renders an empty ring + dash. */
  score: number | null;
  color: string;
  /** Optional tier label rendered under the score (e.g. "CHARGED"). */
  tier?: string;
  /** Optional sub-line rendered under the tier (e.g. "Updated 15:43"). */
  subtitle?: string;
  /** Optional caption above the ring (e.g. "BioCharge"). */
  caption?: string;
  size?: number;
  strokeWidth?: number;
  onPress?: () => void;
  /** Optional element rendered to the right of the ring (info icon, etc). */
  trailing?: ReactNode;
}

/**
 * Larger version of ScoreRing for sub-tab heroes (BioCharge / Sleep /
 * Effort). Like the smaller ring, the arc length tracks the score via
 * stroke-dasharray on a rotated SVG circle so we get a clean stroke
 * without composing multiple paths.
 */
export function HeroRing({
  score,
  color,
  tier,
  subtitle,
  caption,
  size = 200,
  strokeWidth = 12,
  onPress,
  trailing,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const dashOffset = circumference * (1 - progress);

  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.wrap} onPress={onPress} activeOpacity={0.85}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {score !== null ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </Svg>
        <View style={StyleSheet.absoluteFill as unknown as object} pointerEvents="none">
          <View style={styles.center}>
            <Text style={[styles.score, { color: colors.text }]}>
              {score !== null ? Math.round(score) : '—'}
            </Text>
            {tier ? <Text style={[styles.tier, { color }]}>{tier}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', position: 'relative' },
  caption: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 56, fontWeight: '700', lineHeight: 64 },
  tier: {
    marginTop: 2,
    fontSize: typography.size.xs + 1,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: { marginTop: 4, fontSize: typography.size.xs + 1, color: colors.textMuted },
  trailing: { position: 'absolute', right: 0, top: 0 },
});
