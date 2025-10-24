import Foundation
import NetworkExtension
import React

@objc(LocalServerBackground)
class LocalServerBackground: RCTEventEmitter {
  private let appGroupIdentifier = "group.com.gorai.inferra"
  private let sharedStateFilename = "background_server_state.json"
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
  private var tunnelManager: NETunnelProviderManager?
  private let queue = DispatchQueue(label: "local.server.manager")
  private var maintenanceTimer: DispatchSourceTimer?
  private var latestOptions: NSDictionary?

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["local_server_maintenance"]
  }

  @objc(start:resolver:rejecter:)
  func start(_ options: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.latestOptions = options
      self.loadManager { manager, error in
        if let error = error {
          self.writeSharedState(running: false, options: self.latestOptions, error: error)
          rejecter("manager_load_failed", error.localizedDescription, error)
          return
        }
        guard let manager = manager else {
          self.writeSharedState(running: false, options: self.latestOptions, error: nil)
          rejecter("manager_missing", "Manager unavailable", nil)
          return
        }
        self.prepare(manager: manager, options: self.latestOptions)
        self.writeSharedState(running: false, options: self.latestOptions, error: nil)
        manager.isEnabled = true
        manager.saveToPreferences { error in
          if let error = error {
            self.writeSharedState(running: false, options: self.latestOptions, error: error)
            rejecter("preferences_save_failed", error.localizedDescription, error)
            return
          }
          manager.loadFromPreferences { loadError in
            if let loadError = loadError {
              self.writeSharedState(running: false, options: self.latestOptions, error: loadError)
              rejecter("preferences_reload_failed", loadError.localizedDescription, loadError)
              return
            }
            self.tunnelManager = manager
            self.prepare(manager: manager, options: self.latestOptions)
            self.startTunnel(manager: manager, options: self.latestOptions, resolver: resolver, rejecter: rejecter)
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
          self.writeSharedState(running: false, options: self.latestOptions, error: error)
          rejecter("manager_load_failed", error.localizedDescription, error)
          return
        }
        guard let manager = manager else {
          self.stopMaintenanceTimer()
          self.writeSharedState(running: false, options: self.latestOptions, error: nil)
          self.latestOptions = nil
          resolver(nil)
          return
        }
        guard let session = manager.connection as? NETunnelProviderSession else {
          self.stopMaintenanceTimer()
          self.writeSharedState(running: false, options: self.latestOptions, error: nil)
          self.latestOptions = nil
          resolver(nil)
          return
        }
        if session.status != .connected && session.status != .connecting {
          self.stopMaintenanceTimer()
          self.writeSharedState(running: false, options: self.latestOptions, error: nil)
          self.latestOptions = nil
          resolver(nil)
          return
        }
        do {
          try session.stopTunnel()
          self.stopMaintenanceTimer()
          self.writeSharedState(running: false, options: self.latestOptions, error: nil)
          self.latestOptions = nil
          resolver(nil)
        } catch {
          self.writeSharedState(running: false, options: self.latestOptions, error: error)
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
    let status = session.status
    queue.async {
      if status == .connected {
        self.startMaintenanceTimer()
        self.writeSharedState(running: true, options: self.latestOptions, error: nil)
        DispatchQueue.main.async {
          self.sendEvent(withName: "local_server_maintenance", body: nil)
        }
      } else {
        self.stopMaintenanceTimer()
        self.writeSharedState(running: false, options: self.latestOptions, error: nil)
      }
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
      if let metadata = options["metadata"] as? [String: Any], JSONSerialization.isValidJSONObject(metadata) {
        providerConfiguration["metadata"] = metadata
      }
      providerConfiguration["updatedAt"] = isoFormatter.string(from: Date())
      protocolConfiguration.providerConfiguration = providerConfiguration
    }
    manager.localizedDescription = "Inferra Local Server"
    tunnelManager = manager
  }

  private func startTunnel(manager: NETunnelProviderManager, options: NSDictionary?, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    guard let session = manager.connection as? NETunnelProviderSession else {
      writeSharedState(running: false, options: options, error: nil)
      rejecter("session_unavailable", "Session unavailable", nil)
      return
    }
    do {
      try session.startTunnel(options: nil)
      startMaintenanceTimer()
      writeSharedState(running: true, options: options, error: nil)
      resolver(nil)
    } catch {
      writeSharedState(running: false, options: options, error: error)
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

  private func sharedStateURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?.appendingPathComponent(sharedStateFilename)
  }

  @objc(fetchPendingAnswer:rejecter:)
  func fetchPendingAnswer(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    queue.async {
      guard let url = self.sharedStateURL(),
            let data = try? Data(contentsOf: url),
            var state = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
        resolver(nil)
        return
      }
      guard let pending = state["pendingAnswer"] as? [String: Any] else {
        resolver(nil)
        return
      }
      state.removeValue(forKey: "pendingAnswer")
      if let updated = try? JSONSerialization.data(withJSONObject: state, options: []) {
        try? updated.write(to: url, options: .atomic)
      }
      resolver(pending)
    }
  }

  private func writeSharedState(running: Bool, options: NSDictionary?, error: Error?) {
    guard let url = sharedStateURL() else {
      return
    }
    var state: [String: Any] = [
      "running": running,
      "updatedAt": isoFormatter.string(from: Date())
    ]
    if let existingData = try? Data(contentsOf: url),
       let existing = try? JSONSerialization.jsonObject(with: existingData, options: []) as? [String: Any] {
      for (key, value) in existing where state[key] == nil {
        state[key] = value
      }
    }
    if let options = options as? [String: Any] {
      if let port = options["port"] as? NSNumber {
        state["port"] = port
      }
      if let identifier = options["identifier"] as? String {
        state["identifier"] = identifier
      }
      if let metadata = options["metadata"] as? [String: Any], JSONSerialization.isValidJSONObject(metadata) {
        state["metadata"] = metadata
      }
    }
    if let error = error {
      state["error"] = error.localizedDescription
    } else {
      state.removeValue(forKey: "error")
    }
    if let data = try? JSONSerialization.data(withJSONObject: state, options: []) {
      try? data.write(to: url, options: .atomic)
    }
  }
}
