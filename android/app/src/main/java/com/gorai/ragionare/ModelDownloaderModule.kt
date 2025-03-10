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

    data class DownloadInfo(
        val modelName: String,
        val downloadId: String,
        val destination: String
    )

    override fun getName(): String = NAME

    @ReactMethod
    fun downloadModel(url: String, modelName: String, promise: Promise) {
        try {
            // Create models directory if it doesn't exist
            val modelsDir = File(reactApplicationContext.getExternalFilesDir(null), "models")
            if (!modelsDir.exists()) {
                modelsDir.mkdirs()
            }
            
            // List contents of models directory
            if (modelsDir.exists()) {
                val files = modelsDir.listFiles()
                println("ModelDownloader: Models directory contents: ${files?.map { "${it.name} (${it.length()} bytes)" }}")
            }

            // Set up destination file
            val destinationFile = File(modelsDir, modelName)
            println("ModelDownloader: Download destination path: ${destinationFile.absolutePath}")
            
            // Create download request
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("Downloading $modelName")
                .setDescription("Downloading model file")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(reactApplicationContext, null, "models/$modelName")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            // Start download
            val downloadId = downloadManager.enqueue(request)
            val downloadInfo = DownloadInfo(modelName, downloadId.toString(), destinationFile.absolutePath)
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
    fun cancelDownload(downloadId: String, promise: Promise) {
        try {
            val id = downloadId.toLong()
            downloadManager.remove(id)
            activeDownloads.remove(id)
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
                            
                            // Check if file exists at destination
                            val file = File(downloadInfo.destination)

                            
                            // List contents of models directory after download
                            val modelsDir = file.parentFile
                            if (modelsDir?.exists() == true) {
                                val files = modelsDir.listFiles()
                                println("ModelDownloader: Models directory contents after download: ${files?.map { "${it.name} (${it.length()} bytes)" }}")
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
                            emitDownloadProgress(downloadInfo.modelName, downloadInfo.downloadId, progress, false, finalDownloaded, finalTotal)
                        }
                    }
                }
                cursor.close()
                Thread.sleep(1000) // Update every second
            }
        }.start()
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