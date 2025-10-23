package com.gorai.inferra.notifications

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DownloadNotificationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val appContext: ReactApplicationContext = reactContext
  private val notificationNames = mutableMapOf<String, String>()

  override fun getName(): String = "DownloadNotificationModule"

  @ReactMethod
  fun requestPermissions(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun showDownloadNotification(
    modelName: String,
    downloadId: String,
    progress: Double,
    bytesDownloaded: Double,
    totalBytes: Double,
    promise: Promise,
  ) {
    try {
      notificationNames[downloadId] = modelName
      DownloadNotificationHelper.notifyProgress(
        appContext,
        downloadId,
        modelName,
        progress.toInt().coerceIn(0, 100),
        bytesDownloaded.toLong(),
        totalBytes.toLong(),
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_error", error.message, error)
    }
  }

  @ReactMethod
  fun updateDownloadProgress(
    downloadId: String,
    progress: Double,
    bytesDownloaded: Double,
    totalBytes: Double,
    modelName: String,
    promise: Promise,
  ) {
    try {
      val name = notificationNames[downloadId] ?: modelName
      notificationNames[downloadId] = name
      DownloadNotificationHelper.notifyProgress(
        appContext,
        downloadId,
        name,
        progress.toInt().coerceIn(0, 100),
        bytesDownloaded.toLong(),
        totalBytes.toLong(),
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_error", error.message, error)
    }
  }

  @ReactMethod
  fun cancelNotification(downloadId: String, promise: Promise) {
    try {
      DownloadNotificationHelper.cancelNotification(appContext, downloadId)
      notificationNames.remove(downloadId)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_error", error.message, error)
    }
  }
}
