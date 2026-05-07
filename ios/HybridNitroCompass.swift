//
//  HybridNitroCompass.swift
//  NitroCompass
//
//  iOS implementation of the NitroCompass HybridObject. Uses
//  CLLocationManager for the heading source — Apple's stack already does
//  proper sensor fusion natively, so the Swift side stays simple.
//

import Foundation
import CoreLocation
import CoreMotion
import NitroModules
import UIKit

// Earth's magnetic field magnitude is typically 25–65 µT. Anything
// outside this band (with a small grace margin) is treated as
// external interference — laptops, monitors, car engines, and
// structural steel routinely push readings well above 100 µT.
private let earthFieldMinUT: Double = 20
private let earthFieldMaxUT: Double = 70

class HybridNitroCompass: HybridNitroCompassSpec {
  // CLLocationManager must be created on a thread with an active run loop
  // (typically main). Nitro can instantiate HybridObjects off-main, so we
  // hop to main for construction and configuration.
  private var manager: CLLocationManager!
  private var delegateProxy: HeadingDelegate?
  private var onSample: ((CompassSample) -> Void)?
  private var orientationObserver: NSObjectProtocol?
  private var backgroundObserver: NSObjectProtocol?
  private var foregroundObserver: NSObjectProtocol?
  private var declinationDeg: Double = 0
  private var lastSample: CompassSample?
  private var lastQuality: AccuracyQuality?
  private var calibrationCb: ((AccuracyQuality) -> Void)?
  private var interferenceCb: ((Bool) -> Void)?
  private let motionManager = CMMotionManager()
  private let motionQueue: OperationQueue = {
    let q = OperationQueue()
    q.name = "NitroCompass.motion"
    q.maxConcurrentOperationCount = 1
    return q
  }()
  private var lastInterference: Bool?
  private var pauseOnBackground: Bool = true
  private var started: Bool = false
  private var isSubscribed: Bool = false
  private var activeFilterDegrees: Double = 1
  // Mirrors UIApplication.applicationState. Updated from background/foreground
  // notification observers (delivered on main) so JS-thread callers don't
  // have to hop to main to read it.
  private var appIsBackgrounded: Bool = false
  // Holds an in-flight permission request. CLLocationManager.delegate is
  // weak, so we own the resolver here for the duration of the request.
  private var authResolver: AuthRequestResolver?

  override init() {
    super.init()
    let setup = {
      let m = CLLocationManager()
      m.headingFilter = 1
      m.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
      self.manager = m
    }
    if Thread.isMainThread {
      setup()
    } else {
      DispatchQueue.main.sync(execute: setup)
    }
  }

  deinit {
    stopInternal()
  }

