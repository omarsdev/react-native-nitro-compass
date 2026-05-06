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
import NitroModules
import UIKit

class HybridNitroCompass: HybridNitroCompassSpec {
  private let manager = CLLocationManager()
  private var delegateProxy: HeadingDelegate?
  private var onSample: ((CompassSample) -> Void)?
  private var orientationObserver: NSObjectProtocol?
  private var declinationDeg: Double = 0
  private var lastSample: CompassSample?
  private var lastQuality: AccuracyQuality?
  private var calibrationCb: ((AccuracyQuality) -> Void)?

  override init() {
    super.init()
    manager.headingFilter = 1
    manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
  }

  func start(filterDegrees: Double, onHeading: @escaping (_ sample: CompassSample) -> Void) throws {
    guard CLLocationManager.headingAvailable() else {
      throw NSError(
        domain: "NitroCompass",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Heading unavailable on this device"]
      )
    }

    stopInternal()

    onSample = onHeading
    manager.headingFilter = filterDegrees == 0 ? kCLHeadingFilterNone : filterDegrees

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

    DispatchQueue.main.async { [weak self] in
      UIDevice.current.beginGeneratingDeviceOrientationNotifications()
      self?.applyHeadingOrientation()
    }

    manager.startUpdatingHeading()
  }

  func stop() throws {
    stopInternal()
  }

  func hasCompass() throws -> Bool {
    return CLLocationManager.headingAvailable()
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

  // MARK: - Helpers

  private func stopInternal() {
    manager.stopUpdatingHeading()
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
    onSample = nil
    lastSample = nil
    lastQuality = nil
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
