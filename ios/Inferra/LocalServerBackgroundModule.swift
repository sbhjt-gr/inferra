import Foundation
import NetworkExtension
import React

@objc(LocalServerBackground)
class LocalServerBackground: RCTEventEmitter {
  private var tunnelManager: NETunnelProviderManager?
  private let queue = DispatchQueue(label: "local.server.manager")
  private var maintenanceTimer: DispatchSourceTimer?

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["local_server_maintenance"]
  }

  @objc(start:resolver:rejecter:)
  func start(_ options: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.loadManager { manager, error in
        if let error = error {
          rejecter("manager_load_failed", error.localizedDescription, error)
          return
        }
        guard let manager = manager else {
          rejecter("manager_missing", "Manager unavailable", nil)
          return
        }
        self.prepare(manager: manager, options: options)
        manager.isEnabled = true
        manager.saveToPreferences { error in
          if let error = error {
            rejecter("preferences_save_failed", error.localizedDescription, error)
            return
          }
          manager.loadFromPreferences { loadError in
            if let loadError = loadError {
              rejecter("preferences_reload_failed", loadError.localizedDescription, loadError)
              return
            }
            self.tunnelManager = manager
            self.prepare(manager: manager, options: options)
            self.startTunnel(manager: manager, resolver: resolver, rejecter: rejecter)
          }
        }
      }
    }
  }

  @objc(stop:rejecter:)
  func stop(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.loadManager { manager, error in
        if let error = error {
          rejecter("manager_load_failed", error.localizedDescription, error)
          return
        }
        guard
          let manager = manager,
          let session = manager.connection as? NETunnelProviderSession,
          session.status == .connected || session.status == .connecting
        else {
          self.stopMaintenanceTimer()
          resolver(nil)
          return
        }
        do {
          try session.stopTunnel()
          self.stopMaintenanceTimer()
          resolver(nil)
        } catch {
          rejecter("stop_failed", error.localizedDescription, error)
        }
      }
    }
  }

  @objc(status:rejecter:)
  func status(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.loadManager { manager, error in
        if let error = error {
          rejecter("manager_load_failed", error.localizedDescription, error)
          return
        }
        guard let manager = manager else {
          resolver(["running": false])
          return
        }
        let running = (manager.connection as? NETunnelProviderSession)?.status == .connected
        resolver(["running": running])
      }
    }
  }

  override func startObserving() {
    NotificationCenter.default.addObserver(self, selector: #selector(handleStatus(_:)), name: .NEVPNStatusDidChange, object: nil)
  }

  override func stopObserving() {
    NotificationCenter.default.removeObserver(self, name: .NEVPNStatusDidChange, object: nil)
    stopMaintenanceTimer()
  }

  @objc private func handleStatus(_ notification: Notification) {
    guard let session = tunnelManager?.connection as? NETunnelProviderSession else {
      return
    }
    if session.status == .connected {
      startMaintenanceTimer()
      DispatchQueue.main.async {
        self.sendEvent(withName: "local_server_maintenance", body: nil)
      }
    } else {
      stopMaintenanceTimer()
    }
  }

  private func prepare(manager: NETunnelProviderManager, options: NSDictionary?) {
    if manager.protocolConfiguration == nil {
      let configuration = NETunnelProviderProtocol()
      configuration.providerBundleIdentifier = "com.gorai.inferra.InferraPacketTunnel"
      configuration.serverAddress = "127.0.0.1"
      manager.protocolConfiguration = configuration
    }
    if let protocolConfiguration = manager.protocolConfiguration as? NETunnelProviderProtocol,
       let options = options as? [String: Any] {
      var providerConfiguration = protocolConfiguration.providerConfiguration ?? [:]
      if let port = options["port"] as? NSNumber {
        providerConfiguration["port"] = port
      }
      if let identifier = options["identifier"] as? String {
        providerConfiguration["identifier"] = identifier
      }
      protocolConfiguration.providerConfiguration = providerConfiguration
    }
    manager.localizedDescription = "Inferra Local Server"
    tunnelManager = manager
  }

  private func startTunnel(manager: NETunnelProviderManager, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard let session = manager.connection as? NETunnelProviderSession else {
      rejecter("session_unavailable", "Session unavailable", nil)
      return
    }
    do {
      try session.startTunnel(options: nil)
      startMaintenanceTimer()
      resolver(nil)
    } catch {
      rejecter("start_failed", error.localizedDescription, error)
    }
  }

  private func loadManager(completion: @escaping (NETunnelProviderManager?, Error?) -> Void) {
    if let manager = tunnelManager {
      completion(manager, nil)
      return
    }
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error = error {
        completion(nil, error)
        return
      }
      if let existing = managers?.first {
        existing.loadFromPreferences { loadError in
          if let loadError = loadError {
            completion(nil, loadError)
            return
          }
          self.tunnelManager = existing
          completion(existing, nil)
        }
        return
      }
      let manager = NETunnelProviderManager()
      manager.protocolConfiguration = NETunnelProviderProtocol()
      manager.isEnabled = true
      self.tunnelManager = manager
      completion(manager, nil)
    }
  }

  private func startMaintenanceTimer() {
    if maintenanceTimer != nil {
      return
    }
    let timer = DispatchSource.makeTimerSource(queue: queue)
  timer.schedule(deadline: .now(), repeating: .seconds(45))
    timer.setEventHandler { [weak self] in
      guard let self = self else { return }
      DispatchQueue.main.async {
        self.sendEvent(withName: "local_server_maintenance", body: nil)
      }
    }
    timer.resume()
    maintenanceTimer = timer
  }

  private func stopMaintenanceTimer() {
    maintenanceTimer?.cancel()
    maintenanceTimer = nil
  }
}
