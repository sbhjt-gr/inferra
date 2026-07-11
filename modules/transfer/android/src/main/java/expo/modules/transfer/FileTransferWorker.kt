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
    private const val BUFFER_SIZE = 8192
    private const val BROADCAST_INTERVAL = 1000L
    private const val DB_UPDATE_INTERVAL = 3000L
    private const val NOTIFICATION_INTERVAL = 3000L
  }

  private var lastBytesTransferred: Long = 0L
  private var lastTotalBytes: Long = 0L

  private fun extractModelName(path: String?): String? {
    if (path.isNullOrEmpty()) return null
    val normalised = if (path.startsWith("file://")) path.substring(7) else path
    return normalised.split('/').filter { it.isNotEmpty() }.lastOrNull()
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

    try {
      setForeground(
        DownloadNotificationHelper.createForegroundInfo(
          applicationContext, transferId, modelName, 0, 0, 0
        )
      )
    } catch (e: Exception) {
      Log.w(LOG_TAG, "foreground_init_failed", e)
    }

    return try {
      val (bytesWritten, totalBytes) = performFileTransfer(
        url, destination, transferId, headersString, modelName
      )
      broadcastComplete(transferId, modelName, destination, url, bytesWritten, totalBytes)
      DownloadNotificationHelper.showCompletionNotification(applicationContext, transferId, modelName)
      Result.success()
    } catch (e: TransferExpoModule.TransferCancelledException) {
      broadcastCancelled(transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes)
      DownloadNotificationHelper.cancelNotification(applicationContext, transferId)
      Result.success()
    } catch (e: Exception) {
      Log.e(LOG_TAG, "transfer_failed", e)
      deletePartialDestination(destination)
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

  private suspend fun performFileTransfer(
    urlString: String, destinationPath: String, transferId: String,
    headersString: String?, modelName: String,
  ): Pair<Long, Long> = withContext(Dispatchers.IO) {
    var httpConnection: HttpURLConnection? = null
    var dataInputStream: InputStream? = null
    var fileOutputStream: FileOutputStream? = null

    try {
      val url = URL(urlString)
      httpConnection = url.openConnection() as HttpURLConnection

      headersString?.let { headers ->
        try {
          val headerMap = parseHeaderString(headers)
          headerMap.forEach { (key, value) ->
            httpConnection.setRequestProperty(key, value)
          }
        } catch (e: Exception) {
          Log.w(LOG_TAG, "header_parse_failed: $headers", e)
        }
      }

      httpConnection.connectTimeout = 30000
      httpConnection.readTimeout = 30000
      httpConnection.connect()

      if (httpConnection.responseCode != HttpURLConnection.HTTP_OK) {
        throw IOException("HTTP error: ${httpConnection.responseCode} ${httpConnection.responseMessage}")
      }

      val totalFileSize = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
        httpConnection.contentLengthLong
      } else {
        httpConnection.getHeaderField("Content-Length")?.toLongOrNull() ?: httpConnection.contentLength.toLong()
      }
      dataInputStream = httpConnection.inputStream

      val actualPath = if (destinationPath.startsWith("file://")) {
        destinationPath.substring(7)
      } else destinationPath

      val destinationFile = File(actualPath)
      destinationFile.parentFile?.mkdirs()
      fileOutputStream = FileOutputStream(destinationFile)

      val dataBuffer = ByteArray(BUFFER_SIZE)
      var totalBytesTransferred = 0L
      var bytesRead: Int
      var lastProgressTimestamp = 0L
      val transferStartTime = System.currentTimeMillis()
      var lastNotificationTimestamp = 0L
      var lastDbUpdateTimestamp = 0L

      while (dataInputStream.read(dataBuffer).also { bytesRead = it } != -1) {
        if (isStopped) break

        fileOutputStream.write(dataBuffer, 0, bytesRead)
        totalBytesTransferred += bytesRead

        val currentTimestamp = System.currentTimeMillis()
        if (currentTimestamp - lastProgressTimestamp >= BROADCAST_INTERVAL) {
          val elapsedTime = currentTimestamp - transferStartTime
          val transferSpeed = if (elapsedTime > 0) (totalBytesTransferred * 1000) / elapsedTime else 0L
          val progressPercent = if (totalFileSize > 0) ((totalBytesTransferred * 100) / totalFileSize).toInt() else 0

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

      if (isStopped) {
        destinationFile.delete()
        throw TransferExpoModule.TransferCancelledException()
      }

      fileOutputStream.flush()
      lastBytesTransferred = totalBytesTransferred
      lastTotalBytes = totalFileSize

    } finally {
      dataInputStream?.close()
      fileOutputStream?.close()
      httpConnection?.disconnect()
    }

    Pair(lastBytesTransferred, lastTotalBytes)
  }

  private fun deletePartialDestination(destinationPath: String) {
    try {
      val actualPath = if (destinationPath.startsWith("file://")) {
        destinationPath.substring(7)
      } else {
        destinationPath
      }
      val file = File(actualPath)
      if (file.exists() && file.delete()) {
        Log.i(LOG_TAG, "partial_deleted: $actualPath")
      }
    } catch (e: Exception) {
      Log.w(LOG_TAG, "partial_delete_failed: $destinationPath", e)
    }
  }

  private fun parseHeaderString(headersString: String): Map<String, String> {
    return try {
      if (headersString.startsWith("{") && headersString.endsWith("}")) {
        val cleaned = headersString.substring(1, headersString.length - 1)
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
      Log.w(LOG_TAG, "header_string_parse_failed: $headersString", e)
      emptyMap()
    }
  }
}
