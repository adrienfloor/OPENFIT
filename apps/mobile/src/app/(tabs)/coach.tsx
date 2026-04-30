import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type {
  CoachingProfile,
  CoachingEmphasis,
  Equipment,
  ExperienceLevel,
  GeneratedProgram,
  MesocyclePhase,
  SecondarySportType,
  TrainingGoal,
} from '@openfit/types';
import {
  getCoachingProfile,
  saveCoachingProfile,
  generateProgram,
} from '../../services/coach';

const GOALS: { value: TrainingGoal; label: string }[] = [
  { value: 'aesthetics', label: 'Aesthetics' },
  { value: 'strength', label: 'Strength' },
  { value: 'performance', label: 'Performance' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'fat_loss', label: 'Fat loss' },
];

const EXPERIENCE: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const EQUIPMENT: Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'machine',
  'bodyweight',
  'resistance_band',
];

const EMPHASIS: CoachingEmphasis[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
];

const PHASE_COLORS: Record<MesocyclePhase, string> = {
  accumulation: '#3b82f6',
  intensification: '#f97316',
  deload: '#22c55e',
  peak: '#a855f7',
};

const DEFAULT_PROFILE: CoachingProfile = {
  goal: 'aesthetics',
  experience: 'intermediate',
  gymSessionsPerWeek: 4,
  sessionDurationMinutes: 60,
  availableEquipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  emphasis: [],
  secondarySports: [],
};

