import { View, StyleSheet } from 'react-native';
import { ScoreRing } from './ScoreRing';

interface Props {
  sleepScore: number | null;
  effortScore: number | null;
  readinessScore: number | null;
}

/**
 * Zepp-style header: three colored rings side by side.
 *
 * Effort and Readiness are greyed with a "Soon" caption until Slices 2 & 3
 * light them up.
 */
export function TodayScoresHeader({
  sleepScore,
  effortScore,
  readinessScore,
}: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ScoreRing score={sleepScore} label="Sleep" color="#38bdf8" />
      <ScoreRing
        score={effortScore}
        label="Effort"
        color="#f97316"
        caption={effortScore === null ? 'Soon' : undefined}
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
