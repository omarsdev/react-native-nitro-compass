// Tests for the reference-counted JS multiplex over the single-callback
// native API. Each test gets a fresh `multiplex` module + fresh native
// mock via `jest.resetModules` so the internal listener sets and the
// `calibrationRegistered`/`interferenceRegistered` flags don't leak
// across tests.

type Multiplex = typeof import('../multiplex')
type NativeMock = {
  NitroCompass: {
    start: jest.Mock
    stop: jest.Mock
    setOnCalibrationNeeded: jest.Mock
    setOnInterferenceDetected: jest.Mock
  }
}

let multiplex: Multiplex
let native: NativeMock

function dispatchHeadingFromNative(sample: { heading: number; accuracy: number }) {
  const cb = native.NitroCompass.start.mock.calls[0]![1] as (s: typeof sample) => void
  cb(sample)
}

beforeEach(() => {
  jest.resetModules()
  jest.doMock('../native', () => ({
    NitroCompass: {
      start: jest.fn(),
      stop: jest.fn(),
      setOnCalibrationNeeded: jest.fn(),
      setOnInterferenceDetected: jest.fn(),
    },
  }))
  multiplex = require('../multiplex')
  native = require('../native')
})

describe('addHeadingListener', () => {
  it('calls NitroCompass.start exactly once on first listener', () => {
    multiplex.addHeadingListener(jest.fn())
    expect(native.NitroCompass.start).toHaveBeenCalledTimes(1)
  })

  it('does not call start again when more listeners join', () => {
    multiplex.addHeadingListener(jest.fn())
    multiplex.addHeadingListener(jest.fn())
    multiplex.addHeadingListener(jest.fn())
    expect(native.NitroCompass.start).toHaveBeenCalledTimes(1)
  })

  it('calls stop only when the last listener unsubscribes', () => {
    const off1 = multiplex.addHeadingListener(jest.fn())
    const off2 = multiplex.addHeadingListener(jest.fn())
    off1()
    expect(native.NitroCompass.stop).not.toHaveBeenCalled()
    off2()
    expect(native.NitroCompass.stop).toHaveBeenCalledTimes(1)
  })

  it('treats a double-unsubscribe as a no-op', () => {
    const off = multiplex.addHeadingListener(jest.fn())
    off()
    off()
    expect(native.NitroCompass.stop).toHaveBeenCalledTimes(1)
  })

  it('re-uses the existing subscription if a second listener joins after one left', () => {
    const off1 = multiplex.addHeadingListener(jest.fn())
    off1()
    multiplex.addHeadingListener(jest.fn())
    // Two starts, two stops → ref count is honoured.
    expect(native.NitroCompass.start).toHaveBeenCalledTimes(2)
    expect(native.NitroCompass.stop).toHaveBeenCalledTimes(1)
  })

  it('fans out a single native sample to every active listener', () => {
    const a = jest.fn()
    const b = jest.fn()
    const c = jest.fn()
    multiplex.addHeadingListener(a)
    multiplex.addHeadingListener(b)
    multiplex.addHeadingListener(c)
    const sample = { heading: 42, accuracy: 5 }
    dispatchHeadingFromNative(sample)
    expect(a).toHaveBeenCalledWith(sample)
    expect(b).toHaveBeenCalledWith(sample)
    expect(c).toHaveBeenCalledWith(sample)
  })

  it('keeps fanning out to other listeners when one throws', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const bad = jest.fn(() => {
      throw new Error('listener exploded')
    })
    const good = jest.fn()
    multiplex.addHeadingListener(bad)
    multiplex.addHeadingListener(good)
    dispatchHeadingFromNative({ heading: 0, accuracy: 1 })
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('stops dispatching to a listener after its unsubscribe', () => {
    const a = jest.fn()
    const b = jest.fn()
    multiplex.addHeadingListener(a)
    const offB = multiplex.addHeadingListener(b)
    offB()
    dispatchHeadingFromNative({ heading: 0, accuracy: 1 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('tolerates a listener unsubscribing during its own dispatch', () => {
    const a = jest.fn()
    let offSelf: (() => void) | null = null
    const selfRemoving = jest.fn(() => offSelf?.())
    multiplex.addHeadingListener(a)
    offSelf = multiplex.addHeadingListener(selfRemoving)
    dispatchHeadingFromNative({ heading: 0, accuracy: 1 })
    expect(selfRemoving).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledTimes(1)
    // Next dispatch reaches `a` only.
    dispatchHeadingFromNative({ heading: 1, accuracy: 1 })
    expect(selfRemoving).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledTimes(2)
  })
})

describe('addCalibrationListener', () => {
  it('registers setOnCalibrationNeeded once and only once', () => {
    multiplex.addCalibrationListener(jest.fn())
    multiplex.addCalibrationListener(jest.fn())
    expect(native.NitroCompass.setOnCalibrationNeeded).toHaveBeenCalledTimes(1)
  })

  it('fans out calibration transitions to every listener', () => {
    const a = jest.fn()
    const b = jest.fn()
    multiplex.addCalibrationListener(a)
    multiplex.addCalibrationListener(b)
    const dispatcher = native.NitroCompass.setOnCalibrationNeeded.mock.calls[0]![0]
    dispatcher('low')
    expect(a).toHaveBeenCalledWith('low')
    expect(b).toHaveBeenCalledWith('low')
  })

  it('stops dispatching to an unsubscribed listener', () => {
    const a = jest.fn()
    const b = jest.fn()
    const offA = multiplex.addCalibrationListener(a)
    multiplex.addCalibrationListener(b)
    offA()
    const dispatcher = native.NitroCompass.setOnCalibrationNeeded.mock.calls[0]![0]
    dispatcher('high')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith('high')
  })

  it('does not call native stop when the last calibration listener leaves', () => {
    // Calibration is observation-only — there's no native pair to stop()
    // and the registration sticks for the lifetime of the JS module.
    const off = multiplex.addCalibrationListener(jest.fn())
    off()
    expect(native.NitroCompass.stop).not.toHaveBeenCalled()
  })
})

describe('addInterferenceListener', () => {
  it('registers setOnInterferenceDetected once and only once', () => {
    multiplex.addInterferenceListener(jest.fn())
    multiplex.addInterferenceListener(jest.fn())
    expect(native.NitroCompass.setOnInterferenceDetected).toHaveBeenCalledTimes(1)
  })

  it('fans out interference transitions to every listener', () => {
    const a = jest.fn()
    const b = jest.fn()
    multiplex.addInterferenceListener(a)
    multiplex.addInterferenceListener(b)
    const dispatcher = native.NitroCompass.setOnInterferenceDetected.mock.calls[0]![0]
    dispatcher(true)
    dispatcher(false)
    expect(a).toHaveBeenNthCalledWith(1, true)
    expect(a).toHaveBeenNthCalledWith(2, false)
    expect(b).toHaveBeenNthCalledWith(1, true)
    expect(b).toHaveBeenNthCalledWith(2, false)
  })
})

describe('isolation between listener kinds', () => {
  it('heading listeners do not affect calibration registration', () => {
    multiplex.addHeadingListener(jest.fn())
    expect(native.NitroCompass.setOnCalibrationNeeded).not.toHaveBeenCalled()
    expect(native.NitroCompass.setOnInterferenceDetected).not.toHaveBeenCalled()
  })

  it('calibration listeners do not start a heading subscription', () => {
    multiplex.addCalibrationListener(jest.fn())
    expect(native.NitroCompass.start).not.toHaveBeenCalled()
  })
})
