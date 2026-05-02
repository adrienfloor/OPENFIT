import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

/**
 * Preferences tab — Slice 1 placeholder.
 *
 * - Hosts the user identity block (lifted from the old Today header).
 * - Logout moved here so Home stays focused on the daily-stats Overview.
 * - Slice 8 will fill in: Profile editor (weight/height/sex/DOB), unit
 *   prefs, notifications, nutrition targets shortcut, coach profile
 *   shortcut.
 */
export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const topPadding = useScreenTopPadding();

  return (
    <ScrollView style={[styles.container, { paddingTop: topPadding }]}>
      <Text style={styles.title}>Preferences</Text>

      <View style={styles.profileCard}>
        <Text style={styles.name}>{user?.name ?? 'athlete'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
      </View>

      <Text style={styles.sectionLabel}>Profile</Text>
      <PlaceholderRow label="Edit profile (weight, height, sex, DOB)" />

      <Text style={styles.sectionLabel}>Shortcuts</Text>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push('/nutrition/targets')}
      >
        <Text style={styles.rowText}>Nutrition targets</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push('/(tabs)/coach')}
      >
        <Text style={styles.rowText}>Coaching profile</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Settings</Text>
      <PlaceholderRow label="Units" />
      <PlaceholderRow label="Notifications" />

      <View style={{ height: 24 }} />

      <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function PlaceholderRow({ label }: { label: string }) {
  return (
    <View style={[styles.row, styles.rowDisabled]}>
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.soon}>Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  name: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: 2,
  },
  email: { fontSize: typography.size.sm, color: colors.textSecondary },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md + 2,
    marginBottom: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDisabled: { opacity: 0.6 },
  rowText: { fontSize: typography.size.sm, color: colors.text },
  chevron: { fontSize: typography.size.lg, color: colors.textMuted },
  soon: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.medium,
  },
  logoutBtn: {
    paddingVertical: spacing.md + 2,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: typography.size.sm,
    color: colors.danger,
    fontWeight: typography.weight.semibold,
  },
});
