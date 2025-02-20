package com.gorai.ragionare

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import com.facebook.react.bridge.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class ModelDownloader(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ModelDownloader"

    private val downloadManager: DownloadManager by lazy {
        reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    @ReactMethod
    fun downloadModel(url: String, filename: String, promise: Promise) {
        try {
            // Create directory if it doesn't exist
            val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Ragionare")
            if (!directory.exists()) {
                directory.mkdirs()
            }

            // Make a HEAD request to get content length
            val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 30000
            connection.readTimeout = 30000
            connection.connect()
            val totalBytes = connection.contentLength.toLong()
            connection.disconnect()

            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("Downloading $filename")
                .setDescription("Downloading model file")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Ragionare/$filename")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .addRequestHeader("Accept", "*/*")

            val downloadId = downloadManager.enqueue(request)
            
            val result = WritableNativeMap()
            result.putDouble("downloadId", downloadId.toDouble())
            result.putString("path", "${directory.absolutePath}/$filename")
            result.putDouble("totalBytes", totalBytes.toDouble())
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun checkDownloadStatus(downloadId: Double, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val query = DownloadManager.Query().setFilterById(id)
            val cursor = downloadManager.query(query)

            if (cursor.moveToFirst()) {
                val status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS))
                val bytesDownloaded = cursor.getLong(cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                val totalBytes = cursor.getLong(cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))

                val result = WritableNativeMap()
                result.putString("status", when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> "completed"
                    DownloadManager.STATUS_FAILED -> "failed"
                    DownloadManager.STATUS_PENDING -> "pending"
                    DownloadManager.STATUS_RUNNING -> "running"
                    else -> "unknown"
                })
                result.putDouble("bytesDownloaded", bytesDownloaded.toDouble())
                result.putDouble("totalBytes", totalBytes.toDouble())
                
                cursor.close()
                promise.resolve(result)
            } else {
                cursor.close()
                promise.reject("ERROR", "Download not found")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check download status: ${e.message}")
        }
    }

    private fun getErrorReason(reason: Int): String {
        return when (reason) {
            DownloadManager.ERROR_CANNOT_RESUME -> "Cannot resume download"
            DownloadManager.ERROR_DEVICE_NOT_FOUND -> "Storage device not found"
            DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "File already exists"
            DownloadManager.ERROR_FILE_ERROR -> "File error"
            DownloadManager.ERROR_HTTP_DATA_ERROR -> "HTTP data error"
            DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Insufficient storage space"
            DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many redirects"
            DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Unhandled HTTP code"
            DownloadManager.ERROR_UNKNOWN -> "Unknown error"
            else -> "Error code: $reason"
        }
    }

    @ReactMethod
    fun cancelDownload(downloadId: Double, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val removed = downloadManager.remove(id)
            promise.resolve(removed > 0)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getStoredModels(promise: Promise) {
        try {
            val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Ragionare")
            if (!directory.exists()) {
                promise.resolve(WritableNativeArray())
                return
            }

            val files = directory.listFiles()
            val result = WritableNativeArray()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

            files?.forEach { file ->
                val fileInfo = WritableNativeMap().apply {
                    putString("name", file.name)
                    putString("path", file.absolutePath)
                    putDouble("size", file.length().toDouble())
                    putString("modified", dateFormat.format(Date(file.lastModified())))
                }
                result.pushMap(fileInfo)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", e.message)
        }
    }

    @ReactMethod
    fun deleteModel(path: String, promise: Promise) {
        try {
            val file = File(path)
            val deleted = file.delete()
            promise.resolve(deleted)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message)
        }
    }
} 