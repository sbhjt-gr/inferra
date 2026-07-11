import ExpoModulesCore
import Foundation

private struct TransferMeta: Codable {
  let transferId: String
  let destination: String
  let modelName: String
  let url: String
  var state: String
  var expectedTotal: Int64

  enum CodingKeys: String, CodingKey {
    case transferId, destination, modelName, url, state, expectedTotal
  }

  init(
    transferId: String,
    destination: String,
    modelName: String,
    url: String,
    state: String,
    expectedTotal: Int64,
    headers: [String: String]? = nil
  ) {
    self.transferId = transferId
    self.destination = destination
    self.modelName = modelName
    self.url = url
    self.state = state
    self.expectedTotal = expectedTotal
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    transferId = try container.decode(String.self, forKey: .transferId)
    destination = try container.decode(String.self, forKey: .destination)
    modelName = try container.decode(String.self, forKey: .modelName)
    url = try container.decode(String.self, forKey: .url)
    state = try container.decodeIfPresent(String.self, forKey: .state) ?? "downloading"
    expectedTotal = try container.decodeIfPresent(Int64.self, forKey: .expectedTotal) ?? 0
  }
}

private enum TransferRunState {
  case downloading
  case paused
  case cancelling
}

private final class ActiveTransfer {
  let meta: TransferMeta
  var task: URLSessionDataTask?
  var handle: FileHandle?
  var bytesWritten: Int64
  var expectedTotal: Int64
  var runState: TransferRunState
  var responseHandled = false

  init(meta: TransferMeta, bytesWritten: Int64, expectedTotal: Int64) {
    self.meta = meta
    self.bytesWritten = bytesWritten
    self.expectedTotal = expectedTotal
    self.runState = .downloading
  }
}

