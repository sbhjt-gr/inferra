/*
  iOS native transfer module using URLSession downloads.
  Uses a default URLSession so completion delegates fire reliably
  while the app is in the foreground. Metadata is persisted in
  UserDefaults for reconnect after reload.
*/

import ExpoModulesCore
import Foundation

private struct TransferMeta: Codable {
  let transferId: String
  let destination: String
  let modelName: String
  let url: String
}

public class TransferModule: Module {
  private static let storeKey = "transfer_module_meta"

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
    return URLSession(configuration: config, delegate: delegate, delegateQueue: OperationQueue.main)
  }()

  private let delegate = SessionDelegate()
  private var meta: [String: TransferMeta] = [:]
  private let metaLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("TransferModule")

    Events(
      "onTransferProgress",
      "onTransferComplete",
      "onTransferError",
      "onTransferCancelled"
    )

    OnCreate {
      self.delegate.module = self
      self.loadMeta()
      self.reconnect()
    }

    AsyncFunction("beginTransfer") {
      (url: String, destination: String, headers: [String: String]?) -> [String: Any] in

      guard let downloadUrl = URL(string: url) else {
        throw NSError(domain: "TransferModule", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "invalid_url"])
      }

      let transferId = UUID().uuidString
      let modelName = Self.extractModelName(destination) ?? transferId

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

      let task = self.session.downloadTask(with: request)
      task.taskDescription = transferId
      task.priority = URLSessionTask.highPriority
      task.resume()

      let entry = TransferMeta(
        transferId: transferId, destination: destination,
        modelName: modelName, url: url
      )
      self.setMeta(transferId, entry)

      return ["transferId": transferId]
    }

    AsyncFunction("cancelTransfer") { (transferId: String) -> Bool in
      self.session.getTasksWithCompletionHandler { _, _, downloadTasks in
        for task in downloadTasks where task.taskDescription == transferId {
          task.cancel()
        }
        self.removeMeta(transferId)
      }
      return true
    }

    AsyncFunction("finalizeTransfer") { (transferId: String) -> [String: Any] in
      return self.finalizeTransferIfReady(transferId)
    }

    AsyncFunction("getOngoingTransfers") { () -> [[String: Any]] in
      return await withCheckedContinuation { continuation in
        self.session.getTasksWithCompletionHandler { _, _, downloadTasks in
          var result: [[String: Any]] = []
          for task in downloadTasks {
            guard let tid = task.taskDescription else { continue }
            if task.state == .completed || task.state == .canceling { continue }

            let stored = self.getMeta(tid)
            let modelName = stored?.modelName ?? Self.extractModelName(stored?.destination) ?? tid
            let bytesWritten = task.countOfBytesReceived
            let totalBytes = task.countOfBytesExpectedToReceive
            let progress = totalBytes > 0
              ? min(Int(Double(bytesWritten) / Double(totalBytes) * 100), 100)
              : 0

            var entry: [String: Any] = [
              "id": tid,
              "destination": stored?.destination ?? "",
              "modelName": modelName,
              "bytesWritten": Double(bytesWritten),
              "totalBytes": Double(max(totalBytes, 0)),
              "progress": progress
            ]
            if let u = stored?.url { entry["url"] = u }
            result.append(entry)
          }
          continuation.resume(returning: result)
        }
      }
    }
  }

  private func emitOnMain(_ name: String, _ body: [String: Any]) {
    let work = { self.sendEvent(name, body) }
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  func emitProgress(_ tid: String, bytesWritten: Int64, totalBytes: Int64) {
    let stored = getMeta(tid)
    let modelName = stored?.modelName ?? tid
    let progress = totalBytes > 0
      ? min(Int(Double(bytesWritten) / Double(totalBytes) * 100), 100)
      : 0

    emitOnMain("onTransferProgress", [
      "downloadId": tid,
      "modelName": modelName,
      "destination": stored?.destination ?? "",
      "url": stored?.url ?? "",
      "bytesWritten": Double(bytesWritten),
      "totalBytes": Double(max(totalBytes, 0)),
      "speed": 0.0,
      "eta": 0.0,
      "progress": progress
    ])
  }

  func emitComplete(_ tid: String, location: URL) {
    let stored = getMeta(tid)
    let modelName = stored?.modelName ?? tid
    let dest = stored?.destination ?? ""

    if !dest.isEmpty {
      let destURL = Self.resolveDestinationURL(dest)
      let dir = destURL.deletingLastPathComponent()
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      try? FileManager.default.removeItem(at: destURL)
      do {
        try FileManager.default.moveItem(at: location, to: destURL)
      } catch {
        // Drop both sides so a failed move never leaves a partial dest
        // or an orphaned session temp behind.
        try? FileManager.default.removeItem(at: destURL)
        try? FileManager.default.removeItem(at: location)
        emitOnMain("onTransferError", [
          "downloadId": tid,
          "modelName": modelName,
          "destination": dest,
          "error": "move_failed: \(error.localizedDescription)"
        ])
        removeMeta(tid)
        return
      }
    }

    emitCompleteAtDestination(tid: tid, stored: stored, modelName: modelName, dest: dest)
  }

  private func emitCompleteAtDestination(
    tid: String,
    stored: TransferMeta?,
    modelName: String,
    dest: String
  ) {
    let finalPath = dest.isEmpty ? dest : Self.resolveDestinationURL(dest).path
    let size = (try? FileManager.default.attributesOfItem(atPath: finalPath))?[.size] as? Int64 ?? 0

    emitOnMain("onTransferComplete", [
      "downloadId": tid,
      "modelName": modelName,
      "destination": dest,
      "url": stored?.url ?? "",
      "bytesWritten": Double(size),
      "totalBytes": Double(size)
    ])
    removeMeta(tid)
  }

  private func finalizeTransferIfReady(_ transferId: String) -> [String: Any] {
    guard let stored = getMeta(transferId) else {
      return ["finalized": false]
    }

    let dest = stored.destination
    guard !dest.isEmpty else {
      return ["finalized": false]
    }

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

    emitCompleteAtDestination(
      tid: transferId,
      stored: stored,
      modelName: stored.modelName,
      dest: dest
    )
    return ["finalized": true, "size": Double(size)]
  }

  func emitError(_ tid: String, error: Error) {
    let stored = getMeta(tid)
    let modelName = stored?.modelName ?? tid
    let dest = stored?.destination ?? ""
    let nsErr = error as NSError
    let cancelled = nsErr.code == NSURLErrorCancelled

    // Remove any partial at the destination. URLSession keeps its own
    // temp until the delegate returns; our dest can still hold a prior
    // move, a failed finalize, or an error-body download.
    deleteDestinationIfPresent(dest)

    if cancelled {
      emitOnMain("onTransferCancelled", [
        "downloadId": tid,
        "modelName": modelName,
        "destination": dest,
        "url": stored?.url ?? "",
        "bytesWritten": 0.0,
        "totalBytes": 0.0
      ])
    } else {
      let underlying = (nsErr.userInfo[NSUnderlyingErrorKey] as? NSError) ?? nsErr
      let isEnospc = underlying.domain == NSPOSIXErrorDomain && underlying.code == Int(ENOSPC)
      let errorMsg = isEnospc ? "enospc" : error.localizedDescription
      emitOnMain("onTransferError", [
        "downloadId": tid,
        "modelName": modelName,
        "destination": dest,
        "url": stored?.url ?? "",
        "error": errorMsg,
        "bytesWritten": 0.0,
        "totalBytes": 0.0
      ])
    }
    removeMeta(tid)
  }

  private func deleteDestinationIfPresent(_ dest: String) {
    guard !dest.isEmpty else { return }
    let destURL = Self.resolveDestinationURL(dest)
    var isDir: ObjCBool = false
    guard FileManager.default.fileExists(atPath: destURL.path, isDirectory: &isDir),
          !isDir.boolValue else { return }
    try? FileManager.default.removeItem(at: destURL)
  }

  private func reconnect() {
    session.getTasksWithCompletionHandler { [weak self] _, _, downloadTasks in
      guard let self else { return }
      for task in downloadTasks {
        guard let tid = task.taskDescription else { continue }
        if self.getMeta(tid) == nil {
          if task.state == .running || task.state == .suspended {
            task.cancel()
          }
          continue
        }
        if task.state == .suspended {
          task.resume()
        }
      }
    }
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
    return clean.split(separator: "/").last.map(String.init)
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

private class SessionDelegate: NSObject, URLSessionDownloadDelegate {
  weak var module: TransferModule?

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                  didWriteData bytesWritten: Int64,
                  totalBytesWritten: Int64,
                  totalBytesExpectedToWrite: Int64) {
    guard let tid = downloadTask.taskDescription else { return }
    module?.emitProgress(tid, bytesWritten: totalBytesWritten, totalBytes: totalBytesExpectedToWrite)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                  didFinishDownloadingTo location: URL) {
    guard let tid = downloadTask.taskDescription else { return }
    module?.emitComplete(tid, location: location)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  didCompleteWithError error: Error?) {
    guard let tid = task.taskDescription, let error else { return }
    module?.emitError(tid, error: error)
  }

  func urlSession(_ session: URLSession,
                  didBecomeInvalidWithError error: Error?) {
  }
}
