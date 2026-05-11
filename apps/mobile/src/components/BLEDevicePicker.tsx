import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ScannedDevice } from '../services/ble';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  visible: boolean;
  devices: ScannedDevice[];
  onPick: (deviceId: string) => void;
}

/**
 * Modal that surfaces multiple BLE heart-rate sources discovered during a
 * workout's scan phase. Only shown when ≥ 2 devices are broadcasting — the
 * hook auto-picks when there's only one, so single-strap users never see this.
 */
export function BLEDevicePicker({ visible, devices, onPick }: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Pick a heart-rate source</Text>
          <Text style={styles.subtitle}>
            {devices.length} devices broadcasting nearby
          </Text>
          {devices.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={styles.row}
              onPress={() => onPick(d.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.deviceName}>{d.name}</Text>
              <Text style={styles.deviceId}>{d.id}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  row: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  deviceName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  deviceId: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
});
