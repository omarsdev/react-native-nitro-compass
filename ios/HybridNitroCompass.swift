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
    manager.headingFilter = max(filterDegrees, 0.1)

    let proxy = HeadingDelegate { [weak self] sample in
      self?.onSample?(sample)
    }
    proxy.managerRef = manager
    delegateProxy = proxy
    manager.delegate = proxy

    NotificationCenter.default.addObserver(
      proxy,
      selector: #selector(HeadingDelegate.onOrientationChange),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )

    manager.startUpdatingHeading()
  }

  func stop() throws {
    stopInternal()
  }

  func hasCompass() throws -> Bool {
    return CLLocationManager.headingAvailable()
  }

  // MARK: - Helpers

  private func stopInternal() {
    manager.stopUpdatingHeading()
    if let proxy = delegateProxy {
      NotificationCenter.default.removeObserver(proxy)
      manager.delegate = nil
      delegateProxy = nil
    }
    onSample = nil
  }
}

/// CLLocationManager requires an NSObject delegate. Wrapping it lets the
/// HybridObject stay a pure Swift class.
private class HeadingDelegate: NSObject, CLLocationManagerDelegate {
  private let onSample: (CompassSample) -> Void
  weak var managerRef: CLLocationManager?

  init(_ onSample: @escaping (CompassSample) -> Void) {
    self.onSample = onSample
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard newHeading.headingAccuracy >= 0 else { return }
    let adjusted = HeadingDelegate.adjustForOrientation(newHeading.magneticHeading)
    onSample(CompassSample(heading: adjusted, accuracy: newHeading.headingAccuracy))
  }

  @objc func onOrientationChange() {
    guard
      let manager = managerRef,
      let heading = manager.heading,
      heading.headingAccuracy >= 0
    else { return }
    let adjusted = HeadingDelegate.adjustForOrientation(heading.magneticHeading)
    onSample(CompassSample(heading: adjusted, accuracy: heading.headingAccuracy))
  }

  private static func adjustForOrientation(_ heading: Double) -> Double {
    let orientation = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first?.interfaceOrientation
    switch orientation {
    case .portraitUpsideDown:
      return fmod(heading + 180, 360)
    case .landscapeLeft:
      return fmod(heading - 90 + 360, 360)
    case .landscapeRight:
      return fmod(heading + 90, 360)
    default:
      return heading
    }
  }
}
