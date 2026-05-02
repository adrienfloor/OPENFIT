import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { dialog } from '../../services/dialog';
import { colors, spacing, radii, typography } from '../../theme';
import { useScreenTopPadding } from '../../theme/useScreenPadding';

/**
 * Preferences tab — Slice 8.
 *
 * Sections:
 *   • Profile card with the user's name + email and a tap → real
 *     profile editor at /preferences/profile (PATCH /auth/me).
 *   • Body stats summary (DOB / weight / height / sex) read straight
 *     from the cached UserProfile so users see their values without
 *     opening the editor.
 *   • Shortcuts: nutrition targets (real), coaching profile (real).
 *   • Settings stubs: units, notifications, theme — all "Soon".
 *   • Logout button.
 */
export default function PreferencesScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const topPadding = useScreenTopPadding();

  const dob = user ? new Date(user.dateOfBirth) : null;
  const dobLabel = dob
    ? dob.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
  const ageYears = dob
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const onComingSoon = (feature: string) => () =>
    dialog.alert(`${feature} — Coming soon`, 'This will land in a future slice.');

  const onLogout = () =>
    dialog.alert('Log out?', 'You can sign back in with the same email.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);

  return (
    <ScrollView style={[styles.container, { paddingTop: topPadding }]}>
      <Text style={styles.title}>Preferences</Text>

      {/* Profile card */}
      <TouchableOpacity
        style={styles.profileCard}
        activeOpacity={0.85}
        onPress={() => router.push('/preferences/profile')}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name ?? 'athlete'}</Text>
          <Text style={styles.email}>{user?.email ?? ''}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {/* Body stats */}
      <Text style={styles.sectionLabel}>Body</Text>
      <View style={styles.statsCard}>
        <StatRow
          label="Date of birth"
          value={ageYears != null ? `${dobLabel} · ${ageYears}y` : dobLabel}
        />
        <Divider />
        <StatRow label="Weight" value={user ? `${user.weightKg} kg` : '—'} />
        <Divider />
        <StatRow label="Height" value={user ? `${user.heightCm} cm` : '—'} />
        <Divider />
        <StatRow
          label="Sex"
          value={user ? (user.sex === 'male' ? 'Male' : 'Female') : '—'}
        />
      </View>

      {/* Shortcuts */}
      <Text style={styles.sectionLabel}>Shortcuts</Text>
      <ShortcutRow
        label="Nutrition targets"
        sub="Daily calories + macro split"
        onPress={() => router.push('/nutrition/targets')}
      />
      <ShortcutRow
        label="Coaching profile"
        sub="Goal, equipment, sessions/week"
        onPress={() => router.push('/(tabs)/coach')}
      />

      {/* Settings */}
      <Text style={styles.sectionLabel}>Settings</Text>
      <ShortcutRow label="Units" sub="Metric · imperial" comingSoon onPress={onComingSoon('Units')} />
      <ShortcutRow
        label="Notifications"
        sub="Quiet hours, reminders"
        comingSoon
        onPress={onComingSoon('Notifications')}
      />

      <View style={{ height: spacing.xxl }} />

      <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>OpenFit · Phase 2.5</Text>
      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
}

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

interface ShortcutRowProps {
  label: string;
  sub?: string;
  comingSoon?: boolean;
  onPress: () => void;
}

function ShortcutRow({ label, sub, comingSoon, onPress }: ShortcutRowProps) {
  return (
    <TouchableOpacity style={styles.shortcutRow} onPress={onPress} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={styles.shortcutLabel}>{label}</Text>
        {sub ? <Text style={styles.shortcutSub}>{sub}</Text> : null}
      </View>
      {comingSoon ? <Text style={styles.soon}>Soon</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.bg,
  },
  name: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: 2,
  },
  email: { fontSize: typography.size.xs + 1, color: colors.textSecondary },
  chevron: { fontSize: typography.size.xl, color: colors.textMuted },
  sectionLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statLabel: {
    flex: 1,
    fontSize: typography.size.sm + 1,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
  },
  statValue: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  shortcutRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  shortcutLabel: {
    fontSize: typography.size.sm + 1,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  shortcutSub: {
    fontSize: typography.size.xs + 1,
    color: colors.textSecondary,
    marginTop: 2,
  },
  soon: {
    fontSize: typography.size.xs - 1,
    color: colors.textMuted,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  logoutBtn: {
    paddingVertical: spacing.md + 2,
    borderRadius: radii.md,
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: typography.size.md,
    color: colors.danger,
    fontWeight: typography.weight.bold,
  },
  versionText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
