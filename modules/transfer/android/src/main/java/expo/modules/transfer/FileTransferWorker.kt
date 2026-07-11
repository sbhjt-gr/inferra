package expo.modules.transfer

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class FileTransferWorker(
  context: Context,
  params: WorkerParameters,
) : CoroutineWorker(context, params) {

  companion object {
    private const val LOG_TAG = "FileTransferWorker"
    const val KEY_URL = "url"
    const val KEY_DESTINATION = "destination"
    const val KEY_TRANSFER_ID = "transferId"
    const val KEY_HEADERS = "headers"
    const val KEY_MODEL_NAME = "modelName"
    const val KEY_PROGRESS_BYTES = "progressBytes"
    const val KEY_PROGRESS_TOTAL = "progressTotal"
    const val KEY_PROGRESS_PERCENT = "progressPercent"
    const val WORK_TAG = "inferra_file_transfer"
    const val PARTIAL_SUFFIX = ".partial"
    private const val BUFFER_SIZE = 8192
    private const val BROADCAST_INTERVAL = 1000L
    private const val DB_UPDATE_INTERVAL = 3000L
    private const val NOTIFICATION_INTERVAL = 3000L
    private const val MAX_RETRIES = 3

    fun partialPath(destination: String): String {
      val actual = stripFileScheme(destination)
      return if (actual.endsWith(PARTIAL_SUFFIX)) actual else "$actual$PARTIAL_SUFFIX"
    }

    fun stripFileScheme(path: String): String {
      return if (path.startsWith("file://")) path.substring(7) else path
    }

    fun finalPath(destination: String): String {
      val actual = stripFileScheme(destination)
      return if (actual.endsWith(PARTIAL_SUFFIX)) {
        actual.removeSuffix(PARTIAL_SUFFIX)
      } else {
        actual
      }
    }
  }

  private var lastBytesTransferred: Long = 0L
  private var lastTotalBytes: Long = 0L

  private fun extractModelName(path: String?): String? {
    if (path.isNullOrEmpty()) return null
    val normalised = stripFileScheme(path)
    return normalised.split('/').filter { it.isNotEmpty() }.lastOrNull()
      ?.removeSuffix(PARTIAL_SUFFIX)
  }

  private fun broadcastProgress(
    transferId: String, modelName: String, destination: String, url: String?,
    bytesWritten: Long, totalBytes: Long, speed: Long, progress: Int,
  ) {
    val intent = Intent(TransferExpoModule.ACTION_TRANSFER_PROGRESS).apply {
      putExtra("transferId", transferId)
      putExtra("bytesWritten", bytesWritten)
      putExtra("totalBytes", totalBytes)
      putExtra("speed", speed)
      putExtra("progress", progress)
      putExtra("modelName", modelName)
      putExtra("destination", destination)
      putExtra("state", "downloading")
      url?.let { putExtra("url", it) }
    }
    LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
  }

  private fun broadcastComplete(
    transferId: String, modelName: String, destination: String, url: String?,
    bytesWritten: Long, totalBytes: Long,
  ) {
    val intent = Intent(TransferExpoModule.ACTION_TRANSFER_COMPLETE).apply {
      putExtra("transferId", transferId)
      putExtra("modelName", modelName)
      putExtra("destination", destination)
      url?.let { putExtra("url", it) }
      putExtra("bytesWritten", bytesWritten)
      putExtra("totalBytes", totalBytes)
    }
    LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
  }

  private fun broadcastError(
    transferId: String, error: String, modelName: String, destination: String, url: String?,
    bytesWritten: Long, totalBytes: Long,
  ) {
    val intent = Intent(TransferExpoModule.ACTION_TRANSFER_ERROR).apply {
      putExtra("transferId", transferId)
      putExtra("error", error)
      putExtra("modelName", modelName)
      putExtra("destination", destination)
      url?.let { putExtra("url", it) }
      putExtra("bytesWritten", bytesWritten)
      putExtra("totalBytes", totalBytes)
    }
    LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
  }

  private fun broadcastCancelled(
    transferId: String, modelName: String, destination: String, url: String?,
    bytesWritten: Long, totalBytes: Long,
  ) {
    val intent = Intent(TransferExpoModule.ACTION_TRANSFER_CANCELLED).apply {
      putExtra("transferId", transferId)
      putExtra("modelName", modelName)
      putExtra("destination", destination)
      url?.let { putExtra("url", it) }
      putExtra("bytesWritten", bytesWritten)
      putExtra("totalBytes", totalBytes)
    }
    LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
  }

  private fun broadcastPaused(
    transferId: String, modelName: String, destination: String, url: String?,
    bytesWritten: Long, totalBytes: Long,
  ) {
    val intent = Intent(TransferExpoModule.ACTION_TRANSFER_PAUSED).apply {
      putExtra("transferId", transferId)
      putExtra("modelName", modelName)
      putExtra("destination", destination)
      url?.let { putExtra("url", it) }
      putExtra("bytesWritten", bytesWritten)
      putExtra("totalBytes", totalBytes)
      putExtra("state", "paused")
    }
    LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
  }

  override suspend fun doWork(): Result {
    val url = inputData.getString(KEY_URL)
    val destination = inputData.getString(KEY_DESTINATION)
    val transferId = inputData.getString(KEY_TRANSFER_ID)
    val headersString = inputData.getString(KEY_HEADERS)
    val modelNameInput = inputData.getString(KEY_MODEL_NAME)

    if (url == null || destination == null || transferId == null) return Result.failure()

    val modelName = modelNameInput ?: extractModelName(destination) ?: transferId
    lastBytesTransferred = 0L
    lastTotalBytes = 0L

    Log.i(LOG_TAG, "transfer_start $transferId")

    try {
      setForeground(
        DownloadNotificationHelper.createForegroundInfo(
          applicationContext, transferId, modelName, 0, 0, 0
        )
      )
    } catch (e: Exception) {
      Log.w(LOG_TAG, "foreground_init_failed", e)
    }

    TransferStateStore.setState(applicationContext, transferId, TransferStateStore.STATE_DOWNLOADING)

    return try {
      val (bytesWritten, totalBytes) = performFileTransfer(
        url, destination, transferId, headersString, modelName
      )
      broadcastComplete(transferId, modelName, finalPath(destination), url, bytesWritten, totalBytes)
      DownloadNotificationHelper.showCompletionNotification(applicationContext, transferId, modelName)
      TransferStateStore.clear(applicationContext, transferId)
      Log.i(LOG_TAG, "transfer_done $transferId")
      Result.success()
    } catch (e: TransferExpoModule.TransferPausedException) {
      Log.i(LOG_TAG, "transfer_paused $transferId")
      TransferStateStore.setState(applicationContext, transferId, TransferStateStore.STATE_PAUSED)
      TransferStateStore.setBytes(
        applicationContext, transferId, lastBytesTransferred, lastTotalBytes
      )
      broadcastPaused(
        transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes
      )
      DownloadNotificationHelper.showPausedNotification(
        applicationContext, transferId, modelName, lastBytesTransferred, lastTotalBytes
      )
      Result.success()
    } catch (e: TransferExpoModule.TransferCancelledException) {
      Log.i(LOG_TAG, "transfer_cancelled $transferId")
      deletePartial(destination)
      TransferStateStore.clear(applicationContext, transferId)
      broadcastCancelled(transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes)
      DownloadNotificationHelper.cancelNotification(applicationContext, transferId)
      Result.success()
    } catch (e: kotlinx.coroutines.CancellationException) {
      Log.i(LOG_TAG, "transfer_job_cancel $transferId")
      if (TransferStateStore.isCancelRequested(applicationContext, transferId)) {
        deletePartial(destination)
        TransferStateStore.clear(applicationContext, transferId)
        broadcastCancelled(transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes)
        DownloadNotificationHelper.cancelNotification(applicationContext, transferId)
      } else {
        TransferStateStore.setState(applicationContext, transferId, TransferStateStore.STATE_PAUSED)
        TransferStateStore.setBytes(
          applicationContext, transferId, lastBytesTransferred, lastTotalBytes
        )
        broadcastPaused(
          transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes
        )
        DownloadNotificationHelper.showPausedNotification(
          applicationContext, transferId, modelName, lastBytesTransferred, lastTotalBytes
        )
      }
      Result.success()
    } catch (e: Exception) {
      Log.e(LOG_TAG, "transfer_failed", e)
      val retryable = isRetryable(e)
      if (retryable && runAttemptCount < MAX_RETRIES) {
        Log.i(LOG_TAG, "transfer_retry $runAttemptCount")
        Result.retry()
      } else {
        broadcastError(
          transferId, e.message ?: "Unknown error", modelName, destination, url,
          lastBytesTransferred, lastTotalBytes
        )
        DownloadNotificationHelper.showFailureNotification(
          applicationContext, transferId, modelName, e.message
        )
        Result.failure()
      }
    }
  }

  private fun isRetryable(e: Exception): Boolean {
    val msg = (e.message ?: "").lowercase()
    if (msg.contains("enospc") || msg.contains("no space")) return false
    if (msg.contains("http error: 401") || msg.contains("http error: 403") ||
      msg.contains("http error: 404")
    ) {
      return false
    }
    return e is IOException || msg.contains("timeout") || msg.contains("reset") ||
      msg.contains("503") || msg.contains("502") || msg.contains("500")
  }

  private suspend fun performFileTransfer(
    urlString: String, destinationPath: String, transferId: String,
    headersString: String?, modelName: String,
  ): Pair<Long, Long> = withContext(Dispatchers.IO) {
    var httpConnection: HttpURLConnection? = null
    var dataInputStream: InputStream? = null
    var fileOutputStream: FileOutputStream? = null

    try {
      val partialFile = File(partialPath(destinationPath))
      partialFile.parentFile?.mkdirs()
      var existingSize = if (partialFile.exists()) partialFile.length() else 0L
      Log.i(LOG_TAG, "partial_size $existingSize")

      val url = URL(urlString)
      httpConnection = url.openConnection() as HttpURLConnection

      headersString?.let { headers ->
        try {
          val headerMap = parseHeaderString(headers)
          headerMap.forEach { (key, value) ->
            httpConnection.setRequestProperty(key, value)
          }
        } catch (e: Exception) {
          Log.w(LOG_TAG, "header_parse_failed", e)
        }
      }

      if (existingSize > 0) {
        httpConnection.setRequestProperty("Range", "bytes=$existingSize-")
        Log.i(LOG_TAG, "range_request $existingSize")
      }

      httpConnection.connectTimeout = 30000
      httpConnection.readTimeout = 60000
      httpConnection.connect()

      val responseCode = httpConnection.responseCode
      Log.i(LOG_TAG, "http_status $responseCode")

      if (responseCode != HttpURLConnection.HTTP_OK &&
        responseCode != HttpURLConnection.HTTP_PARTIAL
      ) {
        throw IOException("HTTP error: $responseCode ${httpConnection.responseMessage}")
      }

      if (existingSize > 0 && responseCode == HttpURLConnection.HTTP_OK) {
        Log.i(LOG_TAG, "range_ignored_restart")
        partialFile.delete()
        existingSize = 0L
        fileOutputStream = FileOutputStream(partialFile, false)
      } else {
        fileOutputStream = FileOutputStream(partialFile, existingSize > 0)
      }

      val contentLength = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
        httpConnection.contentLengthLong
      } else {
        httpConnection.getHeaderField("Content-Length")?.toLongOrNull()
          ?: httpConnection.contentLength.toLong()
      }

      val totalFileSize = when {
        responseCode == HttpURLConnection.HTTP_PARTIAL -> {
          parseTotalFromContentRange(httpConnection.getHeaderField("Content-Range"))
            ?: (existingSize + contentLength)
        }
        contentLength > 0 && existingSize > 0 && responseCode == HttpURLConnection.HTTP_OK -> contentLength
        contentLength > 0 -> contentLength
        else -> TransferStateStore.getTotal(applicationContext, transferId)
      }

      dataInputStream = httpConnection.inputStream

      val dataBuffer = ByteArray(BUFFER_SIZE)
      var totalBytesTransferred = existingSize
      var bytesRead: Int
      var lastProgressTimestamp = 0L
      val transferStartTime = System.currentTimeMillis()
      var sessionBytes = 0L
      var lastNotificationTimestamp = 0L
      var lastDbUpdateTimestamp = 0L

      lastBytesTransferred = totalBytesTransferred
      lastTotalBytes = totalFileSize

      while (dataInputStream.read(dataBuffer).also { bytesRead = it } != -1) {
        if (isStopped || TransferStateStore.isPauseRequested(applicationContext, transferId)) {
          Log.i(LOG_TAG, "stop_detected")
          break
        }

        fileOutputStream.write(dataBuffer, 0, bytesRead)
        totalBytesTransferred += bytesRead
        sessionBytes += bytesRead

        val currentTimestamp = System.currentTimeMillis()
        if (currentTimestamp - lastProgressTimestamp >= BROADCAST_INTERVAL) {
          val elapsedTime = currentTimestamp - transferStartTime
          val transferSpeed = if (elapsedTime > 0) (sessionBytes * 1000) / elapsedTime else 0L
          val progressPercent = if (totalFileSize > 0) {
            ((totalBytesTransferred * 100) / totalFileSize).toInt()
          } else {
            0
          }

          if (currentTimestamp - lastDbUpdateTimestamp >= DB_UPDATE_INTERVAL) {
            try {
              setProgress(
                workDataOf(
                  KEY_PROGRESS_BYTES to totalBytesTransferred,
                  KEY_PROGRESS_TOTAL to totalFileSize,
                  KEY_PROGRESS_PERCENT to progressPercent
                )
              )
            } catch (e: Exception) {
              Log.w(LOG_TAG, "progress_set_failed", e)
            }
            TransferStateStore.setBytes(
              applicationContext, transferId, totalBytesTransferred, totalFileSize
            )
            lastDbUpdateTimestamp = currentTimestamp
          }

          lastBytesTransferred = totalBytesTransferred
          lastTotalBytes = totalFileSize

          broadcastProgress(
            transferId, modelName, destinationPath, urlString,
            totalBytesTransferred, totalFileSize, transferSpeed, progressPercent,
          )
          lastProgressTimestamp = currentTimestamp

          if (currentTimestamp - lastNotificationTimestamp >= NOTIFICATION_INTERVAL) {
            try {
              setForeground(
                DownloadNotificationHelper.createForegroundInfo(
                  applicationContext, transferId, modelName,
                  progressPercent, totalBytesTransferred, totalFileSize,
                )
              )
            } catch (e: Exception) {
              Log.w(LOG_TAG, "foreground_update_failed", e)
            }
            lastNotificationTimestamp = currentTimestamp
          }
        }
      }

      fileOutputStream.flush()
      lastBytesTransferred = totalBytesTransferred
      lastTotalBytes = totalFileSize

      if (isStopped || TransferStateStore.isPauseRequested(applicationContext, transferId)) {
        val pauseRequested = TransferStateStore.isPauseRequested(applicationContext, transferId)
        if (pauseRequested) {
          TransferStateStore.clearPauseRequest(applicationContext, transferId)
          throw TransferExpoModule.TransferPausedException()
        }
        if (TransferStateStore.isCancelRequested(applicationContext, transferId)) {
          throw TransferExpoModule.TransferCancelledException()
        }
        throw TransferExpoModule.TransferPausedException()
      }

      if (totalFileSize > 0 && totalBytesTransferred != totalFileSize) {
        Log.w(LOG_TAG, "size_mismatch $totalBytesTransferred $totalFileSize")
        if (totalBytesTransferred < totalFileSize) {
          throw IOException("incomplete_download")
        }
      }

      val finalFile = File(finalPath(destinationPath))
      if (finalFile.exists()) {
        finalFile.delete()
      }
      if (!partialFile.renameTo(finalFile)) {
        partialFile.copyTo(finalFile, overwrite = true)
        partialFile.delete()
      }
      Log.i(LOG_TAG, "partial_promoted")

    } finally {
      dataInputStream?.close()
      fileOutputStream?.close()
      httpConnection?.disconnect()
    }

    Pair(lastBytesTransferred, lastTotalBytes)
  }

  private fun parseTotalFromContentRange(contentRange: String?): Long? {
    if (contentRange.isNullOrBlank()) return null
    val slash = contentRange.lastIndexOf('/')
    if (slash < 0 || slash >= contentRange.length - 1) return null
    return contentRange.substring(slash + 1).toLongOrNull()
  }

  private fun deletePartial(destinationPath: String) {
    try {
      val file = File(partialPath(destinationPath))
      if (file.exists() && file.delete()) {
        Log.i(LOG_TAG, "partial_deleted")
      }
      val final = File(finalPath(destinationPath))
      if (final.exists() && final.delete()) {
        Log.i(LOG_TAG, "final_deleted")
      }
    } catch (e: Exception) {
      Log.w(LOG_TAG, "partial_delete_failed", e)
    }
  }

  private fun parseHeaderString(headersString: String): Map<String, String> {
    return try {
      if (headersString.startsWith("{") && headersString.endsWith("}")) {
        val cleaned = headersString.substring(1, headersString.length - 1)
        if (cleaned.isBlank()) return emptyMap()
        val pairs = cleaned.split(", ")
        val headerMap = mutableMapOf<String, String>()
        for (pair in pairs) {
          val keyValue = pair.split("=", limit = 2)
          if (keyValue.size == 2) {
            headerMap[keyValue[0].trim()] = keyValue[1].trim()
          }
        }
        headerMap
      } else emptyMap()
    } catch (e: Exception) {
      Log.w(LOG_TAG, "header_string_parse_failed", e)
      emptyMap()
    }
  }
}
