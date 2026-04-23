import { View, StyleSheet } from 'react-native';
import { ScoreRing } from './ScoreRing';

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

/**
 * Zepp-style header: three colored rings side by side.
 *
 * Effort shows earned/target (e.g. "124/100") below the label. BioCharge
 * shows "3/7 days" while calibrating — the ring still renders the neutral 50
 * but the tier label reads CAL. instead of POOR so the UI isn't claiming
 * signal it doesn't have.
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
        : undefined;

  const readinessCaption = readinessCalibrating
    ? `${readinessBaselineDays}/7 days`
    : readinessScore === null
      ? 'Soon'
      : undefined;

  return (
    <View style={styles.container}>
      <ScoreRing score={sleepScore} label="Sleep" color="#38bdf8" />
      <ScoreRing
        score={effortScore}
        label="Effort"
        color="#f97316"
        caption={effortCaption}
      />
      <ScoreRing
        score={readinessScore}
        label="BioCharge"
        color="#10b981"
        caption={readinessCaption}
        tierOverride={readinessCalibrating ? 'CAL.' : undefined}
        variant="battery"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
});
