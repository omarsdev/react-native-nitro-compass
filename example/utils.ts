import type {AccuracyQuality, SensorKind} from 'react-native-nitro-compass';

export const cardinal = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

export const sensorLabel = (k: SensorKind | undefined) => {
  switch (k) {
    case 'magnetometer':
      return 'magnetometer (raw)';
    case 'coreLocation':
      return 'CoreLocation';
    case 'rotationVector':
      return 'rotation-vector (fused)';
    case 'geomagneticRotationVector':
      return 'geomagnetic (no gyro)';
    default:
      return 'no compass';
  }
};

// Earth's field is ~25–65 µT depending on latitude. Anything well
// outside that band signals nearby ferrous metal or active electronics.
// We surface a coarse colour for the strength meter so consumers can
// at-a-glance see "is the reading trustworthy right now".
export const fieldStrengthColor = (uT: number) => {
  if (uT < 0) return '#666';
  if (uT < 20 || uT > 70) return '#c33';
  if (uT < 25 || uT > 65) return '#cb0';
  return '#0a7';
};

export const qualityColor = (q: AccuracyQuality | null) => {
  switch (q) {
    case 'high':
      return '#0a7';
    case 'medium':
      return '#cb0';
    case 'low':
      return '#c70';
    case 'unreliable':
      return '#c33';
    default:
      return '#666';
  }
};

export const FILTERS = [0, 1, 2, 5] as const;
export type Filter = (typeof FILTERS)[number];

// Smoothing presets for the example UI. The α maps directly to
// NitroCompass.setSmoothing() — Android applies a circular EMA on
// (sin θ, cos θ) of the heading; iOS ignores it (CLLocationManager
// already filters internally). 1.0 disables smoothing entirely.
export const SMOOTHINGS = [
  {label: 'off', alpha: 1.0},
  {label: 'light', alpha: 0.5},
  {label: 'normal', alpha: 0.2},
  {label: 'heavy', alpha: 0.05},
] as const;
export type Smoothing = (typeof SMOOTHINGS)[number]['alpha'];

export const TICK_DEGS = [
  0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
] as const;

export const CARDINALS = [
  {deg: 0, label: 'N', isNorth: true},
  {deg: 90, label: 'E', isNorth: false},
  {deg: 180, label: 'S', isNorth: false},
  {deg: 270, label: 'W', isNorth: false},
] as const;

// Demo offset to visualize that setDeclination shifts every emitted sample
// natively. Real apps should pull declination from a model like
// `geomagnetism` keyed on the user's lat/lon.
export const DEMO_DECLINATION_DEG = 5;

export const DIAL_SIZE = 260;
