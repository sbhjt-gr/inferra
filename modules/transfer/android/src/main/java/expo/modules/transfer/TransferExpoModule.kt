package expo.modules.transfer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class TransferExpoModule : Module() {

  data class OngoingTransfer(
    val destination: String,
    val modelName: String,
    val url: String?,
    val headers: String? = null,
    val state: String = TransferStateStore.STATE_DOWNLOADING,
  )

  companion object {
    private const val LOG_TAG = "TransferModule"
    const val ACTION_TRANSFER_PROGRESS = "com.inferra.transfer.PROGRESS"
    const val ACTION_TRANSFER_COMPLETE = "com.inferra.transfer.COMPLETE"
    const val ACTION_TRANSFER_ERROR = "com.inferra.transfer.ERROR"
    const val ACTION_TRANSFER_CANCELLED = "com.inferra.transfer.CANCELLED"
    const val ACTION_TRANSFER_PAUSED = "com.inferra.transfer.PAUSED"
  }

  class TransferCancelledException : Exception("Transfer was cancelled")
  class TransferPausedException : Exception("Transfer was paused")

  private val ongoingTransfers = ConcurrentHashMap<String, OngoingTransfer>()
  private val transferScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private var progressReceiver: BroadcastReceiver? = null

  private val transferStore by lazy {
    appContext.reactContext?.getSharedPreferences("transfer_module_store", Context.MODE_PRIVATE)
  }

  override fun definition() = ModuleDefinition {
    Name("TransferModule")

    Events(
      "onTransferProgress",
      "onTransferComplete",
      "onTransferError",
      "onTransferCancelled",
      "onTransferPaused"
    )

    OnCreate {
      setupBroadcastReceiver()
      restoreOngoingTransfers()
    }

    OnDestroy {
      transferScope.cancel()
      progressReceiver?.let { receiver ->
        appContext.reactContext?.let {
          LocalBroadcastManager.getInstance(it).unregisterReceiver(receiver)
        }
      }
    }

    AsyncFunction("beginTransfer") { url: String, destination: String, headers: Map<String, String>? ->
      val context = appContext.reactContext
        ?: throw Exception("Context not available")

      val transferId = System.currentTimeMillis().toString()
      val modelName = extractModelName(destination) ?: transferId
      val headersString = encodeHeaders(headers)

      Log.i(LOG_TAG, "begin_transfer $transferId")

      enqueueWorker(context, transferId, url, destination, headersString, modelName)

      val transferInfo = OngoingTransfer(
        destination, modelName, url, headersString, TransferStateStore.STATE_DOWNLOADING
      )
      ongoingTransfers[transferId] = transferInfo
      storeTransfer(transferId, transferInfo)
      TransferStateStore.setState(context, transferId, TransferStateStore.STATE_DOWNLOADING)

      mapOf("transferId" to transferId)
    }

    AsyncFunction("pauseTransfer") { transferId: String ->
      val context = appContext.reactContext
        ?: throw Exception("Context not available")

      Log.i(LOG_TAG, "pause_transfer $transferId")
      TransferStateStore.requestPause(context, transferId)
      TransferStateStore.setState(context, transferId, TransferStateStore.STATE_PAUSED)
      WorkManager.getInstance(context).cancelAllWorkByTag(transferId)

      val stored = ongoingTransfers[transferId] ?: readStoredTransfer(transferId)
      if (stored != null) {
        val paused = stored.copy(state = TransferStateStore.STATE_PAUSED)
        ongoingTransfers[transferId] = paused
        storeTransfer(transferId, paused)

        val bytes = TransferStateStore.getBytes(context, transferId).takeIf { it > 0 }
          ?: readPartialBytes(stored.destination)
        val total = TransferStateStore.getTotal(context, transferId)
        TransferStateStore.setBytes(context, transferId, bytes, total)

        sendEvent("onTransferPaused", mapOf(
          "downloadId" to transferId,
          "modelName" to paused.modelName,
          "destination" to paused.destination,
          "url" to paused.url,
          "bytesWritten" to bytes.toDouble(),
          "totalBytes" to total.toDouble(),
          "state" to "paused",
        ))
        DownloadNotificationHelper.showPausedNotification(
          context, transferId, paused.modelName, bytes, total
        )
      }
      true
    }

    AsyncFunction("resumeTransfer") { transferId: String, headers: Map<String, String>? ->
      val context = appContext.reactContext
        ?: throw Exception("Context not available")

      val stored = ongoingTransfers[transferId] ?: readStoredTransfer(transferId)
        ?: throw Exception("transfer_not_found")

      Log.i(LOG_TAG, "resume_transfer $transferId")
      TransferStateStore.clearPauseRequest(context, transferId)
      TransferStateStore.setState(context, transferId, TransferStateStore.STATE_DOWNLOADING)

      val headersString = encodeHeaders(headers) ?: stored.headers
      val updated = stored.copy(
        headers = headersString,
        state = TransferStateStore.STATE_DOWNLOADING,
      )
      ongoingTransfers[transferId] = updated
      storeTransfer(transferId, updated)

      enqueueWorker(
        context, transferId, stored.url ?: "", stored.destination,
        headersString, stored.modelName
      )
      true
    }

    AsyncFunction("cancelTransfer") { transferId: String ->
      val context = appContext.reactContext
        ?: throw Exception("Context not available")

      Log.i(LOG_TAG, "cancel_transfer $transferId")
      TransferStateStore.requestCancel(context, transferId)
      TransferStateStore.clearPauseRequest(context, transferId)
      WorkManager.getInstance(context).cancelAllWorkByTag(transferId)

      val stored = ongoingTransfers.remove(transferId) ?: readStoredTransfer(transferId)
      stored?.let {
        deletePartialFiles(it.destination)
      }
      removeStoredTransfer(transferId)
      TransferStateStore.clear(context, transferId)
      DownloadNotificationHelper.cancelNotification(context, transferId)
      true
    }

    AsyncFunction("getOngoingTransfers") {
      val context = appContext.reactContext
        ?: throw Exception("Context not available")

      val workManager = WorkManager.getInstance(context)
      val workInfos = workManager.getWorkInfosByTag(FileTransferWorker.WORK_TAG).get()
      val result = mutableListOf<Map<String, Any?>>()
      val seen = mutableSetOf<String>()

      for (workInfo in workInfos) {
        if (workInfo.state.isFinished) continue

        val transferId = workInfo.tags.firstOrNull {
          it != FileTransferWorker.WORK_TAG && it != FileTransferWorker::class.java.name
        } ?: continue

        seen += transferId
        val storedTransfer = ongoingTransfers[transferId]
          ?: readStoredTransfer(transferId)
          ?: OngoingTransfer("", transferId, null)

        val destination = storedTransfer.destination
        val modelName = storedTransfer.modelName.ifEmpty {
          extractModelName(destination) ?: transferId
        }
        val url = storedTransfer.url

        val progressData = workInfo.progress
        val bytesWritten = progressData.getLong(FileTransferWorker.KEY_PROGRESS_BYTES, 0L)
          .takeIf { it > 0 }
          ?: TransferStateStore.getBytes(context, transferId).takeIf { it > 0 }
          ?: readPartialBytes(destination)
        val totalBytes = progressData.getLong(FileTransferWorker.KEY_PROGRESS_TOTAL, 0L)
          .takeIf { it > 0 }
          ?: TransferStateStore.getTotal(context, transferId)
        val progressPercent = if (totalBytes > 0) {
          ((bytesWritten * 100) / totalBytes).toInt()
        } else {
          progressData.getInt(FileTransferWorker.KEY_PROGRESS_PERCENT, 0)
        }

        val transferInfo = mutableMapOf<String, Any?>(
          "id" to transferId,
          "destination" to destination,
          "modelName" to modelName,
          "bytesWritten" to bytesWritten.toDouble(),
          "totalBytes" to totalBytes.toDouble(),
          "progress" to progressPercent,
          "state" to "downloading",
        )
        url?.let { transferInfo["url"] = it }

        ongoingTransfers[transferId] = OngoingTransfer(
          destination, modelName, url, storedTransfer.headers, "downloading"
        )
        result.add(transferInfo)
      }

      for (transferId in TransferStateStore.allPausedIds(context)) {
        if (seen.contains(transferId)) continue
        val stored = ongoingTransfers[transferId] ?: readStoredTransfer(transferId) ?: continue
        val bytes = TransferStateStore.getBytes(context, transferId).takeIf { it > 0 }
          ?: readPartialBytes(stored.destination)
        val total = TransferStateStore.getTotal(context, transferId)
        val progress = if (total > 0) ((bytes * 100) / total).toInt() else 0

        val transferInfo = mutableMapOf<String, Any?>(
          "id" to transferId,
          "destination" to stored.destination,
          "modelName" to stored.modelName,
          "bytesWritten" to bytes.toDouble(),
          "totalBytes" to total.toDouble(),
          "progress" to progress,
          "state" to "paused",
        )
        stored.url?.let { transferInfo["url"] = it }
        result.add(transferInfo)
      }

      result
    }
  }

  private fun enqueueWorker(
    context: Context,
    transferId: String,
    url: String,
    destination: String,
    headersString: String?,
    modelName: String,
  ) {
    val inputData = workDataOf(
      FileTransferWorker.KEY_URL to url,
      FileTransferWorker.KEY_DESTINATION to destination,
      FileTransferWorker.KEY_TRANSFER_ID to transferId,
      FileTransferWorker.KEY_HEADERS to (headersString ?: ""),
      FileTransferWorker.KEY_MODEL_NAME to modelName
    )

    val transferRequest = OneTimeWorkRequestBuilder<FileTransferWorker>()
      .setInputData(inputData)
      .addTag(transferId)
      .addTag(FileTransferWorker.WORK_TAG)
      .build()

    WorkManager.getInstance(context).enqueue(transferRequest)
  }

  private fun encodeHeaders(headers: Map<String, String>?): String? {
    if (headers.isNullOrEmpty()) return null
    return headers.entries.joinToString(", ", "{", "}") { "${it.key}=${it.value}" }
  }

  private fun extractModelName(path: String?): String? {
    if (path.isNullOrEmpty()) return null
    val normalised = FileTransferWorker.stripFileScheme(path)
    return normalised.split('/').filter { it.isNotEmpty() }.lastOrNull()
      ?.removeSuffix(FileTransferWorker.PARTIAL_SUFFIX)
  }

  private fun readPartialBytes(destination: String): Long {
    return try {
      val file = File(FileTransferWorker.partialPath(destination))
      if (file.exists()) file.length() else 0L
    } catch (_: Exception) {
      0L
    }
  }

  private fun deletePartialFiles(destination: String) {
    try {
      File(FileTransferWorker.partialPath(destination)).delete()
      File(FileTransferWorker.finalPath(destination)).delete()
      Log.i(LOG_TAG, "partials_purged")
    } catch (e: Exception) {
      Log.w(LOG_TAG, "partial_purge_failed", e)
    }
  }

  private fun storeTransfer(transferId: String, transfer: OngoingTransfer) {
    val data = JSONObject().apply {
      put("destination", transfer.destination)
      put("modelName", transfer.modelName)
      put("url", transfer.url)
      put("state", transfer.state)
    }.toString()
    transferStore?.edit()?.putString(transferId, data)?.apply()
  }

  private fun readStoredTransfer(transferId: String): OngoingTransfer? {
    val data = transferStore?.getString(transferId, null) ?: return null
    return try {
      val obj = JSONObject(data)
      OngoingTransfer(
        obj.optString("destination", ""),
        obj.optString("modelName", transferId),
        if (obj.isNull("url")) null else obj.optString("url", null),
        null,
        obj.optString("state", TransferStateStore.STATE_DOWNLOADING),
      )
    } catch (_: Exception) {
      null
    }
  }

  private fun removeStoredTransfer(transferId: String) {
    transferStore?.edit()?.remove(transferId)?.apply()
  }

  private fun restoreOngoingTransfers() {
    transferScope.launch(Dispatchers.IO) {
      try {
        val context = appContext.reactContext ?: return@launch
        val workManager = WorkManager.getInstance(context)
        val workInfos = workManager.getWorkInfosByTag(FileTransferWorker.WORK_TAG).get()
        val activeIds = mutableSetOf<String>()

        for (info in workInfos) {
          if (info.state.isFinished) continue
          val transferId = info.tags.firstOrNull {
            it != FileTransferWorker.WORK_TAG && it != FileTransferWorker::class.java.name
          } ?: continue
          activeIds += transferId
          val stored = readStoredTransfer(transferId) ?: OngoingTransfer("", transferId, null)
          ongoingTransfers[transferId] = stored
        }

        for (pausedId in TransferStateStore.allPausedIds(context)) {
          activeIds += pausedId
          val stored = readStoredTransfer(pausedId)
          if (stored != null) {
            ongoingTransfers[pausedId] = stored.copy(state = TransferStateStore.STATE_PAUSED)
          }
        }

        val store = transferStore ?: return@launch
        if (store.all.isNotEmpty()) {
          val editor = store.edit()
          var modified = false
          for (entry in store.all.keys) {
            if (!activeIds.contains(entry)) {
              val state = TransferStateStore.getState(context, entry)
              if (state == TransferStateStore.STATE_PAUSED) continue
              editor.remove(entry)
              modified = true
            }
          }
          if (modified) editor.apply()
        }
      } catch (e: Exception) {
        Log.w(LOG_TAG, "restore_failed", e)
      }
    }
  }

  private fun setupBroadcastReceiver() {
    val context = appContext.reactContext ?: return

    progressReceiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        when (intent?.action) {
          ACTION_TRANSFER_PROGRESS -> {
            val transferId = intent.getStringExtra("transferId") ?: return
            val bytesWritten = intent.getLongExtra("bytesWritten", 0)
            val totalBytes = intent.getLongExtra("totalBytes", 0)
            val speed = intent.getLongExtra("speed", 0)
            val progress = intent.getIntExtra("progress", 0)
            val modelName = intent.getStringExtra("modelName")
            val destination = intent.getStringExtra("destination")
            val url = intent.getStringExtra("url")

            val info = ongoingTransfers[transferId]
            val resolvedName = modelName ?: info?.modelName ?: extractModelName(destination) ?: transferId
            val resolvedDest = destination ?: info?.destination ?: ""
            val resolvedUrl = url ?: info?.url

            sendEvent("onTransferProgress", mapOf(
              "downloadId" to transferId,
              "modelName" to resolvedName,
              "destination" to resolvedDest,
              "url" to resolvedUrl,
              "bytesWritten" to bytesWritten.toDouble(),
              "totalBytes" to totalBytes.toDouble(),
              "speed" to speed.toDouble(),
              "eta" to if (speed > 0) (totalBytes - bytesWritten).toDouble() / speed else 0.0,
              "progress" to progress,
              "state" to "downloading",
            ))
          }
          ACTION_TRANSFER_PAUSED -> {
            val transferId = intent.getStringExtra("transferId") ?: return
            val modelName = intent.getStringExtra("modelName")
            val destination = intent.getStringExtra("destination")
            val url = intent.getStringExtra("url")
            val bytesWritten = intent.getLongExtra("bytesWritten", 0)
            val totalBytes = intent.getLongExtra("totalBytes", 0)

            val info = ongoingTransfers[transferId]
            val resolvedName = modelName ?: info?.modelName ?: extractModelName(destination) ?: transferId
            val resolvedDest = destination ?: info?.destination ?: ""
            val resolvedUrl = url ?: info?.url

            info?.let {
              val paused = it.copy(state = TransferStateStore.STATE_PAUSED)
              ongoingTransfers[transferId] = paused
              storeTransfer(transferId, paused)
            }

            sendEvent("onTransferPaused", mapOf(
              "downloadId" to transferId,
              "modelName" to resolvedName,
              "destination" to resolvedDest,
              "url" to resolvedUrl,
              "bytesWritten" to bytesWritten.toDouble(),
              "totalBytes" to totalBytes.toDouble(),
              "state" to "paused",
            ))
          }
          ACTION_TRANSFER_COMPLETE -> {
            val transferId = intent.getStringExtra("transferId") ?: return
            val modelName = intent.getStringExtra("modelName")
            val destination = intent.getStringExtra("destination")
            val url = intent.getStringExtra("url")
            val bytesWritten = intent.getLongExtra("bytesWritten", 0)
            val totalBytes = intent.getLongExtra("totalBytes", bytesWritten)

            val info = ongoingTransfers.remove(transferId)
            val resolvedName = modelName ?: info?.modelName ?: extractModelName(destination) ?: transferId
            val resolvedDest = destination ?: info?.destination
            val resolvedUrl = url ?: info?.url
            removeStoredTransfer(transferId)

            sendEvent("onTransferComplete", mapOf(
              "downloadId" to transferId,
              "modelName" to resolvedName,
              "destination" to resolvedDest,
              "url" to resolvedUrl,
              "bytesWritten" to bytesWritten.toDouble(),
              "totalBytes" to totalBytes.toDouble(),
            ))
          }
          ACTION_TRANSFER_ERROR -> {
            val transferId = intent.getStringExtra("transferId") ?: return
            val error = intent.getStringExtra("error") ?: "Unknown error"
            val modelName = intent.getStringExtra("modelName")
            val destination = intent.getStringExtra("destination")
            val url = intent.getStringExtra("url")
            val bytesWritten = intent.getLongExtra("bytesWritten", 0)
            val totalBytes = intent.getLongExtra("totalBytes", 0)

            val info = ongoingTransfers[transferId]
            val resolvedName = modelName ?: info?.modelName ?: extractModelName(destination) ?: transferId
            val resolvedDest = destination ?: info?.destination
            val resolvedUrl = url ?: info?.url

            sendEvent("onTransferError", mapOf(
              "downloadId" to transferId,
              "error" to error,
              "modelName" to resolvedName,
              "destination" to resolvedDest,
              "url" to resolvedUrl,
              "bytesWritten" to bytesWritten.toDouble(),
              "totalBytes" to totalBytes.toDouble(),
            ))
          }
          ACTION_TRANSFER_CANCELLED -> {
            val transferId = intent.getStringExtra("transferId") ?: return
            val modelName = intent.getStringExtra("modelName")
            val destination = intent.getStringExtra("destination")
            val url = intent.getStringExtra("url")
            val bytesWritten = intent.getLongExtra("bytesWritten", 0)
            val totalBytes = intent.getLongExtra("totalBytes", 0)

            val info = ongoingTransfers.remove(transferId)
            val resolvedName = modelName ?: info?.modelName ?: extractModelName(destination) ?: transferId
            val resolvedDest = destination ?: info?.destination
            val resolvedUrl = url ?: info?.url
            removeStoredTransfer(transferId)

            sendEvent("onTransferCancelled", mapOf(
              "downloadId" to transferId,
              "modelName" to resolvedName,
              "destination" to resolvedDest,
              "url" to resolvedUrl,
              "bytesWritten" to bytesWritten.toDouble(),
              "totalBytes" to totalBytes.toDouble(),
            ))
          }
        }
      }
    }

    val intentFilter = IntentFilter().apply {
      addAction(ACTION_TRANSFER_PROGRESS)
      addAction(ACTION_TRANSFER_COMPLETE)
      addAction(ACTION_TRANSFER_ERROR)
      addAction(ACTION_TRANSFER_CANCELLED)
      addAction(ACTION_TRANSFER_PAUSED)
    }

    LocalBroadcastManager.getInstance(context)
      .registerReceiver(progressReceiver!!, intentFilter)
  }
}
