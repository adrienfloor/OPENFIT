import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  /** 0–100; null renders an empty ring + em-dash. */
  score: number | null;
  /** Label under the ring (e.g. "Sleep"). */
  label: string;
  /** Progress arc colour when score is present. */
  color: string;
  /** Size in px; defaults to 96. */
  size?: number;
  /** Stroke width; defaults to 8. */
  strokeWidth?: number;
  /** Optional caption below the label (e.g. "Calibrating"). */
  caption?: string;
}

/**
 * Zepp-style progress ring with the score inside.
 *
 * The arc is drawn with stroke-dasharray: the stroke is "length × score/100"
 * and the rest is dashed-off, so we get a clean arc whose length tracks the
 * score without needing to clip a gradient or compose multiple paths.
 */
export function ScoreRing({
  score,
  label,
  color,
  size = 96,
  strokeWidth = 8,
  caption,
}: Props): React.JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress — rotate -90° so the arc starts at 12 o'clock. */}
          {score !== null && (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </Svg>
        <View style={StyleSheet.absoluteFill as unknown as object} pointerEvents="none">
          <View style={styles.center}>
            <Text style={[styles.value, { color: score !== null ? '#111827' : '#9ca3af' }]}>
              {score !== null ? Math.round(score) : '—'}
            </Text>
            {score !== null && (
              <Text style={styles.tier}>{tierFor(score)}</Text>
            )}
          </View>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

/** Zepp-style qualitative label. Matches their French tiers (Optimal/Bien/Normal/Passable/Mauvais). */
function tierFor(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 45) return 'Poor';
  return 'Very poor';
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 24, fontWeight: '700', lineHeight: 28 },
  tier: { fontSize: 9, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  label: { marginTop: 8, fontSize: 13, color: '#374151', fontWeight: '500' },
  caption: { marginTop: 2, fontSize: 10, color: '#9ca3af' },
});