export default function CoachScreen() {
  const [profile, setProfile] = useState<CoachingProfile>(DEFAULT_PROFILE);
  const [draft, setDraft] = useState<CoachingProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedProgram | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await getCoachingProfile();
      if (stored) {
        setProfile(stored);
        setDraft(stored);
      }
    } catch {
      // first-time user — keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    try {
      const saved = await saveCoachingProfile(draft);
      setProfile(saved);
      Alert.alert('Profile saved', 'Your coaching profile has been updated.');
    } catch {
      Alert.alert('Save failed', 'Could not save your profile. Try again.');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerated(null);
    try {
      const result = await generateProgram(draft);
      setGenerated(result.generated);
      setProfile(draft);
      Alert.alert(
        'Program generated',
        `${result.generated.name} is now in your program list.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Generation failed. Try again.';
      Alert.alert('Generation failed', message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <Text style={styles.title}>Coach</Text>
      <Text style={styles.subtitle}>
        Your AI coach uses your profile + recent activity to build a 5-week program.
      </Text>

      {/* Goal */}
      <Section title="Goal">
        <ChipRow
          options={GOALS}
          selected={[draft.goal]}
          onToggle={(v) => setDraft({ ...draft, goal: v as TrainingGoal })}
        />
      </Section>

      {/* Experience */}
      <Section title="Experience">
        <ChipRow
          options={EXPERIENCE}
          selected={[draft.experience]}
          onToggle={(v) => setDraft({ ...draft, experience: v as ExperienceLevel })}
        />
      </Section>

      {/* Sessions per week + duration */}
      <Section title="Schedule">
        <View style={styles.row}>
          <NumberPicker
            label="Sessions/week"
            value={draft.gymSessionsPerWeek}
            min={2}
            max={6}
            onChange={(v) => setDraft({ ...draft, gymSessionsPerWeek: v })}
          />
          <NumberPicker
            label="Min/session"
            value={draft.sessionDurationMinutes}
            min={30}
            max={120}
            step={15}
            onChange={(v) => setDraft({ ...draft, sessionDurationMinutes: v })}
          />
        </View>
      </Section>

      {/* Equipment */}
      <Section title="Available equipment">
        <ChipRow
          options={EQUIPMENT.map((e) => ({ value: e, label: prettify(e) }))}
          selected={draft.availableEquipment}
          onToggle={(v) =>
            setDraft({
              ...draft,
              availableEquipment: toggleArr(draft.availableEquipment, v as Equipment),
            })
          }
          multi
        />
      </Section>

      {/* Emphasis */}
      <Section title="Emphasis (optional)">
        <ChipRow
          options={EMPHASIS.map((e) => ({ value: e, label: prettify(e) }))}
          selected={draft.emphasis}
          onToggle={(v) =>
            setDraft({
              ...draft,
              emphasis: toggleArr(draft.emphasis, v as CoachingEmphasis),
            })
          }
          multi
        />
      </Section>

      {/* Secondary sports */}
      <Section title="Secondary sports">
        <SecondarySportRow
          type="jiu_jitsu"
          label="Jiu-Jitsu"
          profile={draft}
          setProfile={setDraft}
        />
        <SecondarySportRow
          type="run"
          label="Running"
          profile={draft}
          setProfile={setDraft}
        />
      </Section>

      {/* Injury notes */}
      <Section title="Injuries / limitations (optional)">
        <TextInput
          style={styles.notesInput}
          multiline
          placeholder="e.g. mild right shoulder, avoid heavy overhead pressing"
          value={draft.injuriesNotes ?? ''}
          onChangeText={(text) =>
            setDraft({ ...draft, injuriesNotes: text.length > 0 ? text : undefined })
          }
        />
      </Section>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSave}>
          <Text style={styles.secondaryBtnText}>Save profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Generate program</Text>
          )}
        </TouchableOpacity>
      </View>

      {generating && (
        <Text style={styles.hint}>
          Coaching takes ~5 seconds — analysing your last 30 days of activity…
        </Text>
      )}

      {generated && <GeneratedPreview program={generated} />}

      {!generated && profile === draft && (
        <Text style={styles.hint}>
          Profile last saved. Tap "Generate program" to create a new mesocycle.
        </Text>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface ChipOption {
  value: string;
  label: string;
}

function ChipRow({
  options,
  selected,
  onToggle,
  multi = false,
}: {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(opt.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {multi && active ? '✓ ' : ''}
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function NumberPicker({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.numberPicker}>
      <Text style={styles.numberLabel}>{label}</Text>
      <View style={styles.numberRow}>
        <TouchableOpacity
          style={styles.numberBtn}
          onPress={() => onChange(Math.max(min, value - step))}
        >
          <Text style={styles.numberBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.numberValue}>{value}</Text>
        <TouchableOpacity
          style={styles.numberBtn}
          onPress={() => onChange(Math.min(max, value + step))}
        >
          <Text style={styles.numberBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SecondarySportRow({
  type,
  label,
  profile,
  setProfile,
}: {
  type: SecondarySportType;
  label: string;
  profile: CoachingProfile;
  setProfile: (p: CoachingProfile) => void;
}) {
  const existing = profile.secondarySports.find((s) => s.type === type);
  const sessionsPerWeek = existing?.sessionsPerWeek ?? 0;
  const avgDurationMinutes = existing?.avgDurationMinutes ?? 60;

  const update = (sessions: number, duration: number) => {
    const others = profile.secondarySports.filter((s) => s.type !== type);
    if (sessions === 0) {
      setProfile({ ...profile, secondarySports: others });
    } else {
      setProfile({
        ...profile,
        secondarySports: [
          ...others,
          { type, sessionsPerWeek: sessions, avgDurationMinutes: duration },
        ],
      });
    }
  };

  return (
    <View style={styles.sportRow}>
      <Text style={styles.sportLabel}>{label}</Text>
      <View style={styles.sportPickers}>
        <NumberPicker
          label="x/week"
          value={sessionsPerWeek}
          min={0}
          max={7}
          onChange={(v) => update(v, avgDurationMinutes)}
        />
        {sessionsPerWeek > 0 && (
          <NumberPicker
            label="min"
            value={avgDurationMinutes}
            min={15}
            max={180}
            step={15}
            onChange={(v) => update(sessionsPerWeek, v)}
          />
        )}
      </View>
    </View>
  );
}

function GeneratedPreview({ program }: { program: GeneratedProgram }) {
  return (
    <View style={styles.preview}>
      <Text style={styles.previewName}>{program.name}</Text>
      <Text style={styles.previewMeta}>
        {program.durationWeeks} weeks · {program.assumptions.weeklyStrengthSessions}x/week
      </Text>
      <Text style={styles.previewOverview}>{program.overview}</Text>

      {program.weeks.map((week) => (
        <View key={week.weekNumber} style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekNum}>Week {week.weekNumber}</Text>
            <View style={[styles.phaseBadge, { backgroundColor: PHASE_COLORS[week.phase] }]}>
              <Text style={styles.phaseBadgeText}>{week.phase}</Text>
            </View>
          </View>
          <Text style={styles.weekSummary}>{week.summary}</Text>
          {week.sessions.map((session, idx) => (
            <View key={idx} style={styles.sessionCard}>
              <Text style={styles.sessionName}>{session.name}</Text>
              <Text style={styles.sessionFocus}>
                {session.focus} · {session.estimatedDurationMinutes} min
              </Text>
              {session.exercises.map((ex, eIdx) => (
                <View key={eIdx} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{ex.exerciseId}</Text>
                  <Text style={styles.exerciseSets}>
                    {ex.sets.length}x{ex.sets[0]?.reps} @ RPE {ex.sets[0]?.rpe}
                    {ex.sets[0]?.loadPctOf1RM != null
                      ? ` (${Math.round(ex.sets[0].loadPctOf1RM * 100)}% 1RM)`
                      : ''}
                  </Text>
                  <Text style={styles.exerciseRationale}>{ex.rationale}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function toggleArr<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function prettify(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// ──────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 56 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: 12 },
  numberPicker: { flex: 1 },
  numberLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  numberBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  numberBtnText: { fontSize: 18, fontWeight: '600', color: '#22c55e' },
  numberValue: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  sportRow: { marginBottom: 12 },
  sportLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  sportPickers: { flexDirection: 'row', gap: 12 },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  secondaryBtnText: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    flex: 1.5,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 12 },
  preview: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  previewName: { fontSize: 18, fontWeight: '700' },
  previewMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  previewOverview: { fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 18 },
  weekCard: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekNum: { fontSize: 15, fontWeight: '700' },
  phaseBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  phaseBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700', textTransform: 'uppercase' },
  weekSummary: { fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 8 },
  sessionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  sessionName: { fontSize: 14, fontWeight: '600' },
  sessionFocus: { fontSize: 11, color: '#6b7280', marginTop: 2, marginBottom: 6 },
  exerciseRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  exerciseName: { fontSize: 13, fontWeight: '500' },
  exerciseSets: { fontSize: 12, color: '#374151', marginTop: 2 },
  exerciseRationale: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' },
});
