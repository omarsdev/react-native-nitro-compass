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

    let proxy = HeadingDelegate { [weak self] sample in
      self?.onSample?(sample)
    }
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
  private let onSample: (CompassSample) -> Void

  init(_ onSample: @escaping (CompassSample) -> Void) {
    self.onSample = onSample
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard newHeading.headingAccuracy >= 0 else { return }
    onSample(CompassSample(heading: newHeading.magneticHeading, accuracy: newHeading.headingAccuracy))
  }
}
