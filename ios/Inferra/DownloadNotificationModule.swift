import Foundation
import UserNotifications
import React

@objc(DownloadNotificationModule)
class DownloadNotificationModule: NSObject, RCTBridgeModule {
  private let center = UNUserNotificationCenter.current()
  private var lastProgressByDownload: [String: Double] = [:]
  private var titleByDownload: [String: String] = [:]

  static func moduleName() -> String! {
    return "DownloadNotificationModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(requestPermissions:rejecter:)
  func requestPermissions(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
      if let error = error {
        DispatchQueue.main.async {
          reject("notification_error", error.localizedDescription, error)
        }
      } else {
        DispatchQueue.main.async {
          resolve(granted)
        }
      }
    }
  }

  private func formattedBytes(_ bytes: Double) -> String {
    guard bytes > 0 else { return "0 B" }
    let units = ["B", "KB", "MB", "GB", "TB"]
    let exponent = min(Int(log(bytes) / log(1024)), units.count - 1)
    let value = bytes / pow(1024, Double(exponent))
    return String(format: "%.2f %@", value, units[exponent])
  }

  private func buildContent(title: String,
                            body: String,
                            progress: Double?) -> UNMutableNotificationContent {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    if let progress = progress {
      content.subtitle = progress >= 100 ? "Download completed" : "Download in progress"
      content.userInfo = ["progress": progress]
    }

    return content
  }

  private func deliverNotification(identifier: String,
                                    content: UNMutableNotificationContent) throws {
    center.removePendingNotificationRequests(withIdentifiers: [identifier])
    center.removeDeliveredNotifications(withIdentifiers: [identifier])

    let request = UNNotificationRequest(identifier: identifier,
                                        content: content,
                                        trigger: nil)
    center.add(request)
  }

  @objc(showDownloadNotification:downloadId:progress:bytesDownloaded:totalBytes:resolver:rejecter:)
  func showDownloadNotification(_ modelName: String,
                                downloadId: String,
                                progress: NSNumber,
                                bytesDownloaded: NSNumber,
                                totalBytes: NSNumber,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
    let clampedProgress = max(0.0, min(100.0, progress.doubleValue))
    titleByDownload[downloadId] = modelName
    lastProgressByDownload[downloadId] = clampedProgress

    let body: String
    if totalBytes.doubleValue > 0 {
      body = "\(Int(clampedProgress))% • \(formattedBytes(bytesDownloaded.doubleValue)) / \(formattedBytes(totalBytes.doubleValue))"
    } else {
      body = "Download started"
    }

    let content = buildContent(title: modelName, body: body, progress: clampedProgress)

    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
        DispatchQueue.main.async {
          resolve(false)
        }
        return
      }

      do {
        try self.deliverNotification(identifier: downloadId, content: content)
        DispatchQueue.main.async {
          resolve(true)
        }
      } catch {
        DispatchQueue.main.async {
          reject("notification_error", error.localizedDescription, error)
        }
      }
    }
  }

  @objc(updateDownloadProgress:progress:bytesDownloaded:totalBytes:modelName:resolver:rejecter:)
  func updateDownloadProgress(_ downloadId: String,
                              progress: NSNumber,
                              bytesDownloaded: NSNumber,
                              totalBytes: NSNumber,
                              modelName: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    let clampedProgress = max(0.0, min(100.0, progress.doubleValue))
    let lastProgress = lastProgressByDownload[downloadId] ?? -1
    if (clampedProgress < lastProgress + 5.0 && clampedProgress < 100.0) {
      resolve(false)
      return
    }

    lastProgressByDownload[downloadId] = clampedProgress
    titleByDownload[downloadId] = modelName

    let body: String
    if totalBytes.doubleValue > 0 {
      body = "\(Int(clampedProgress))% • \(formattedBytes(bytesDownloaded.doubleValue)) / \(formattedBytes(totalBytes.doubleValue))"
    } else {
      body = "\(Int(clampedProgress))% complete"
    }

    let content = buildContent(title: modelName, body: body, progress: clampedProgress)

    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
        DispatchQueue.main.async {
          resolve(false)
        }
        return
      }

      do {
        try self.deliverNotification(identifier: downloadId, content: content)
        DispatchQueue.main.async {
          resolve(true)
        }
      } catch {
        DispatchQueue.main.async {
          reject("notification_error", error.localizedDescription, error)
        }
      }
    }
  }

  @objc(cancelNotification:resolver:rejecter:)
  func cancelNotification(_ downloadId: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    lastProgressByDownload.removeValue(forKey: downloadId)
    titleByDownload.removeValue(forKey: downloadId)
    center.removeDeliveredNotifications(withIdentifiers: [downloadId])
    center.removePendingNotificationRequests(withIdentifiers: [downloadId])
    DispatchQueue.main.async {
      resolve(true)
    }
  }
}
