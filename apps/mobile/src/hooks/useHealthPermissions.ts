import { useState, useEffect, useCallback } from 'react';
import {
  initializeHealthConnect,
  requestHealthPermissions,
} from '../services/healthConnect';

export function useHealthPermissions(): {
  granted: boolean;
  isLoading: boolean;
  error: string | null;
  request: () => Promise<void>;
} {
  const [granted, setGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const available = await initializeHealthConnect();
    if (!available) {
      setError(
        'Health Connect is not installed. Please install it from the Play Store.',
      );
      setIsLoading(false);
      return;
    }

    const result = await requestHealthPermissions();
    setGranted(result);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  return { granted, isLoading, error, request };
}
