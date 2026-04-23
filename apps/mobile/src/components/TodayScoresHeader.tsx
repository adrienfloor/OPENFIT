import { View, StyleSheet } from 'react-native';
import { ScoreRing } from './ScoreRing';

interface Props {
  sleepScore: number | null;
  effortScore: number | null;
  /** Optional: raw intensity-minutes earned today, shown as "earned/target" caption. */
  effortEarnedMinutes?: number | null;
  effortTargetMinutes?: number | null;
  readinessScore: number | null;
}

/**
 * Zepp-style header: three colored rings side by side.
 *
 * Effort shows "earned/target" intensity-minutes underneath its label, the
 * same way Zepp shows 124/32. Readiness stays greyed with "Soon" until Slice 3.
 */
export function TodayScoresHeader({
  sleepScore,
  effortScore,
  effortEarnedMinutes,
  effortTargetMinutes,
  readinessScore,
}: Props): React.JSX.Element {
  const effortCaption =
    effortScore === null
      ? 'Soon'
      : effortEarnedMinutes != null && effortTargetMinutes != null
        ? `${effortEarnedMinutes}/${effortTargetMinutes}`
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
        caption={readinessScore === null ? 'Soon' : undefined}
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
