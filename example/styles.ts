import {StyleSheet} from 'react-native';
import {DIAL_SIZE} from './utils';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d10',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  // Top bar (persistent — Header + Start/Stop)
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  topButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  topButtonText: {color: '#fff', fontSize: 14, fontWeight: '600'},

  // Scroll body
  scrollContent: {paddingBottom: 24},

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {color: '#fff', fontSize: 22, fontWeight: '600'},
  sensorChip: {
    color: '#aab',
    fontSize: 11,
    backgroundColor: '#1c1c22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Dial — each tick / cardinal label sits inside a dial-sized "spoke"
  // wrapper that's rotated into position. The wrapper centers its child
  // horizontally at the top edge so rotating it sweeps the child around the
  // dial's true geometric center — no manual trig.
  dialWrap: {
    alignSelf: 'center',
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#2a2a30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spoke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  tick: {
    marginTop: 6,
    borderRadius: 2,
  },
  cardinalLabel: {
    marginTop: 22,
    color: '#bbb',
    fontSize: 18,
    fontWeight: '600',
  },
  cardinalNorth: {color: '#f55'},
  needle: {
    position: 'absolute',
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 0,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f55',
  },

  // Readout
  readout: {alignItems: 'center', gap: 4, marginVertical: 4},
  heading: {
    color: '#fff',
    fontSize: 56,
    fontVariant: ['tabular-nums'],
    fontWeight: '300',
  },
  cardinal: {color: '#aaa', fontSize: 20, letterSpacing: 4},
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  accDot: {width: 8, height: 8, borderRadius: 4},
  accuracy: {color: '#999', fontSize: 13},

  // Alert banners
  banners: {gap: 6, marginTop: 8},
  banner: {
    fontSize: 12,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerInterference: {backgroundColor: '#a23'},
  bannerCalibration: {backgroundColor: '#a72'},
  bannerText: {color: '#fff', fontSize: 12, flex: 1},
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  refreshButtonText: {color: '#fff', fontSize: 12, fontWeight: '600'},

  // Controls
  controls: {gap: 14, marginTop: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {color: '#ddd', fontSize: 14},
  labelSub: {color: '#777', fontSize: 11, marginTop: 2},
  // Reserve room for the wider sub-label under "Use my location" so
  // the longer status strings ("Permission denied — falling back…")
  // wrap cleanly without pushing the Switch off-screen.
  locationLabelWrap: {flex: 1, paddingRight: 12},
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#1c1c22',
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentActive: {backgroundColor: '#2c2c34'},
  segmentText: {color: '#888', fontSize: 12},
  segmentTextActive: {color: '#fff', fontWeight: '600'},

  // Start/Stop button
  button: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    alignSelf: 'center',
    minWidth: 180,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},

  error: {color: '#f88', fontSize: 12, marginTop: 8, textAlign: 'center'},

  // Debug panel
  debugPanel: {marginTop: 12},
  debugToggle: {alignSelf: 'flex-start', paddingVertical: 4},
  debugToggleText: {color: '#666', fontSize: 11, fontWeight: '600'},
  debugBody: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#15151a',
    gap: 3,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debugKey: {color: '#777', fontSize: 11},
  debugValue: {
    color: '#cdd',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