public class TransferModule: Module {
  private static let storeKey = "transfer_module_meta"
  private static let partialSuffix = ".partial"

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 3600
    config.timeoutIntervalForResource = 86400
    config.allowsCellularAccess = true
    config.waitsForConnectivity = true
    if #available(iOS 13.0, *) {
      config.allowsExpensiveNetworkAccess = true
      config.allowsConstrainedNetworkAccess = true
    }
    return URLSession(configuration: config, delegate: delegate, delegateQueue: OperationQueue())
  }()

  private let delegate = StreamDelegate()
  private var meta: [String: TransferMeta] = [:]
  private var active: [String: ActiveTransfer] = [:]
  private let metaLock = NSLock()
  private let activeLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("TransferModule")

    Events(
      "onTransferProgress",
      "onTransferComplete",
      "onTransferError",
      "onTransferCancelled",
      "onTransferPaused"
    )

    OnCreate {
      self.delegate.module = self
      self.loadMeta()
    }

    AsyncFunction("beginTransfer") {
      (url: String, destination: String, headers: [String: String]?) -> [String: Any] in

      guard URL(string: url) != nil else {
        throw NSError(domain: "TransferModule", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "invalid_url"])
      }

      let transferId = UUID().uuidString
      let modelName = Self.extractModelName(destination) ?? transferId
      NSLog("begin_transfer %@", transferId)

      let entry = TransferMeta(
        transferId: transferId,
        destination: destination,
        modelName: modelName,
        url: url,
        state: "downloading",
        expectedTotal: 0
      )
      self.setMeta(transferId, entry)
      self.startStream(transferId: transferId, url: url, destination: destination,
                       headers: headers, modelName: modelName)

      return ["transferId": transferId]
    }

    AsyncFunction("pauseTransfer") { (transferId: String) -> Bool in
      NSLog("pause_transfer %@", transferId)
      self.activeLock.lock()
      guard let transfer = self.active[transferId] else {
        self.activeLock.unlock()
        if var stored = self.getMeta(transferId) {
          stored.state = "paused"
          self.setMeta(transferId, stored)
          let bytes = self.partialBytes(stored.destination)
          self.emitPaused(transferId, bytesWritten: bytes, totalBytes: stored.expectedTotal)
        }
        return true
      }
      transfer.runState = .paused
      let bytes = transfer.bytesWritten
      let total = transfer.expectedTotal
      let dest = transfer.meta.destination
      let modelName = transfer.meta.modelName
      let url = transfer.meta.url
      if var stored = self.getMeta(transferId) {
        stored.state = "paused"
        stored.expectedTotal = total
        self.setMeta(transferId, stored)
      }
      let task = transfer.task
      self.closeHandle(transfer)
      self.active.removeValue(forKey: transferId)
      self.activeLock.unlock()
      task?.cancel()
      self.emitPaused(transferId, bytesWritten: bytes, totalBytes: total)
      NSLog("pause_persisted %@", transferId)
      return true
    }

    AsyncFunction("resumeTransfer") {
      (transferId: String, headers: [String: String]?) -> Bool in
      guard let stored = self.getMeta(transferId) else {
        throw NSError(domain: "TransferModule", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "transfer_not_found"])
      }
      NSLog("resume_transfer %@", transferId)
      var updated = stored
      updated.state = "downloading"
      self.setMeta(transferId, updated)
      self.startStream(
        transferId: transferId,
        url: stored.url,
        destination: stored.destination,
        headers: headers,
        modelName: stored.modelName
      )
      return true
    }

    AsyncFunction("cancelTransfer") { (transferId: String) -> Bool in
      NSLog("cancel_transfer %@", transferId)
      self.activeLock.lock()
      let transfer = self.active[transferId]
      transfer?.runState = .cancelling
      let task = transfer?.task
      let dest = transfer?.meta.destination ?? self.getMeta(transferId)?.destination
      self.activeLock.unlock()
      task?.cancel()
      if let dest {
        self.deletePartials(dest)
      }
      self.removeActive(transferId)
      self.removeMeta(transferId)
      return true
    }

    AsyncFunction("finalizeTransfer") { (transferId: String) -> [String: Any] in
      return self.finalizeTransferIfReady(transferId)
    }

    AsyncFunction("getOngoingTransfers") { () -> [[String: Any]] in
      var result: [[String: Any]] = []

      self.activeLock.lock()
      let activeSnapshot = self.active
      self.activeLock.unlock()

      for (tid, transfer) in activeSnapshot {
        let progress = transfer.expectedTotal > 0
          ? min(Int(Double(transfer.bytesWritten) / Double(transfer.expectedTotal) * 100), 100)
          : 0
        var entry: [String: Any] = [
          "id": tid,
          "destination": transfer.meta.destination,
          "modelName": transfer.meta.modelName,
          "bytesWritten": Double(transfer.bytesWritten),
          "totalBytes": Double(max(transfer.expectedTotal, 0)),
          "progress": progress,
          "state": "downloading",
          "url": transfer.meta.url
        ]
        result.append(entry)
      }

      self.metaLock.lock()
      let metaSnapshot = self.meta
      self.metaLock.unlock()

      for (tid, stored) in metaSnapshot {
        if activeSnapshot[tid] != nil { continue }
        let bytes = self.partialBytes(stored.destination)
        let hasPartial = bytes > 0
        let isPaused = stored.state == "paused" || (stored.state == "downloading" && hasPartial)
        if !isPaused {
          continue
        }
        if stored.state != "paused" {
          var updated = stored
          updated.state = "paused"
          self.setMeta(tid, updated)
          NSLog("orphan_marked_paused %@", tid)
        }
        let total = max(stored.expectedTotal, bytes)
        let progress = total > 0 ? min(Int(Double(bytes) / Double(total) * 100), 100) : 0
        var entry: [String: Any] = [
          "id": tid,
          "destination": stored.destination,
          "modelName": stored.modelName,
          "bytesWritten": Double(bytes),
          "totalBytes": Double(max(total, 0)),
          "progress": progress,
          "state": "paused",
          "url": stored.url
        ]
        result.append(entry)
      }

      return result
    }
  }

  private func startStream(
    transferId: String,
    url: String,
    destination: String,
    headers: [String: String]?,
    modelName: String
  ) {
    guard let downloadUrl = URL(string: url) else { return }

    let partialURL = Self.partialURL(destination)
    let dir = partialURL.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    if !FileManager.default.fileExists(atPath: partialURL.path) {
      FileManager.default.createFile(atPath: partialURL.path, contents: nil)
    }

    let existing = (try? FileManager.default.attributesOfItem(atPath: partialURL.path)[.size] as? Int64) ?? 0
    NSLog("partial_size %lld", existing)

    var request = URLRequest(url: downloadUrl)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    if #available(iOS 12.0, *) {
      request.networkServiceType = .responsiveData
    }
    if #available(iOS 13.0, *) {
      request.allowsExpensiveNetworkAccess = true
      request.allowsConstrainedNetworkAccess = true
    }
    headers?.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    if existing > 0 {
      request.setValue("bytes=\(existing)-", forHTTPHeaderField: "Range")
      NSLog("range_request %lld", existing)
    }

    let stored = getMeta(transferId) ?? TransferMeta(
      transferId: transferId, destination: destination, modelName: modelName,
      url: url, state: "downloading", expectedTotal: 0
    )

    let activeTransfer = ActiveTransfer(
      meta: stored, bytesWritten: existing, expectedTotal: stored.expectedTotal
    )

    do {
      activeTransfer.handle = try FileHandle(forWritingTo: partialURL)
      if existing > 0 {
        if #available(iOS 13.4, *) {
          try activeTransfer.handle?.seekToEnd()
        } else {
          activeTransfer.handle?.seekToEndOfFile()
        }
      }
    } catch {
      NSLog("handle_open_failed %@", error.localizedDescription)
      emitError(transferId, error: error, keepPartial: true)
      return
    }

    let task = session.dataTask(with: request)
    task.taskDescription = transferId
    task.priority = URLSessionTask.highPriority
    activeTransfer.task = task

    activeLock.lock()
    active[transferId] = activeTransfer
    activeLock.unlock()

    var metaUpdate = stored
    metaUpdate.state = "downloading"
    setMeta(transferId, metaUpdate)

    task.resume()
  }

  func handleResponse(_ task: URLSessionDataTask, response: URLResponse) {
    guard let tid = task.taskDescription else { return }
    activeLock.lock()
    guard let transfer = active[tid] else {
      activeLock.unlock()
      return
    }
    transfer.responseHandled = true
    activeLock.unlock()

    guard let http = response as? HTTPURLResponse else { return }
    let code = http.statusCode
    NSLog("http_status %d", code)

    if code != 200 && code != 206 {
      let err = NSError(domain: "TransferModule", code: code,
                        userInfo: [NSLocalizedDescriptionKey: "HTTP error: \(code)"])
      let keep = code == 401 || code == 403 || code == 404 ? true : true
      finishWithError(tid, error: err, keepPartial: keep)
      task.cancel()
      return
    }

    activeLock.lock()
    guard let transfer2 = active[tid] else {
      activeLock.unlock()
      return
    }

    if code == 200 && transfer2.bytesWritten > 0 {
      NSLog("range_ignored_restart")
      closeHandle(transfer2)
      deletePartials(transfer2.meta.destination)
      let partialURL = Self.partialURL(transfer2.meta.destination)
      FileManager.default.createFile(atPath: partialURL.path, contents: nil)
      do {
        transfer2.handle = try FileHandle(forWritingTo: partialURL)
      } catch {
        activeLock.unlock()
        finishWithError(tid, error: error, keepPartial: false)
        return
      }
      transfer2.bytesWritten = 0
    }

    let contentLength = http.expectedContentLength
    if code == 206 {
      if let range = http.value(forHTTPHeaderField: "Content-Range"),
         let total = parseTotal(from: range) {
        transfer2.expectedTotal = total
      } else if contentLength > 0 {
        transfer2.expectedTotal = transfer2.bytesWritten + contentLength
      }
    } else if contentLength > 0 {
      transfer2.expectedTotal = contentLength
    }
    let expected = transfer2.expectedTotal
    let dest = transfer2.meta.destination
    let modelName = transfer2.meta.modelName
    let url = transfer2.meta.url
    activeLock.unlock()

    if var stored = getMeta(tid) {
      stored.expectedTotal = expected
      setMeta(tid, stored)
    }

    emitProgress(tid, bytesWritten: (active[tid]?.bytesWritten ?? 0), totalBytes: expected,
                 modelName: modelName, destination: dest, url: url)
  }

  func handleData(_ task: URLSessionDataTask, data: Data) {
    guard let tid = task.taskDescription else { return }
    activeLock.lock()
    guard let transfer = active[tid], transfer.runState == .downloading else {
      activeLock.unlock()
      return
    }
    do {
      if #available(iOS 13.4, *) {
        try transfer.handle?.write(contentsOf: data)
      } else {
        transfer.handle?.write(data)
      }
      transfer.bytesWritten += Int64(data.count)
      let bytes = transfer.bytesWritten
      let total = transfer.expectedTotal
      let modelName = transfer.meta.modelName
      let dest = transfer.meta.destination
      let url = transfer.meta.url
      activeLock.unlock()
      emitProgress(tid, bytesWritten: bytes, totalBytes: total,
                   modelName: modelName, destination: dest, url: url)
    } catch {
      activeLock.unlock()
      finishWithError(tid, error: error, keepPartial: true)
      task.cancel()
    }
  }

  func handleComplete(_ task: URLSessionTask, error: Error?) {
    guard let tid = task.taskDescription else { return }

    activeLock.lock()
    guard let transfer = active[tid] else {
      activeLock.unlock()
      NSLog("complete_skip_inactive %@", tid)
      return
    }
    let runState = transfer.runState
    let bytes = transfer.bytesWritten
    let total = transfer.expectedTotal
    let dest = transfer.meta.destination
    let modelName = transfer.meta.modelName
    let url = transfer.meta.url
    closeHandle(transfer)
    activeLock.unlock()

    if runState == .cancelling {
      NSLog("transfer_cancelled %@", tid)
      deletePartials(dest)
      removeActive(tid)
      removeMeta(tid)
      emitOnMain("onTransferCancelled", [
        "downloadId": tid,
        "modelName": modelName,
        "destination": dest,
        "url": url,
        "bytesWritten": Double(bytes),
        "totalBytes": Double(total)
      ])
      return
    }

    if runState == .paused || (error as NSError?)?.code == NSURLErrorCancelled {
      NSLog("transfer_paused %@", tid)
      if var stored = getMeta(tid) {
        stored.state = "paused"
        stored.expectedTotal = total
        setMeta(tid, stored)
      }
      removeActive(tid)
      emitPaused(tid, bytesWritten: bytes, totalBytes: total)
      return
    }

    if let error {
      let nsErr = error as NSError
      if nsErr.code == NSURLErrorCancelled {
        if var stored = getMeta(tid) {
          stored.state = "paused"
          setMeta(tid, stored)
        }
        removeActive(tid)
        emitPaused(tid, bytesWritten: bytes, totalBytes: total)
        return
      }
      finishWithError(tid, error: error, keepPartial: true)
      return
    }

    if total > 0 && bytes != total {
      NSLog("size_mismatch %lld %lld", bytes, total)
      if bytes < total {
        finishWithError(
          tid,
          error: NSError(domain: "TransferModule", code: 3,
                         userInfo: [NSLocalizedDescriptionKey: "incomplete_download"]),
          keepPartial: true
        )
        return
      }
    }

    do {
      try promotePartial(dest)
      NSLog("transfer_done %@", tid)
      removeActive(tid)
      emitOnMain("onTransferComplete", [
        "downloadId": tid,
        "modelName": modelName,
        "destination": Self.finalPath(dest),
        "url": url,
        "bytesWritten": Double(bytes),
        "totalBytes": Double(max(total, bytes))
      ])
      removeMeta(tid)
    } catch {
      finishWithError(tid, error: error, keepPartial: true)
    }
  }

  private func finishWithError(_ tid: String, error: Error, keepPartial: Bool) {
    emitError(tid, error: error, keepPartial: keepPartial)
  }

  private func emitError(_ tid: String, error: Error, keepPartial: Bool) {
    let stored = getMeta(tid)
    let modelName = stored?.modelName ?? tid
    let dest = stored?.destination ?? ""
    let nsErr = error as NSError
    let underlying = (nsErr.userInfo[NSUnderlyingErrorKey] as? NSError) ?? nsErr
    let isEnospc = underlying.domain == NSPOSIXErrorDomain && underlying.code == Int(ENOSPC)
    let errorMsg = isEnospc ? "enospc" : error.localizedDescription

    if !keepPartial {
      deletePartials(dest)
      removeMeta(tid)
    }

    let bytes = partialBytes(dest)
    removeActive(tid)

    emitOnMain("onTransferError", [
      "downloadId": tid,
      "modelName": modelName,
      "destination": dest,
      "url": stored?.url ?? "",
      "error": errorMsg,
      "bytesWritten": Double(bytes),
      "totalBytes": Double(stored?.expectedTotal ?? 0)
    ])
  }

  private func emitPaused(_ tid: String, bytesWritten: Int64, totalBytes: Int64) {
    let stored = getMeta(tid)
    emitOnMain("onTransferPaused", [
      "downloadId": tid,
      "modelName": stored?.modelName ?? tid,
      "destination": stored?.destination ?? "",
      "url": stored?.url ?? "",
      "bytesWritten": Double(bytesWritten),
      "totalBytes": Double(max(totalBytes, 0)),
      "state": "paused"
    ])
  }

  private func emitProgress(
    _ tid: String, bytesWritten: Int64, totalBytes: Int64,
    modelName: String, destination: String, url: String
  ) {
    let progress = totalBytes > 0
      ? min(Int(Double(bytesWritten) / Double(totalBytes) * 100), 100)
      : 0
    emitOnMain("onTransferProgress", [
      "downloadId": tid,
      "modelName": modelName,
      "destination": destination,
      "url": url,
      "bytesWritten": Double(bytesWritten),
      "totalBytes": Double(max(totalBytes, 0)),
      "speed": 0.0,
      "eta": 0.0,
      "progress": progress,
      "state": "downloading"
    ])
  }

  private func emitOnMain(_ name: String, _ body: [String: Any]) {
    let work = { self.sendEvent(name, body) }
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func closeHandle(_ transfer: ActiveTransfer) {
    do {
      if #available(iOS 13.0, *) {
        try transfer.handle?.close()
      } else {
        transfer.handle?.closeFile()
      }
    } catch {
      NSLog("handle_close_failed")
    }
    transfer.handle = nil
  }

  private func removeActive(_ tid: String) {
    activeLock.lock()
    if let transfer = active.removeValue(forKey: tid) {
      closeHandle(transfer)
    }
    activeLock.unlock()
  }

  private func promotePartial(_ destination: String) throws {
    let partial = Self.partialURL(destination)
    let finalURL = Self.resolveDestinationURL(Self.finalPath(destination))
    try? FileManager.default.removeItem(at: finalURL)
    try FileManager.default.moveItem(at: partial, to: finalURL)
    NSLog("partial_promoted")
  }

  private func deletePartials(_ destination: String) {
    let partial = Self.partialURL(destination)
    let finalURL = Self.resolveDestinationURL(Self.finalPath(destination))
    try? FileManager.default.removeItem(at: partial)
    try? FileManager.default.removeItem(at: finalURL)
    NSLog("partials_purged")
  }

  private func partialBytes(_ destination: String) -> Int64 {
    let path = Self.partialURL(destination).path
    return (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int64) ?? 0
  }

  private func parseTotal(from contentRange: String) -> Int64? {
    guard let slash = contentRange.lastIndex(of: "/") else { return nil }
    let totalStr = contentRange[contentRange.index(after: slash)...]
    return Int64(totalStr)
  }

  private func finalizeTransferIfReady(_ transferId: String) -> [String: Any] {
    guard let stored = getMeta(transferId) else {
      return ["finalized": false]
    }
    let dest = Self.finalPath(stored.destination)
    let destURL = Self.resolveDestinationURL(dest)
    var isDir: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: destURL.path, isDirectory: &isDir)
    guard exists && !isDir.boolValue else {
      return ["finalized": false]
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: destURL.path)[.size] as? Int64) ?? 0
    guard size > 0 else {
      return ["finalized": false]
    }
    emitOnMain("onTransferComplete", [
      "downloadId": transferId,
      "modelName": stored.modelName,
      "destination": dest,
      "url": stored.url,
      "bytesWritten": Double(size),
      "totalBytes": Double(size)
    ])
    removeMeta(transferId)
    return ["finalized": true, "size": Double(size)]
  }

  private func loadMeta() {
    metaLock.lock()
    defer { metaLock.unlock() }
    guard let data = UserDefaults.standard.data(forKey: Self.storeKey),
          let decoded = try? JSONDecoder().decode([String: TransferMeta].self, from: data)
    else { return }
    meta = decoded
  }

  private func saveMeta(_ snapshot: [String: TransferMeta]) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    UserDefaults.standard.set(data, forKey: Self.storeKey)
  }

  private func getMeta(_ tid: String) -> TransferMeta? {
    metaLock.lock()
    defer { metaLock.unlock() }
    return meta[tid]
  }

  private func setMeta(_ tid: String, _ entry: TransferMeta) {
    metaLock.lock()
    meta[tid] = entry
    let snapshot = meta
    metaLock.unlock()
    saveMeta(snapshot)
  }

  private func removeMeta(_ tid: String) {
    metaLock.lock()
    meta.removeValue(forKey: tid)
    let snapshot = meta
    metaLock.unlock()
    saveMeta(snapshot)
  }

  static func extractModelName(_ path: String?) -> String? {
    guard let p = path, !p.isEmpty else { return nil }
    let clean = p.hasPrefix("file://") ? String(p.dropFirst(7)) : p
    let name = clean.split(separator: "/").last.map(String.init)
    return name?.replacingOccurrences(of: partialSuffix, with: "")
  }

  static func finalPath(_ raw: String) -> String {
    let clean = raw.hasPrefix("file://") ? String(raw.dropFirst(7)) : raw
    if clean.hasSuffix(partialSuffix) {
      return String(clean.dropLast(partialSuffix.count))
    }
    return clean
  }

  static func partialURL(_ destination: String) -> URL {
    let final = resolveDestinationURL(finalPath(destination))
    return URL(fileURLWithPath: final.path + partialSuffix)
  }

  private static func resolveDestinationURL(_ raw: String) -> URL {
    if let parsed = URL(string: raw), parsed.isFileURL {
      return parsed
    }
    if raw.hasPrefix("file://") {
      return URL(fileURLWithPath: String(raw.dropFirst(7)))
    }
    return URL(fileURLWithPath: raw)
  }
}

private class StreamDelegate: NSObject, URLSessionDataDelegate {
  weak var module: TransferModule?

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                  didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    module?.handleResponse(dataTask, response: response)
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    module?.handleData(dataTask, data: data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    module?.handleComplete(task, error: error)
  }
}
