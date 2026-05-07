import type {AccuracyQuality, SensorKind} from 'react-native-nitro-compass';

export const cardinal = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

export const sensorLabel = (k: SensorKind | undefined) => {
  switch (k) {
    case 'rotationVector':
      return 'rotation-vector (fused)';
    case 'geomagneticRotationVector':
      return 'geomagnetic (no gyro)';
    case 'coreLocation':
      return 'CoreLocation';
    default:
      return 'no compass';
  }
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