  func start(filterDegrees: Double, onHeading: @escaping (_ sample: CompassSample) -> Void) throws {
    guard CLLocationManager.headingAvailable() else {
      throw NSError(
        domain: "NitroCompass",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Heading unavailable on this device"]
      )
    }

    // CLLocationManager.startUpdatingHeading silently delivers nothing
    // when location authorization is denied. Surface that explicitly so
    // callers don't wait on a callback that will never fire.
    // .notDetermined still proceeds — the host may request later.
    let authStatus = manager.authorizationStatus
    if authStatus == .denied || authStatus == .restricted {
      throw NSError(
        domain: "NitroCompass",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Location authorization denied — request authorization before calling start()"]
      )
    }

    stopInternal()

    onSample = onHeading
    activeFilterDegrees = filterDegrees
    started = true

    let proxy = HeadingDelegate(
      onSample: { [weak self] heading, accuracy in
        self?.deliver(heading: heading, accuracy: accuracy)
      },
      onCalibrationOverride: { [weak self] in
        self?.fireCalibration(.unreliable)
      }
    )
    delegateProxy = proxy
    manager.delegate = proxy

    orientationObserver = NotificationCenter.default.addObserver(
      forName: UIDevice.orientationDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.applyHeadingOrientation()
    }

    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleBackground()
    }

    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleForeground()
    }

    // Read background state synchronously so a start() call from
    // background correctly skips the initial subscribe under
    // pauseOnBackground=true. Without this the lifecycle observers
    // wouldn't fire (we're already in BG) and a useless subscription
    // would sit there until the next FG↔BG cycle.
    let backgroundedAtStart: Bool
    if Thread.isMainThread {
      backgroundedAtStart = UIApplication.shared.applicationState == .background
    } else {
      var bg = false
      DispatchQueue.main.sync {
        bg = UIApplication.shared.applicationState == .background
      }
      backgroundedAtStart = bg
    }
    appIsBackgrounded = backgroundedAtStart

    DispatchQueue.main.async { [weak self] in
      UIDevice.current.beginGeneratingDeviceOrientationNotifications()
      self?.applyHeadingOrientation()
    }

    if !(pauseOnBackground && backgroundedAtStart) {
      subscribe()
    }
  }

  func stop() throws {
    stopInternal()
  }

  func hasCompass() throws -> Bool {
    return CLLocationManager.headingAvailable()
  }

  func isStarted() throws -> Bool {
    return started
  }

  func setFilter(degrees: Double) throws {
    activeFilterDegrees = degrees
    if isSubscribed {
      manager.headingFilter = degrees == 0 ? kCLHeadingFilterNone : degrees
    }
  }

  func getDiagnostics() throws -> SensorDiagnostics? {
    guard CLLocationManager.headingAvailable() else { return nil }
    return SensorDiagnostics(sensor: .corelocation)
  }

  func getCurrentHeading() throws -> CompassSample? {
    return lastSample
  }

  func setDeclination(degrees: Double) throws {
    declinationDeg = degrees
  }

  func setOnCalibrationNeeded(onChange: @escaping (_ quality: AccuracyQuality) -> Void) throws {
    calibrationCb = onChange
  }

  func setOnInterferenceDetected(onChange: @escaping (_ interferenceDetected: Bool) -> Void) throws {
    interferenceCb = onChange
    // Replay current state so a late-registering consumer sees the truth
    // instead of waiting for the next transition (which may never come
    // if the field stays stable).
    if let last = lastInterference { onChange(last) }
  }

  func setPauseOnBackground(enabled: Bool) throws {
    pauseOnBackground = enabled
    if enabled, started, isSubscribed, appIsBackgrounded {
      unsubscribe()
    } else if !enabled, started, !isSubscribed {
      subscribe()
    }
  }

  func getPermissionStatus() throws -> PermissionStatus {
    return Self.mapAuthStatus(manager.authorizationStatus)
  }

  func requestPermission() throws -> Promise<PermissionStatus> {
    let current = manager.authorizationStatus
    if current != .notDetermined {
      return Promise.resolved(withResult: Self.mapAuthStatus(current))
    }

    let promise = Promise<PermissionStatus>()

    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        promise.reject(withError: NSError(
          domain: "NitroCompass",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Compass instance was deallocated"]
        ))
        return
      }

      // Cancel any in-flight request — only one outstanding system
      // prompt makes sense.
      self.authResolver?.cancel()

      let resolver = AuthRequestResolver(promise: promise)
      // Save the existing delegate so heading delivery can resume after
      // the auth callback fires. CLLocationManager.delegate is weak, so
      // we have to keep our resolver alive on `self` for the duration.
      resolver.savedDelegate = self.manager.delegate
      resolver.onResolved = { [weak self] in self?.authResolver = nil }
      self.authResolver = resolver
      self.manager.delegate = resolver
      self.manager.requestWhenInUseAuthorization()
    }

    return promise
  }

  private static func mapAuthStatus(_ status: CLAuthorizationStatus) -> PermissionStatus {
    switch status {
    case .authorizedAlways, .authorizedWhenInUse:
      return .granted
    case .denied, .restricted:
      return .denied
    case .notDetermined:
      return .unknown
    @unknown default:
      return .unknown
    }
  }

  // MARK: - Helpers

  private func subscribe() {
    guard !isSubscribed else { return }
    manager.headingFilter = activeFilterDegrees == 0 ? kCLHeadingFilterNone : activeFilterDegrees
    manager.startUpdatingHeading()
    startMagnetometerIfAvailable()
    isSubscribed = true
  }

  private func unsubscribe() {
    guard isSubscribed else { return }
    manager.stopUpdatingHeading()
    stopMagnetometerIfRunning()
    isSubscribed = false
  }

  private func startMagnetometerIfAvailable() {
    guard motionManager.isDeviceMotionAvailable,
          !motionManager.isDeviceMotionActive else { return }
    motionManager.deviceMotionUpdateInterval = 0.2 // 5Hz
    motionManager.startDeviceMotionUpdates(to: motionQueue) { [weak self] motion, _ in
      guard let self = self, let m = motion else { return }
      let cal = m.magneticField
      if cal.accuracy == .uncalibrated { return }
      let f = cal.field
      let magnitude = sqrt(f.x * f.x + f.y * f.y + f.z * f.z)
      self.evaluateInterference(magnitude: magnitude)
    }
  }

  private func stopMagnetometerIfRunning() {
    if motionManager.isDeviceMotionActive {
      motionManager.stopDeviceMotionUpdates()
    }
  }

  private func evaluateInterference(magnitude: Double) {
    let isInterference = magnitude < earthFieldMinUT || magnitude > earthFieldMaxUT
    if lastInterference == isInterference { return }
    lastInterference = isInterference
    interferenceCb?(isInterference)
  }

  private func handleBackground() {
    appIsBackgrounded = true
    if pauseOnBackground, started, isSubscribed {
      unsubscribe()
    }
  }

  private func handleForeground() {
    appIsBackgrounded = false
    if pauseOnBackground, started, !isSubscribed {
      subscribe()
    }
  }

  private func stopInternal() {
    started = false
    unsubscribe()
    if delegateProxy != nil {
      manager.delegate = nil
      delegateProxy = nil
    }
    if let observer = orientationObserver {
      NotificationCenter.default.removeObserver(observer)
      orientationObserver = nil
      DispatchQueue.main.async {
        UIDevice.current.endGeneratingDeviceOrientationNotifications()
      }
    }
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
      backgroundObserver = nil
    }
    if let observer = foregroundObserver {
      NotificationCenter.default.removeObserver(observer)
      foregroundObserver = nil
    }
    onSample = nil
    lastSample = nil
    lastQuality = nil
    lastInterference = nil
  }

  private func deliver(heading magnetic: Double, accuracy: Double) {
    var heading = magnetic + declinationDeg
    heading = heading.truncatingRemainder(dividingBy: 360)
    if heading < 0 { heading += 360 }
    let sample = CompassSample(heading: heading, accuracy: accuracy)
    lastSample = sample

    let quality: AccuracyQuality
    if accuracy < 0 {
      quality = .unreliable
    } else if accuracy < 5 {
      quality = .high
    } else if accuracy < 15 {
      quality = .medium
    } else if accuracy < 30 {
      quality = .low
    } else {
      quality = .unreliable
    }
    fireCalibration(quality)

    onSample?(sample)
  }

  private func fireCalibration(_ quality: AccuracyQuality) {
    guard quality != lastQuality else { return }
    lastQuality = quality
    calibrationCb?(quality)
  }

  private func applyHeadingOrientation() {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first
    let clOrientation: CLDeviceOrientation
    switch scene?.interfaceOrientation {
    case .landscapeLeft:
      clOrientation = .landscapeRight
    case .landscapeRight:
      clOrientation = .landscapeLeft
    case .portraitUpsideDown:
      clOrientation = .portraitUpsideDown
    default:
      clOrientation = .portrait
    }
    manager.headingOrientation = clOrientation
  }
}

