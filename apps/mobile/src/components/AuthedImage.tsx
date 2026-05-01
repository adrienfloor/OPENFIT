import { Image, type ImageProps } from 'react-native';
import { apiClient } from '../services/api';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export interface AuthedImageProps extends Omit<ImageProps, 'source'> {
  /** Server-relative path, e.g. "/nutrition/photos/{userId}/{filename}". */
  path: string | null | undefined;
}

/**
 * `<Image>` for endpoints behind the JWT auth wall. React Native's `Image`
 * accepts a `headers` field on the source URI, which we use to forward the
 * Authorization header axios already manages. Renders nothing when path is
 * empty so callers can pass an optional photoUrl through.
 */
export function AuthedImage({ path, ...rest }: AuthedImageProps) {
  if (!path) return null;
  const auth = apiClient.defaults.headers.common['Authorization'];
  const headers: Record<string, string> = {};
  if (typeof auth === 'string') headers['Authorization'] = auth;
  return (
    <Image
      source={{ uri: `${API_URL}${path}`, headers }}
      {...rest}
    />
  );
}
