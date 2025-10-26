import Foundation
import NetworkExtension
import React

@objc(LocalServerVPNManager)
class LocalServerVPNManager: RCTEventEmitter {
    private let providerBundleIdentifier = "com.gorai.inferra.InferraServerExtension"
    private var tunnelManager: NETunnelProviderManager?
    private var cachedStatus: NEVPNStatus = .invalid

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(handleStatusChange), name: .NEVPNStatusDidChange, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override func supportedEvents() -> [String]! {
        return ["LocalServerVPNStatusChanged"]
    }

    override class func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc override func startObserving() {
        sendStatusEvent()
    }

    @objc override func stopObserving() {
    }

    @objc
    func startVPNServer(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] manager, error in
            guard let self = self else { return }
            if let error = error {
                reject("vpn_load_failed", error.localizedDescription, error)
                return
            }
            guard let manager = manager else {
                reject("vpn_missing_manager", "Manager unavailable", nil)
                return
            }
            let protocolConfiguration = NETunnelProviderProtocol()
            protocolConfiguration.providerBundleIdentifier = self.providerBundleIdentifier
            protocolConfiguration.serverAddress = "127.0.0.1"
            protocolConfiguration.providerConfiguration = self.normalizedConfiguration(from: options)
            manager.protocolConfiguration = protocolConfiguration
            manager.localizedDescription = "Inferra Local Server"
            manager.isEnabled = true
            manager.saveToPreferences { saveError in
                if let saveError = saveError {
                    reject("vpn_save_failed", saveError.localizedDescription, saveError)
                    return
                }
                do {
                    let startOptions = self.normalizedStartOptions(from: options)
                    try manager.connection.startVPNTunnel(options: startOptions)
                    self.tunnelManager = manager
                    self.cachedStatus = manager.connection.status
                    self.sendStatusEvent()
                    var payload: [String: Any] = [
                        "success": true,
                        "status": self.statusString(self.cachedStatus)
                    ]
                    if let urlValue = options["url"] as? String {
                        payload["url"] = urlValue
                    }
                    resolve(payload)
                } catch let startError {
                    reject("vpn_start_failed", startError.localizedDescription, startError)
                }
            }
        }
    }

    @objc
    func stopVPNServer(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] manager, error in
            guard let self = self else { return }
            if let error = error {
                reject("vpn_load_failed", error.localizedDescription, error)
                return
            }
            guard let manager = manager else {
                resolve(["success": false])
                return
            }
            manager.connection.stopVPNTunnel()
            self.cachedStatus = manager.connection.status
            self.sendStatusEvent()
            resolve(["success": true])
        }
    }

    @objc
    func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] manager, error in
            guard let self = self else { return }
            if let error = error {
                reject("vpn_load_failed", error.localizedDescription, error)
                return
            }
            let status = manager?.connection.status ?? self.cachedStatus
            let configuration = manager?.protocolConfiguration as? NETunnelProviderProtocol
            let info: [String: Any] = [
                "isRunning": status == .connected || status == .connecting,
                "status": self.statusString(status),
                "url": configuration?.providerConfiguration?["url"]
            ]
            resolve(info)
        }
    }

    @objc
    func updateVPNConfiguration(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] manager, error in
            guard let self = self else { return }
            if let error = error {
                reject("vpn_load_failed", error.localizedDescription, error)
                return
            }
            guard let manager = manager else {
                resolve(["success": false])
                return
            }
            let configuration = manager.protocolConfiguration as? NETunnelProviderProtocol ?? NETunnelProviderProtocol()
            configuration.providerBundleIdentifier = self.providerBundleIdentifier
            configuration.serverAddress = "127.0.0.1"
            var providerConfig = configuration.providerConfiguration ?? [:]
            if let url = options["url"] as? String {
                providerConfig["url"] = url
            }
            configuration.providerConfiguration = providerConfig
            manager.protocolConfiguration = configuration
            manager.isEnabled = true
            manager.saveToPreferences { saveError in
                if let saveError = saveError {
                    reject("vpn_save_failed", saveError.localizedDescription, saveError)
                    return
                }
                resolve(["success": true])
            }
        }
    }

    private func normalizedConfiguration(from options: NSDictionary) -> [String: Any] {
        var config: [String: Any] = [:]
        if let port = options["port"] as? Int {
            config["port"] = port
        }
        if let url = options["url"] as? String {
            config["url"] = url
        }
        return config
    }

    private func normalizedStartOptions(from options: NSDictionary) -> [String: NSObject]? {
        var result: [String: NSObject] = [:]
        if let port = options["port"] as? Int {
            result["port"] = NSNumber(value: port)
        }
        if let url = options["url"] as? String {
            result["url"] = url as NSString
        }
        return result.isEmpty ? nil : result
    }

    private func loadManager(completion: @escaping (NETunnelProviderManager?, Error?) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error = error {
                completion(nil, error)
                return
            }
            if let existing = managers?.first(where: { manager in
                guard let configuration = manager.protocolConfiguration as? NETunnelProviderProtocol else {
                    return false
                }
                return configuration.providerBundleIdentifier == self.providerBundleIdentifier
            }) {
                self.tunnelManager = existing
                self.cachedStatus = existing.connection.status
                completion(existing, nil)
                return
            }
            let manager = NETunnelProviderManager()
            self.tunnelManager = manager
            self.cachedStatus = manager.connection.status
            completion(manager, nil)
        }
    }

    @objc private func handleStatusChange() {
        if let status = tunnelManager?.connection.status {
            cachedStatus = status
        }
        sendStatusEvent()
    }

    private func statusString(_ status: NEVPNStatus) -> String {
        switch status {
        case .connected:
            return "connected"
        case .connecting:
            return "connecting"
        case .disconnected:
            return "disconnected"
        case .disconnecting:
            return "disconnecting"
        case .invalid:
            return "invalid"
        case .reasserting:
            return "reasserting"
        @unknown default:
            return "unknown"
        }
    }

    private func sendStatusEvent() {
        let status = tunnelManager?.connection.status ?? cachedStatus
        var info: [String: Any] = [
            "isRunning": status == .connected || status == .connecting,
            "status": statusString(status)
        ]
        if let configuration = tunnelManager?.protocolConfiguration as? NETunnelProviderProtocol {
            if let url = configuration.providerConfiguration?["url"] as? String {
                info["url"] = url
            }
        }
        sendEvent(withName: "LocalServerVPNStatusChanged", body: info)
    }
}