/// One-shot delegate that drives a `requestPermission()` call. It owns
/// the `Promise` until the system delivers the user's choice via
/// `locationManagerDidChangeAuthorization`, then restores the prior
/// delegate so heading delivery resumes if a subscription was active.
private class AuthRequestResolver: NSObject, CLLocationManagerDelegate {
  private let promise: Promise<PermissionStatus>
  weak var savedDelegate: CLLocationManagerDelegate?
  var onResolved: (() -> Void)?
  private var resolved = false

  init(promise: Promise<PermissionStatus>) {
    self.promise = promise
  }

  func cancel() {
    guard !resolved else { return }
    resolved = true
    promise.reject(withError: NSError(
      domain: "NitroCompass",
      code: 3,
      userInfo: [NSLocalizedDescriptionKey: "Permission request superseded"]
    ))
    onResolved?()
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    if status == .notDetermined { return }
    if resolved { return }
    resolved = true
    manager.delegate = savedDelegate
    let mapped: PermissionStatus
    switch status {
    case .authorizedAlways, .authorizedWhenInUse: mapped = .granted
    case .denied, .restricted: mapped = .denied
    default: mapped = .unknown
    }
    promise.resolve(withResult: mapped)
    onResolved?()
  }
}

/// CLLocationManager requires an NSObject delegate. Wrapping it lets the
/// HybridObject stay a pure Swift class.
private class HeadingDelegate: NSObject, CLLocationManagerDelegate {
  private let onSample: (Double, Double) -> Void
  private let onCalibrationOverride: () -> Void

  init(
    onSample: @escaping (Double, Double) -> Void,
    onCalibrationOverride: @escaping () -> Void
  ) {
    self.onSample = onSample
    self.onCalibrationOverride = onCalibrationOverride
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard newHeading.headingAccuracy >= 0 else { return }
    onSample(newHeading.magneticHeading, newHeading.headingAccuracy)
  }

  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    onCalibrationOverride()
    return false
  }
}
