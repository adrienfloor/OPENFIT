import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

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

  return (
    <ScrollView style={styles.container}>
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
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  email: { fontSize: 13, color: '#6b7280' },
  sectionLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDisabled: { opacity: 0.6 },
  rowText: { fontSize: 14, color: '#111827' },
  chevron: { fontSize: 18, color: '#9ca3af' },
  soon: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  logoutBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  logoutText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
});
