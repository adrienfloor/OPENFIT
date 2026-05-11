import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  sleepScore: number | null;
  effortScore: number | null;
  effortEarnedMinutes?: number | null;
  effortTargetMinutes?: number | null;
  readinessScore: number | null;
  /** True when baseline history is too thin to trust the readiness score. */
  readinessCalibrating?: boolean;
  /** Days of baseline actually in play (for the "3/7 days" caption). */
  readinessBaselineDays?: number;
}

const BIG_R = 68;
const BIG_STROKE = 11;
const SIDE_STROKE = 10;
const RING_GAP = 11; // visual gap between BioCharge outer edge and side arc inner edge
// SIDE_R kept at 93.5 (same as before the BIG_R bump) so the side arcs don't move.
const SIDE_R = BIG_R + BIG_STROKE / 2 + RING_GAP + SIDE_STROKE / 2;
const SIDE_ARC_DEG = 130;
const SVG_SIZE = 2 * SIDE_R + SIDE_STROKE + 4;

/**
 * Tri-ring header: Sleep (left half-arc) ─ BioCharge (full circle) ─ Effort
 * (right half-arc). All three rings share a single SVG center; side arcs
 * orbit BioCharge at a slightly larger radius so they sit close to the
 * center ring without flexbox spacing artifacts.
 */
export function TodayScoresHeader({
  sleepScore,
  effortScore,
  effortEarnedMinutes,
  effortTargetMinutes,
  readinessScore,
  readinessCalibrating = false,
  readinessBaselineDays = 0,
}: Props): React.JSX.Element {
  const effortCaption =
    effortScore === null
      ? 'Soon'
      : effortEarnedMinutes != null && effortTargetMinutes != null
        ? `${effortEarnedMinutes}/${effortTargetMinutes}`
        : null;

  const readinessCaption = readinessCalibrating
    ? `${readinessBaselineDays}/7d`
    : readinessScore === null
      ? 'Soon'
      : null;

  return (
    <View style={styles.container}>
      <ExternalScore score={sleepScore} color={colors.sleep} label="Sleep" align="left" />
      <View style={styles.composite}>
        <CompositeRings
          sleepScore={sleepScore}
          bioChargeScore={readinessScore}
          effortScore={effortScore}
        />
        <View style={StyleSheet.absoluteFill as unknown as object} pointerEvents="none">
          <View style={styles.bioCenter}>
            <Text style={[styles.bioValue, { color: colors.bioCharge }]}>
              {readinessScore !== null ? Math.round(readinessScore) : '—'}
            </Text>
            <Text style={[styles.bioLabel, { color: colors.bioCharge }]}>BioCharge</Text>
            {readinessCaption ? <Text style={styles.bioCaption}>{readinessCaption}</Text> : null}
          </View>
        </View>
      </View>
      <ExternalScore
        score={effortScore}
        color={colors.effort}
        label="Effort"
        align="right"
        caption={effortCaption}
      />
    </View>
  );
}

function CompositeRings({
  sleepScore,
  bioChargeScore,
  effortScore,
}: {
  sleepScore: number | null;
  bioChargeScore: number | null;
  effortScore: number | null;
}): React.JSX.Element {
  const cx = SVG_SIZE / 2;
  const cy = SVG_SIZE / 2;

  // BioCharge full-circle progress (starts at 12 o'clock, fills clockwise).
  const bigCirc = 2 * Math.PI * BIG_R;
  const bigProgress =
    bioChargeScore !== null ? Math.max(0, Math.min(100, bioChargeScore)) / 100 : 0;
  const bigDashOffset = bigCirc * (1 - bigProgress);

  // Side arcs share BIG center but orbit at SIDE_R. Each spans SIDE_ARC_DEG
  // centered on 9 o'clock (left) / 3 o'clock (right). Endpoints at ±halfRad
  // around the apex angle.
  const halfRad = ((SIDE_ARC_DEG / 2) * Math.PI) / 180;
  const dx = SIDE_R * Math.cos(halfRad);
  const dy = SIDE_R * Math.sin(halfRad);

  // LEFT arc: apex at angle 180° (9 o'clock). Top endpoint at 180°-halfDeg,
  // bottom at 180°+halfDeg. In SVG coords (y down), top = (cx-dx, cy-dy).
  const leftPath = `M ${cx - dx},${cy - dy} A ${SIDE_R},${SIDE_R} 0 0 0 ${cx - dx},${cy + dy}`;
  // RIGHT arc: apex at 0° (3 o'clock). Top endpoint at -halfDeg.
  const rightPath = `M ${cx + dx},${cy - dy} A ${SIDE_R},${SIDE_R} 0 0 1 ${cx + dx},${cy + dy}`;

  const sideArcLen = (SIDE_R * SIDE_ARC_DEG * Math.PI) / 180;
  const sleepProgress = sleepScore !== null ? Math.max(0, Math.min(100, sleepScore)) / 100 : 0;
  const effortProgress = effortScore !== null ? Math.max(0, Math.min(100, effortScore)) / 100 : 0;

  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE}>
      {/* BioCharge track + progress */}
      <Circle
        cx={cx}
        cy={cy}
        r={BIG_R}
        stroke={colors.border}
        strokeWidth={BIG_STROKE}
        fill="transparent"
      />
      {bioChargeScore !== null && (
        <Circle
          cx={cx}
          cy={cy}
          r={BIG_R}
          stroke={colors.bioCharge}
          strokeWidth={BIG_STROKE}
          strokeLinecap="round"
          fill="transparent"
          strokeDasharray={`${bigCirc} ${bigCirc}`}
          strokeDashoffset={bigDashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}

      {/* Left arc track + sleep progress */}
      <Path
        d={leftPath}
        stroke={colors.border}
        strokeWidth={SIDE_STROKE}
        fill="none"
        strokeLinecap="round"
      />
      {sleepScore !== null && (
        <Path
          d={leftPath}
          stroke={colors.sleep}
          strokeWidth={SIDE_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${sideArcLen} ${sideArcLen}`}
          strokeDashoffset={sideArcLen * (1 - sleepProgress)}
        />
      )}

      {/* Right arc track + effort progress */}
      <Path
        d={rightPath}
        stroke={colors.border}
        strokeWidth={SIDE_STROKE}
        fill="none"
        strokeLinecap="round"
      />
      {effortScore !== null && (
        <Path
          d={rightPath}
          stroke={colors.effort}
          strokeWidth={SIDE_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${sideArcLen} ${sideArcLen}`}
          strokeDashoffset={sideArcLen * (1 - effortProgress)}
        />
      )}
    </Svg>
  );
}

function ExternalScore({
  score,
  color,
  label,
  align,
  caption,
}: {
  score: number | null;
  color: string;
  label: string;
  align: 'left' | 'right';
  caption?: string | null;
}): React.JSX.Element {
  return (
    <View style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text style={[styles.sideValue, { color }]}>
        {score !== null ? Math.round(score) : '—'}
      </Text>
      <Text style={[styles.sideLabel, { color }]}>{label}</Text>
      {caption ? <Text style={styles.sideCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  composite: {
    width: SVG_SIZE,
    height: SVG_SIZE,
  },
  bioCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioValue: {
    fontSize: 40,
    fontWeight: typography.weight.bold,
    lineHeight: 46,
  },
  bioLabel: {
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 2,
  },
  bioCaption: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  sideValue: {
    fontSize: 26,
    fontWeight: typography.weight.bold,
    lineHeight: 30,
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  sideCaption: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
});
