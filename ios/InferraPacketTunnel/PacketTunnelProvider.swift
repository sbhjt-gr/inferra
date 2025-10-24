import Foundation
import Network
import NetworkExtension

private final class ConnectionContext {
  var buffer = Data()
}

private struct HTTPRequest {
  let method: String
  let path: String
  let headers: [String: String]
  let body: Data
}

private enum HTTPRequestParseResult {
  case needMoreData
  case success(HTTPRequest, Int)
  case failure
}

class PacketTunnelProvider: NEPacketTunnelProvider {
  private let appGroupIdentifier = "group.com.gorai.inferra"
  private let sharedStateFilename = "background_server_state.json"
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
  private var listener: NWListener?
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private var contexts: [ObjectIdentifier: ConnectionContext] = [:]
  private let queue = DispatchQueue(label: "inferra.packet.listener")
  private var stateTimer: DispatchSourceTimer?
  private var sharedState: [String: Any] = [:]
  private var stateFingerprint: Data?
  private var currentPort: Network.NWEndpoint.Port = Network.NWEndpoint.Port(rawValue: 62000)!

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
      self.queue.async {
        self.refreshSharedState()
        self.startListenerIfNeeded()
        self.startStateTimer()
      }
      completionHandler(nil)
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
    queue.async {
      self.stopStateTimer()
      self.resetConnections()
      self.listener?.cancel()
      self.listener = nil
    }
    completionHandler()
  }

  private func startListenerIfNeeded() {
    if listener != nil {
      return
    }
    startListener(on: currentPort)
  }

  private func startListener(on port: Network.NWEndpoint.Port) {
    do {
      let listener = try NWListener(using: .tcp, on: port)
      listener.newConnectionHandler = { [weak self] connection in
        self?.handle(connection: connection)
      }
  listener.stateUpdateHandler = { [weak self] (state: NWListener.State) in
        guard let self = self else { return }
        if case .failed = state {
          self.restartListener(on: port)
        }
        if case .cancelled = state {
          self.restartListener(on: port)
        }
      }
      listener.start(queue: queue)
      self.listener = listener
      currentPort = port
    } catch {
      cancelTunnelWithError(error)
    }
  }

  private func restartListener(on port: Network.NWEndpoint.Port) {
    if listener == nil {
      startListener(on: port)
      return
    }
    resetConnections()
    listener?.cancel()
    listener = nil
    startListener(on: port)
  }

  private func handle(connection: NWConnection) {
    let identifier = ObjectIdentifier(connection)
    connections[identifier] = connection
    contexts[identifier] = ConnectionContext()
    connection.stateUpdateHandler = { [weak self, weak connection] state in
      guard let self = self else { return }
      guard let connection = connection else { return }
      if case .failed = state {
        self.cleanup(connection: connection)
      }
      if case .cancelled = state {
        self.cleanup(connection: connection)
      }
    }
    connection.start(queue: queue)
    receive(on: connection)
  }

  private func receive(on connection: NWConnection) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      guard let self = self else { return }
      let identifier = ObjectIdentifier(connection)
      if let data = data, !data.isEmpty {
        let context = self.contexts[identifier] ?? ConnectionContext()
        context.buffer.append(data)
        self.contexts[identifier] = context
        self.processRequests(for: context, connection: connection)
      }
      if let _ = error {
        self.cleanup(connection: connection)
        return
      }
      if isComplete {
        self.cleanup(connection: connection)
        return
      }
      self.receive(on: connection)
    }
  }

  private func processRequests(for context: ConnectionContext, connection: NWConnection) {
    while true {
      switch parseRequest(from: context.buffer) {
      case .needMoreData:
        return
      case .failure:
        sendJSON(connection: connection, status: 400, body: ["error": "bad_request"])
        return
      case .success(let request, let length):
        if length <= context.buffer.count {
          context.buffer.removeSubrange(0..<length)
        } else {
          context.buffer.removeAll()
        }
        handle(request: request, connection: connection)
        return
      }
    }
  }

  private func parseRequest(from data: Data) -> HTTPRequestParseResult {
    let delimiter = Data([13, 10, 13, 10])
    guard let range = data.range(of: delimiter) else {
      return .needMoreData
    }
    let headerData = data.subdata(in: 0..<range.lowerBound)
    guard let headerString = String(data: headerData, encoding: .utf8) else {
      return .failure
    }
    let lines = headerString.split(separator: "\r\n")
    guard let requestLine = lines.first else {
      return .failure
    }
    let parts = requestLine.split(separator: " ")
    if parts.count < 2 {
      return .failure
    }
    let method = String(parts[0]).uppercased()
    let path = String(parts[1])
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      let components = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
      if components.count != 2 {
        continue
      }
      let key = components[0].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let value = components[1].trimmingCharacters(in: .whitespacesAndNewlines)
      headers[key] = value
    }
    let contentLength = headers["content-length"].flatMap(Int.init) ?? 0
    let bodyStart = range.upperBound
    let expected = bodyStart + contentLength
    if data.count < expected {
      return .needMoreData
    }
    let body = data.subdata(in: bodyStart..<expected)
    let request = HTTPRequest(method: method, path: path, headers: headers, body: body)
    return .success(request, expected)
  }

  private func handle(request: HTTPRequest, connection: NWConnection) {
    if request.method == "OPTIONS" {
      sendResponse(connection: connection, status: 204, headers: [
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      ], body: Data())
      return
    }
    let path = request.path.split(separator: "?").first.map(String.init) ?? request.path
    if request.method == "GET" && path == "/" {
      sendResponse(connection: connection, status: 200, headers: [
        "Content-Type": "text/plain; charset=utf-8"
      ], body: Data("Inferra Packet Tunnel".utf8))
      return
    }
    if request.method == "GET" && path == "/status" {
      var payload: [String: Any] = [:]
      payload["running"] = sharedState["running"] as? Bool ?? false
      if let updatedAt = sharedState["updatedAt"] as? String {
        payload["updatedAt"] = updatedAt
      }
      if let identifier = sharedState["identifier"] as? String {
        payload["identifier"] = identifier
      }
      if let metadata = sharedState["metadata"] as? [String: Any] {
        payload["metadata"] = metadata
      }
      if let portNumber = sharedState["port"] as? NSNumber {
        payload["port"] = portNumber
      } else {
        payload["port"] = NSNumber(value: Int(currentPort.rawValue))
      }
      sendJSON(connection: connection, status: 200, body: payload)
      return
    }
    if request.method == "GET" && path == "/webrtc/offer" {
      guard let offer = sharedState["identifier"] as? String, !offer.isEmpty else {
        sendJSON(connection: connection, status: 503, body: ["error": "offer_unavailable"])
        return
      }
      var payload: [String: Any] = [
        "type": "offer",
        "data": offer
      ]
      if let metadata = sharedState["metadata"] as? [String: Any] {
        if let peerId = metadata["offerPeerId"] as? String {
          payload["peerId"] = peerId
        } else if let peerId = metadata["peerId"] as? String {
          payload["peerId"] = peerId
        }
        payload["metadata"] = metadata
      }
      sendJSON(connection: connection, status: 200, body: payload)
      return
    }
    if path == "/webrtc/answer" {
      guard request.method == "POST" else {
        sendJSON(connection: connection, status: 405, body: ["error": "method_not_allowed"])
        return
      }
      guard let json = try? JSONSerialization.jsonObject(with: request.body, options: []) as? [String: Any] else {
        sendJSON(connection: connection, status: 400, body: ["error": "invalid_json"])
        return
      }
      guard let sdp = json["sdp"] as? String, !sdp.isEmpty else {
        sendJSON(connection: connection, status: 400, body: ["error": "missing_sdp"])
        return
      }
      let peerId = json["peerId"] as? String
      if storeAnswer(sdp: sdp, peerId: peerId) {
        sendJSON(connection: connection, status: 200, body: ["status": "queued"])
      } else {
        sendJSON(connection: connection, status: 500, body: ["error": "persist_failed"])
      }
      return
    }
    sendJSON(connection: connection, status: 404, body: ["error": "not_found"])
  }

  private func sendJSON(connection: NWConnection, status: Int, body: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(body), let data = try? JSONSerialization.data(withJSONObject: body, options: []) else {
      sendResponse(connection: connection, status: 500, headers: [
        "Content-Type": "text/plain; charset=utf-8"
      ], body: Data("server_error".utf8))
      return
    }
    sendResponse(connection: connection, status: status, headers: [
      "Content-Type": "application/json; charset=utf-8"
    ], body: data)
  }

  private func sendResponse(connection: NWConnection, status: Int, headers: [String: String], body: Data) {
    var responseHeaders = headers
    responseHeaders["Content-Length"] = "\(body.count)"
    responseHeaders["Connection"] = "close"
    responseHeaders["Access-Control-Allow-Origin"] = "*"
    let statusText = statusText(for: status)
    let headerLines = responseHeaders.map { "\($0.key): \($0.value)" }.joined(separator: "\r\n")
    let responseString = "HTTP/1.1 \(status) \(statusText)\r\n\(headerLines)\r\n\r\n"
    var data = Data(responseString.utf8)
    data.append(body)
    connection.send(content: data, completion: .contentProcessed { [weak self, weak connection] _ in
      guard let self = self, let connection = connection else { return }
      self.cleanup(connection: connection)
    })
  }

  private func statusText(for status: Int) -> String {
    switch status {
    case 200:
      return "OK"
    case 204:
      return "No Content"
    case 400:
      return "Bad Request"
    case 404:
      return "Not Found"
    case 405:
      return "Method Not Allowed"
    case 500:
      return "Internal Server Error"
    case 503:
      return "Service Unavailable"
    default:
      return "OK"
    }
  }

  private func cleanup(connection: NWConnection) {
    let identifier = ObjectIdentifier(connection)
    connection.cancel()
    connections.removeValue(forKey: identifier)
    contexts.removeValue(forKey: identifier)
  }

  private func resetConnections() {
    connections.values.forEach { $0.cancel() }
    connections.removeAll()
    contexts.removeAll()
  }

  private func startStateTimer() {
    if stateTimer != nil {
      return
    }
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + .seconds(3), repeating: .seconds(3))
    timer.setEventHandler { [weak self] in
      self?.refreshSharedState()
    }
    timer.resume()
    stateTimer = timer
  }

  private func stopStateTimer() {
    stateTimer?.cancel()
    stateTimer = nil
  }

  private func refreshSharedState() {
    guard let state = loadSharedState() else {
      return
    }
    guard let fingerprint = try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]) else {
      return
    }
    if let existing = stateFingerprint, existing == fingerprint {
      return
    }
    stateFingerprint = fingerprint
    apply(state: state)
  }

  private func apply(state: [String: Any]) {
    sharedState = state
    let port = effectivePort(from: state)
    if listener == nil {
      startListener(on: port)
      return
    }
    if port != currentPort {
      restartListener(on: port)
    }
  }

  private func effectivePort(from state: [String: Any]) -> Network.NWEndpoint.Port {
    if let number = state["port"] as? NSNumber, let port = Network.NWEndpoint.Port(rawValue: number.uint16Value) {
      return port
    }
  if let port = providerPort() {
      return port
    }
    return currentPort
  }

  private func providerPort() -> Network.NWEndpoint.Port? {
    guard let configuration = protocolConfiguration as? NETunnelProviderProtocol,
          let value = configuration.providerConfiguration?["port"] else {
      return nil
    }
  if let number = value as? NSNumber, let port = Network.NWEndpoint.Port(rawValue: number.uint16Value) {
      return port
    }
    if let string = value as? String, let raw = UInt16(string) {
      return Network.NWEndpoint.Port(rawValue: raw)
    }
    return nil
  }

  private func storeAnswer(sdp: String, peerId: String?) -> Bool {
    var state = loadSharedState() ?? sharedState
    var answer: [String: Any] = [
      "sdp": sdp,
      "receivedAt": isoFormatter.string(from: Date())
    ]
    if let peerId = peerId {
      answer["peerId"] = peerId
    }
    state["pendingAnswer"] = answer
    state["updatedAt"] = isoFormatter.string(from: Date())
    return saveSharedState(state)
  }

  private func loadSharedState() -> [String: Any]? {
    guard let url = sharedStateURL(),
          let data = try? Data(contentsOf: url),
          let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
      return nil
    }
    return json
  }

  private func saveSharedState(_ state: [String: Any]) -> Bool {
    guard let url = sharedStateURL(),
          JSONSerialization.isValidJSONObject(state),
          let data = try? JSONSerialization.data(withJSONObject: state, options: []) else {
      return false
    }
    do {
      try data.write(to: url, options: .atomic)
      sharedState = state
      stateFingerprint = try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys])
      return true
    } catch {
      return false
    }
  }

  private func sharedStateURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?.appendingPathComponent(sharedStateFilename)
  }
}
