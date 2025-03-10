package com.gorai.ragionare

import android.app.DownloadManager
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class ModelDownloaderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "ModelDownloaderModule"
    }

    private val downloadManager: DownloadManager by lazy {
        reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    private val activeDownloads = ConcurrentHashMap<Long, DownloadInfo>()
    private val pausedDownloads = ConcurrentHashMap<Long, DownloadInfo>()

    data class DownloadInfo(
        val modelName: String,
        val downloadId: String,
        val destination: String,
        var url: String = "",
        var bytesDownloaded: Long = 0,
        var totalBytes: Long = 0,
        var progress: Int = 0
    )

    override fun getName(): String = NAME

    @ReactMethod
    fun downloadModel(url: String, modelName: String, promise: Promise) {
        try {
            // Create destination file
            val destinationFile = File(reactApplicationContext.filesDir, modelName)
            if (destinationFile.exists()) {
                promise.reject("FILE_EXISTS", "Model file already exists")
                return
            }

            // Create download request
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("Downloading $modelName")
                .setDescription("Downloading model file")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(reactApplicationContext, null, "temp_$modelName")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            // Start download
            val downloadId = downloadManager.enqueue(request)
            val downloadInfo = DownloadInfo(
                modelName = modelName,
                downloadId = downloadId.toString(),
                destination = destinationFile.absolutePath,
                url = url
            )
            activeDownloads[downloadId] = downloadInfo

            // Start progress monitoring
            startProgressMonitoring(downloadId)

            // Return download ID to React Native
            val result = Arguments.createMap().apply {
                putString("downloadId", downloadId.toString())
            }
            promise.resolve(result)

        } catch (e: Exception) {
            e.printStackTrace()
            promise.reject("DOWNLOAD_ERROR", "Failed to start download: ${e.message}")
        }
    }

    @ReactMethod
    fun pauseDownload(downloadId: String, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val downloadInfo = activeDownloads[id] ?: throw Exception("Download not found")
            
            // Remove the current download
            downloadManager.remove(id)
            
            // Save download info to paused downloads
            downloadInfo.bytesDownloaded = getDownloadedBytes(id)
            downloadInfo.totalBytes = getTotalBytes(id)
            downloadInfo.progress = calculateProgress(downloadInfo.bytesDownloaded, downloadInfo.totalBytes)
            
            pausedDownloads[id] = downloadInfo
            activeDownloads.remove(id)
            
            // Emit paused status
            val params = Arguments.createMap().apply {
                putString("modelName", downloadInfo.modelName)
                putString("downloadId", downloadId)
                putInt("progress", downloadInfo.progress)
                putBoolean("isCompleted", false)
                putDouble("bytesDownloaded", downloadInfo.bytesDownloaded.toDouble())
                putDouble("totalBytes", downloadInfo.totalBytes.toDouble())
                putBoolean("isPaused", true)
            }
            sendEvent("downloadProgress", params)
            
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PAUSE_ERROR", "Failed to pause download: ${e.message}")
        }
    }

    @ReactMethod
    fun resumeDownload(downloadId: String, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val downloadInfo = pausedDownloads[id] ?: throw Exception("Paused download not found")
            
            // Create new download request with range
            val request = DownloadManager.Request(Uri.parse(downloadInfo.url))
                .setTitle("Downloading ${downloadInfo.modelName}")
                .setDescription("Downloading model file")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(reactApplicationContext, null, "temp_${downloadInfo.modelName}")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .addRequestHeader("Range", "bytes=${downloadInfo.bytesDownloaded}-")

            // Start new download
            val newDownloadId = downloadManager.enqueue(request)
            val newDownloadInfo = downloadInfo.copy(downloadId = newDownloadId.toString())
            
            activeDownloads[newDownloadId] = newDownloadInfo
            pausedDownloads.remove(id)
            
            // Start progress monitoring
            startProgressMonitoring(newDownloadId)
            
            // Emit resumed status
            val params = Arguments.createMap().apply {
                putString("modelName", downloadInfo.modelName)
                putString("downloadId", newDownloadId.toString())
                putInt("progress", downloadInfo.progress)
                putBoolean("isCompleted", false)
                putDouble("bytesDownloaded", downloadInfo.bytesDownloaded.toDouble())
                putDouble("totalBytes", downloadInfo.totalBytes.toDouble())
                putBoolean("isPaused", false)
            }
            sendEvent("downloadProgress", params)
            
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("RESUME_ERROR", "Failed to resume download: ${e.message}")
        }
    }

    @ReactMethod
    fun cancelDownload(downloadId: String, promise: Promise) {
        try {
            val id = downloadId.toLong()
            downloadManager.remove(id)
            activeDownloads.remove(id)
            pausedDownloads.remove(id)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", "Failed to cancel download: ${e.message}")
        }
    }

    private fun startProgressMonitoring(downloadId: Long) {
        Thread {
            var downloading = true
            while (downloading) {
                val query = DownloadManager.Query().setFilterById(downloadId)
                val cursor = downloadManager.query(query)

                if (cursor.moveToFirst()) {
                    val downloadInfo = activeDownloads[downloadId] ?: continue

                    when (cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            val bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                            val finalTotal = if (bytesTotal < 0) 0L else bytesTotal
                            
                            // Move file from external to internal storage
                            val tempFile = File(reactApplicationContext.getExternalFilesDir(null), "temp_${downloadInfo.modelName}")
                            val finalFile = File(downloadInfo.destination)
                            
                            if (tempFile.exists()) {
                                tempFile.copyTo(finalFile, overwrite = true)
                                tempFile.delete()
                                println("ModelDownloader: Successfully moved file to internal storage: ${finalFile.absolutePath}")
                            }
                            
                            emitDownloadProgress(downloadInfo.modelName, downloadInfo.downloadId, 100, true, finalTotal, finalTotal)
                            downloading = false
                            activeDownloads.remove(downloadId)
                        }
                        DownloadManager.STATUS_FAILED -> {
                            emitDownloadError(downloadInfo.modelName, downloadInfo.downloadId, "Download failed")
                            downloading = false
                            activeDownloads.remove(downloadId)
                        }
                        DownloadManager.STATUS_RUNNING -> {
                            val bytesDownloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                            val bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                            val finalDownloaded = if (bytesDownloaded < 0) 0L else bytesDownloaded
                            val finalTotal = if (bytesTotal < 0) 0L else bytesTotal
                            val progress = if (finalTotal > 0) ((finalDownloaded * 100) / finalTotal).toInt() else 0
                            
                            // Update download info
                            downloadInfo.bytesDownloaded = finalDownloaded
                            downloadInfo.totalBytes = finalTotal
                            downloadInfo.progress = progress
                            
                            emitDownloadProgress(downloadInfo.modelName, downloadInfo.downloadId, progress, false, finalDownloaded, finalTotal)
                        }
                        DownloadManager.STATUS_PAUSED -> {
                            // Handle paused state if needed
                            val bytesDownloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                            val bytesTotal = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                            val finalDownloaded = if (bytesDownloaded < 0) 0L else bytesDownloaded
                            val finalTotal = if (bytesTotal < 0) 0L else bytesTotal
                            val progress = if (finalTotal > 0) ((finalDownloaded * 100) / finalTotal).toInt() else 0
                            
                            downloadInfo.bytesDownloaded = finalDownloaded
                            downloadInfo.totalBytes = finalTotal
                            downloadInfo.progress = progress
                        }
                    }
                }
                cursor.close()
                Thread.sleep(1000) // Update every second
            }
        }.start()
    }

    private fun getDownloadedBytes(downloadId: Long): Long {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor = downloadManager.query(query)
        
        return if (cursor.moveToFirst()) {
            val bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            cursor.close()
            if (bytes < 0) 0L else bytes
        } else {
            cursor.close()
            0L
        }
    }

    private fun getTotalBytes(downloadId: Long): Long {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor = downloadManager.query(query)
        
        return if (cursor.moveToFirst()) {
            val bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            cursor.close()
            if (bytes < 0) 0L else bytes
        } else {
            cursor.close()
            0L
        }
    }

    private fun calculateProgress(downloaded: Long, total: Long): Int {
        return if (total > 0) ((downloaded * 100) / total).toInt() else 0
    }

    private fun emitDownloadProgress(modelName: String, downloadId: String, progress: Int, isCompleted: Boolean, bytesDownloaded: Long, totalBytes: Long) {
        val params = Arguments.createMap().apply {
            putString("modelName", modelName)
            putString("downloadId", downloadId)
            putInt("progress", progress)
            putBoolean("isCompleted", isCompleted)
            putDouble("bytesDownloaded", bytesDownloaded.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }
        sendEvent("downloadProgress", params)
    }

    private fun emitDownloadError(modelName: String, downloadId: String, error: String) {
        val params = Arguments.createMap().apply {
            putString("modelName", modelName)
            putString("downloadId", downloadId)
            putString("error", error)
        }
        sendEvent("downloadError", params)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built in Event Emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built in Event Emitter
    }
} 