import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzeFoodPhoto } from '../../services/nutrition';
import { useNutritionStore } from '../../stores/nutrition.store';

/**
 * Capture flow:
 *   1. user taps "Take photo" or "Pick from gallery"
 *   2. expo-image-picker returns the original asset
 *   3. expo-image-manipulator compresses to 1024px / JPEG q=70
 *   4. POST /nutrition/analyze with base64 → analysis
 *   5. router.push to confirm with the analysis as a route param
 *
 * The compression step keeps storage bills low and uploads quick (a 4 MB
 * iPhone photo lands at ~150-300 KB).
 */
export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setPendingAnalysis = useNutritionStore((s) => s.setPendingAnalysis);
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  async function handlePick(source: 'camera' | 'gallery') {
    setBusy(true);
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          source === 'camera'
            ? 'Camera access is required to snap meal photos.'
            : 'Photo library access is required to pick a meal photo.',
        );
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
            });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setPreviewUri(asset.uri);

      // Resize longest side to 1024px and re-encode JPEG q=70. Returns
      // base64 in one call so we don't need to read the file twice.
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!compressed.base64) {
        throw new Error('Compression failed: no base64');
      }

      const analysis = await analyzeFoodPhoto({
        imageBase64: compressed.base64,
        mimeType: 'image/jpeg',
      });

      setPendingAnalysis(analysis);
      router.replace('/nutrition/confirm');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not analyze photo.';
      Alert.alert('Analysis failed', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Log a meal</Text>
        <View style={{ width: 50 }} />
      </View>

      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderEmoji}>🍽️</Text>
          <Text style={styles.placeholderText}>
            Snap or pick a photo of your meal. The coach will identify each
            item and estimate the macros — you'll review the result before
            it's logged.
          </Text>
        </View>
      )}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.busyText}>Analyzing your meal…</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => handlePick('camera')}
          >
            <Text style={styles.btnPrimaryText}>📸 Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => handlePick('gallery')}
          >
            <Text style={styles.btnSecondaryText}>Pick from gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace('/nutrition/manual')}
            style={styles.manualLink}
          >
            <Text style={styles.manualLinkText}>
              Or type macros manually →
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  back: { fontSize: 16, color: '#22c55e', fontWeight: '500', width: 50 },
  title: { fontSize: 20, fontWeight: '700' },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    marginBottom: 24,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  placeholderEmoji: { fontSize: 64, marginBottom: 12 },
  placeholderText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 19,
  },
  busy: { alignItems: 'center', marginTop: 16 },
  busyText: { marginTop: 12, color: '#22c55e', fontWeight: '600' },
  btn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimary: { backgroundColor: '#22c55e' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { backgroundColor: '#fff' },
  btnSecondaryText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  manualLink: { paddingVertical: 12, alignItems: 'center' },
  manualLinkText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
});
