import * as Location from 'expo-location';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
}

export type LocationAccess = 'granted' | 'denied' | 'undetermined';

export async function getLocationAccess(): Promise<LocationAccess> {
  const res = await Location.getForegroundPermissionsAsync();
  return res.status === 'granted' ? 'granted' : res.status === 'denied' ? 'denied' : 'undetermined';
}

/** Asked only when the user turns on "위치 정보 저장". */
export async function requestLocationAccess(): Promise<LocationAccess> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (!current.canAskAgain) return 'denied';
  const res = await Location.requestForegroundPermissionsAsync();
  return res.status === 'granted' ? 'granted' : 'denied';
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * Best-effort position for tagging a photo. Never throws and never blocks the
 * shutter for long: a recent cached fix is preferred, then a quick live fix.
 */
export async function getPhotoLocation(): Promise<GeoPoint | null> {
  try {
    if ((await getLocationAccess()) !== 'granted') return null;
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 200 });
    const pos =
      cached ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 2500));
    if (!pos) return null;
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, altitude: pos.coords.altitude };
  } catch {
    return null;
  }
}
