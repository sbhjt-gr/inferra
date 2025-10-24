import Network
import NetworkExtension

class PacketTunnelProvider: NEPacketTunnelProvider {
  private var listener: NWListener?
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private let queue = DispatchQueue(label: "inferra.packet.listener")

  override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
    let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    settings.ipv4Settings = NEIPv4Settings(addresses: ["192.0.2.1"], subnetMasks: ["255.255.255.0"])
    settings.ipv4Settings?.includedRoutes = [NEIPv4Route.default()]
    settings.mtu = 1500
    setTunnelNetworkSettings(settings) { error in
      if let error = error {
        completionHandler(error)
        return
      }
      self.startListener()
      completionHandler(nil)
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
  listener?.cancel()
  listener = nil
  connections.values.forEach { $0.cancel() }
  connections.removeAll()
    completionHandler()
  }

  private func startListener() {
    guard listener == nil else {
      return
    }
    let port = resolvePort()
    do {
      let listener = try NWListener(using: .tcp, on: port)
      listener.newConnectionHandler = { [weak self] connection in
        self?.handle(connection: connection)
      }
      listener.stateUpdateHandler = { [weak self] state in
        if case .failed = state {
          self?.listener?.cancel()
          self?.listener = nil
        }
      }
      listener.start(queue: queue)
      self.listener = listener
    } catch {
      cancelTunnelWithError(error)
    }
  }

  private func handle(connection: NWConnection) {
    connections[ObjectIdentifier(connection)] = connection
    connection.stateUpdateHandler = { [weak self, weak connection] state in
      if case .failed = state {
        if let connection = connection {
          self?.connections.removeValue(forKey: ObjectIdentifier(connection))
        }
      }
      if case .cancelled = state {
        if let connection = connection {
          self?.connections.removeValue(forKey: ObjectIdentifier(connection))
        }
      }
    }
    connection.start(queue: queue)
    receive(on: connection)
  }

  private func receive(on connection: NWConnection) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
      if let _ = error {
        connection.cancel()
        self?.connections.removeValue(forKey: ObjectIdentifier(connection))
        return
      }
      if isComplete {
        connection.cancel()
        self?.connections.removeValue(forKey: ObjectIdentifier(connection))
        return
      }
      if let data = data, !data.isEmpty {
        self?.respond(to: connection)
      }
      self?.receive(on: connection)
    }
  }

  private func respond(to connection: NWConnection) {
    let body = "OK"
    let response = "HTTP/1.1 200 OK\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n\(body)"
    connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self, weak connection] _ in
      connection?.cancel()
      if let connection = connection {
        self?.connections.removeValue(forKey: ObjectIdentifier(connection))
      }
    })
  }

  private func resolvePort() -> Network.NWEndpoint.Port {
    if let configuration = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration,
       let value = configuration["port"] as? NSNumber,
       let port = Network.NWEndpoint.Port(rawValue: value.uint16Value) {
      return port
    }
    return Network.NWEndpoint.Port(rawValue: 62000)!
  }
}
