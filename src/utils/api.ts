import { Capacitor } from '@capacitor/core';

// Automatically point to our deployed production server when running on native platforms (iOS/Android)
export const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://ais-pre-t4o27bjc24sbr2g4e2ogva-499613866363.europe-west2.run.app'
  : '';

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
