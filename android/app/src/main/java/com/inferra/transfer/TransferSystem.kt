package com.inferra.transfer

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import androidx.work.*
import android.content.Context
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import com.gorai.ragionare.notifications.DownloadNotificationHelper
import org.json.JSONObject

class TransferModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    data class OngoingTransfer(val destination: String, val modelName: String, val url: String?)

    private val ongoingTransfers = ConcurrentHashMap<String, OngoingTransfer>()
    private val transferScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var progressReceiver: BroadcastReceiver? = null
    private val transferStore = reactApplicationContext.getSharedPreferences("transfer_module_store", Context.MODE_PRIVATE)
    
    companion object {
        private const val LOG_TAG = "TransferModule"
        const val MODULE_NAME = "TransferModule"
        const val ACTION_TRANSFER_PROGRESS = "com.inferra.transfer.PROGRESS"
        const val ACTION_TRANSFER_COMPLETE = "com.inferra.transfer.COMPLETE" 
        const val ACTION_TRANSFER_ERROR = "com.inferra.transfer.ERROR"
        const val ACTION_TRANSFER_CANCELLED = "com.inferra.transfer.CANCELLED"
    }

    private fun extractModelName(path: String?): String? {
        if (path.isNullOrEmpty()) {
            return null
        }

        val normalised = if (path.startsWith("file://")) {
            path.substring(7)
        } else {
            path
        }

        val segments = normalised.split('/').filter { it.isNotEmpty() }
        return segments.lastOrNull()
    }

    private fun storeTransfer(transferId: String, transfer: OngoingTransfer) {
        val data = JSONObject().apply {
            put("destination", transfer.destination)
            put("modelName", transfer.modelName)
            put("url", transfer.url)
        }.toString()
        transferStore.edit().putString(transferId, data).apply()
    }

    private fun readStoredTransfer(transferId: String): OngoingTransfer? {
        val data = transferStore.getString(transferId, null) ?: return null
        return try {
            val obj = JSONObject(data)
            val destination = obj.optString("destination", "")
            val modelName = obj.optString("modelName", transferId)
            val url = if (obj.isNull("url")) null else obj.optString("url", null)
            OngoingTransfer(destination, modelName, url)
        } catch (_: Exception) {
            null
        }
    }

    private fun removeStoredTransfer(transferId: String) {
        transferStore.edit().remove(transferId).apply()
    }

    private fun restoreOngoingTransfers() {
        transferScope.launch(Dispatchers.IO) {
            try {
                val workManager = WorkManager.getInstance(reactApplicationContext)
                val workInfosFuture = workManager.getWorkInfosByTag(FileTransferWorker.WORK_TAG)
                val workInfos: List<WorkInfo> = workInfosFuture.get()
                val activeIds = mutableSetOf<String>()

                for (info in workInfos) {
                    if (info.state.isFinished) continue
                    val transferId = info.tags.firstOrNull { it != FileTransferWorker.WORK_TAG } ?: continue
                    activeIds += transferId
                    val stored = readStoredTransfer(transferId) ?: OngoingTransfer("", transferId, null)
                    ongoingTransfers[transferId] = stored
                }

                if (transferStore.all.isNotEmpty()) {
                    val editor = transferStore.edit()
                    var modified = false
                    for (entry in transferStore.all.keys) {
                        if (!activeIds.contains(entry)) {
                            editor.remove(entry)
                            modified = true
                        }
                    }
                    if (modified) editor.apply()
                }
            } catch (e: Exception) {
                Log.w(LOG_TAG, "Failed to restore transfers", e)
            }
        }
    }

    class TransferCancelledException : Exception("Transfer was cancelled")

    init {
        setupBroadcastReceiver()
        restoreOngoingTransfers()
    }

    private fun setupBroadcastReceiver() {
        progressReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
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

                        onTransferProgress(
                            transferId,
                            bytesWritten,
                            totalBytes,
                            speed,
                            progress,
                            modelName,
                            destination,
                            url
                        )
                    }
                    ACTION_TRANSFER_COMPLETE -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        val modelName = intent.getStringExtra("modelName")
                        val destination = intent.getStringExtra("destination")
                        val url = intent.getStringExtra("url")
                        val bytesWritten = intent.getLongExtra("bytesWritten", 0)
                        val totalBytes = intent.getLongExtra("totalBytes", bytesWritten)
                        onTransferComplete(transferId, modelName, destination, url, bytesWritten, totalBytes)
                    }
                    ACTION_TRANSFER_ERROR -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        val error = intent.getStringExtra("error") ?: "Unknown error"
                        val modelName = intent.getStringExtra("modelName")
                        val destination = intent.getStringExtra("destination")
                        val url = intent.getStringExtra("url")
                        val bytesWritten = intent.getLongExtra("bytesWritten", 0)
                        val totalBytes = intent.getLongExtra("totalBytes", 0)
                        onTransferError(transferId, error, modelName, destination, url, bytesWritten, totalBytes)
                    }
                    ACTION_TRANSFER_CANCELLED -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        val modelName = intent.getStringExtra("modelName")
                        val destination = intent.getStringExtra("destination")
                        val url = intent.getStringExtra("url")
                        val bytesWritten = intent.getLongExtra("bytesWritten", 0)
                        val totalBytes = intent.getLongExtra("totalBytes", 0)
                        onTransferCancelled(transferId, modelName, destination, url, bytesWritten, totalBytes)
                    }
                }
            }
        }

        val intentFilter = IntentFilter().apply {
            addAction(ACTION_TRANSFER_PROGRESS)
            addAction(ACTION_TRANSFER_COMPLETE)
            addAction(ACTION_TRANSFER_ERROR)
            addAction(ACTION_TRANSFER_CANCELLED)
        }

        LocalBroadcastManager.getInstance(reactApplicationContext)
            .registerReceiver(progressReceiver!!, intentFilter)
    }

    override fun getName(): String = MODULE_NAME

    override fun getConstants(): MutableMap<String, Any>? {
        return hashMapOf("supportsWebRTCEventEmitter" to true)
    }

    @ReactMethod
    fun addListener(eventName: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Int?) {
    }

    private fun emitEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun beginTransfer(
        url: String,
        destination: String,
        headers: ReadableMap?,
        promise: Promise
    ) {
        try {
            val transferId = System.currentTimeMillis().toString()

            val headersMap = hashMapOf<String, String>()
            headers?.let { h ->
                val iterator = h.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    val value = h.getString(key)
                    if (value != null) {
                        headersMap[key] = value
                    }
                }
            }

            val modelName = extractModelName(destination) ?: transferId

            val inputData = workDataOf(
                FileTransferWorker.KEY_URL to url,
                FileTransferWorker.KEY_DESTINATION to destination,
                FileTransferWorker.KEY_TRANSFER_ID to transferId,
                FileTransferWorker.KEY_HEADERS to headersMap.toString(),
                FileTransferWorker.KEY_MODEL_NAME to modelName
            )

            val transferRequest = OneTimeWorkRequestBuilder<FileTransferWorker>()
                .setInputData(inputData)
                .addTag(transferId)
                .addTag(FileTransferWorker.WORK_TAG)
                .build()

            WorkManager.getInstance(reactApplicationContext)
                .enqueue(transferRequest)

            val transferInfo = OngoingTransfer(destination, modelName, url)
            ongoingTransfers[transferId] = transferInfo
            storeTransfer(transferId, transferInfo)

            val result = Arguments.createMap().apply {
                putString("transferId", transferId)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to begin transfer", e)
            promise.reject("TRANSFER_START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun cancelTransfer(transferId: String, promise: Promise) {
        try {
            WorkManager.getInstance(reactApplicationContext)
                .cancelAllWorkByTag(transferId)

            ongoingTransfers.remove(transferId)
            removeStoredTransfer(transferId)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to cancel transfer", e)
            promise.reject("TRANSFER_CANCEL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getOngoingTransfers(promise: Promise) {
        try {
            transferScope.launch {
                try {
                    val workInfos: List<WorkInfo> = withContext(Dispatchers.IO) {
                        val workManager = WorkManager.getInstance(reactApplicationContext)
                        val workInfosFuture = workManager.getWorkInfosByTag(FileTransferWorker.WORK_TAG)
                        workInfosFuture.get()
                    }

                    val ongoingTransfersList = Arguments.createArray()

                    for (workInfo in workInfos) {
                        if (workInfo.state.isFinished) continue

                        val transferId = workInfo.tags.firstOrNull { it != FileTransferWorker.WORK_TAG } ?: continue
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
                        val totalBytes = progressData.getLong(FileTransferWorker.KEY_PROGRESS_TOTAL, 0L)
                        val progressPercent = progressData.getInt(FileTransferWorker.KEY_PROGRESS_PERCENT, 0)

                        val transferInfo = Arguments.createMap().apply {
                            putString("id", transferId)
                            putString("destination", destination)
                            putString("modelName", modelName)
                            url?.let { putString("url", it) }
                            putDouble("bytesWritten", bytesWritten.toDouble())
                            putDouble("totalBytes", totalBytes.toDouble())
                            putInt("progress", progressPercent)
                        }

                        ongoingTransfers[transferId] = OngoingTransfer(destination, modelName, url)
                        ongoingTransfersList.pushMap(transferInfo)
                    }

                    withContext(Dispatchers.Main) {
                        promise.resolve(ongoingTransfersList)
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        promise.reject("GET_TRANSFERS_FAILED", e.message, e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to get ongoing transfers", e)
            promise.reject("GET_TRANSFERS_FAILED", e.message, e)
        }
    }

    fun onTransferProgress(
        transferId: String,
        bytesWritten: Long,
        totalBytes: Long,
        speed: Long,
        progress: Int,
        modelName: String?,
        destination: String?,
        url: String?,
    ) {
        val transferInfo = ongoingTransfers[transferId]
        val resolvedModelName = modelName
            ?: transferInfo?.modelName
            ?: extractModelName(destination)
            ?: transferId
        val resolvedDestination = destination ?: transferInfo?.destination ?: ""
        val resolvedUrl = url ?: transferInfo?.url

        val transfer = OngoingTransfer(resolvedDestination, resolvedModelName, resolvedUrl)
        ongoingTransfers[transferId] = transfer
        storeTransfer(transferId, transfer)

        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("modelName", resolvedModelName)
            putString("destination", resolvedDestination)
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putDouble("speed", speed.toDouble())
            putDouble(
                "eta",
                if (speed > 0) (totalBytes - bytesWritten).toDouble() / speed else 0.0,
            )
            putInt("progress", progress)
        }

        emitEvent("onTransferProgress", params)
    }

    fun onTransferComplete(
        transferId: String,
        modelName: String?,
        destination: String?,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val transferInfo = ongoingTransfers.remove(transferId)
        val resolvedModelName = modelName
            ?: transferInfo?.modelName
            ?: extractModelName(destination)
            ?: transferId
        val resolvedDestination = destination ?: transferInfo?.destination
        val resolvedUrl = url ?: transferInfo?.url

        removeStoredTransfer(transferId)

        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("modelName", resolvedModelName)
            resolvedDestination?.let { putString("destination", it) }
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }

        emitEvent("onTransferComplete", params)
    }

    fun onTransferError(
        transferId: String,
        error: String,
        modelName: String?,
        destination: String?,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val transferInfo = ongoingTransfers.remove(transferId)
        val resolvedModelName = modelName
            ?: transferInfo?.modelName
            ?: extractModelName(destination)
            ?: transferId
        val resolvedDestination = destination ?: transferInfo?.destination
        val resolvedUrl = url ?: transferInfo?.url

        removeStoredTransfer(transferId)

        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("error", error)
            putString("modelName", resolvedModelName)
            resolvedDestination?.let { putString("destination", it) }
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }
        emitEvent("onTransferError", params)
    }
    
    fun onTransferCancelled(
        transferId: String,
        modelName: String?,
        destination: String?,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val transferInfo = ongoingTransfers.remove(transferId)
        val resolvedModelName = modelName
            ?: transferInfo?.modelName
            ?: extractModelName(destination)
            ?: transferId
        val resolvedDestination = destination ?: transferInfo?.destination
        val resolvedUrl = url ?: transferInfo?.url

        removeStoredTransfer(transferId)

        val params = Arguments.createMap().apply {
            putString("modelName", resolvedModelName)
            resolvedDestination?.let { putString("destination", it) }
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }
        emitEvent("onTransferCancelled", params)
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        transferScope.cancel()
        
        progressReceiver?.let { receiver ->
            LocalBroadcastManager.getInstance(reactApplicationContext)
                .unregisterReceiver(receiver)
        }
    }
}

class FileTransferWorker(
    context: Context,
    params: WorkerParameters
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
        private const val PROGRESS_UPDATE_INTERVAL = 500L
    }

        private fun extractModelName(path: String?): String? {
            if (path.isNullOrEmpty()) {
                return null
            }

            val normalised = if (path.startsWith("file://")) {
                path.substring(7)
            } else {
                path
            }

            val segments = normalised.split('/').filter { it.isNotEmpty() }
            return segments.lastOrNull()
        }

    private fun broadcastProgress(
        transferId: String,
        modelName: String,
        destination: String,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
        speed: Long,
        progress: Int,
    ) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_PROGRESS).apply {
            putExtra("transferId", transferId)
            putExtra("bytesWritten", bytesWritten)
            putExtra("totalBytes", totalBytes)
            putExtra("speed", speed)
            putExtra("progress", progress)
            putExtra("modelName", modelName)
            putExtra("destination", destination)
            url?.let { putExtra("url", it) }
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    private fun broadcastComplete(
        transferId: String,
        modelName: String,
        destination: String,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_COMPLETE).apply {
            putExtra("transferId", transferId)
            putExtra("modelName", modelName)
            putExtra("destination", destination)
            url?.let { putExtra("url", it) }
            putExtra("bytesWritten", bytesWritten)
            putExtra("totalBytes", totalBytes)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    private fun broadcastError(
        transferId: String,
        error: String,
        modelName: String,
        destination: String,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_ERROR).apply {
            putExtra("transferId", transferId)
            putExtra("error", error)
            putExtra("modelName", modelName)
            putExtra("destination", destination)
            url?.let { putExtra("url", it) }
            putExtra("bytesWritten", bytesWritten)
            putExtra("totalBytes", totalBytes)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }
    
    private fun broadcastCancelled(
        transferId: String,
        modelName: String,
        destination: String,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_CANCELLED).apply {
            putExtra("transferId", transferId)
            putExtra("modelName", modelName)
            putExtra("destination", destination)
            url?.let { putExtra("url", it) }
            putExtra("bytesWritten", bytesWritten)
            putExtra("totalBytes", totalBytes)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    private var lastBytesTransferred: Long = 0L
    private var lastTotalBytes: Long = 0L

    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL)
        val destination = inputData.getString(KEY_DESTINATION)
        val transferId = inputData.getString(KEY_TRANSFER_ID)
        val headersString = inputData.getString(KEY_HEADERS)
        val modelNameInput = inputData.getString(KEY_MODEL_NAME)

        if (url == null || destination == null || transferId == null) {
            return Result.failure()
        }

        val modelName = modelNameInput ?: extractModelName(destination) ?: transferId

        lastBytesTransferred = 0L
        lastTotalBytes = 0L

        try {
            setForeground(
                DownloadNotificationHelper.createForegroundInfo(
                    applicationContext,
                    transferId,
                    modelName,
                    0,
                    0,
                    0,
                ),
            )
        } catch (e: Exception) {
            Log.w(LOG_TAG, "Failed to set initial foreground notification", e)
        }

        return try {
            val (bytesWritten, totalBytes) = performFileTransfer(
                url,
                destination,
                transferId,
                headersString,
                modelName,
            )

            broadcastComplete(transferId, modelName, destination, url, bytesWritten, totalBytes)
            DownloadNotificationHelper.showCompletionNotification(applicationContext, transferId, modelName)
            Result.success()
        } catch (e: TransferModule.TransferCancelledException) {
            broadcastCancelled(transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes)
            DownloadNotificationHelper.cancelNotification(applicationContext, transferId)
            Result.success()
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Transfer failed", e)
            broadcastError(
                transferId,
                e.message ?: "Unknown error",
                modelName,
                destination,
                url,
                lastBytesTransferred,
                lastTotalBytes,
            )
            DownloadNotificationHelper.showFailureNotification(
                applicationContext,
                transferId,
                modelName,
                e.message,
            )
            Result.failure()
        }
    }

    private suspend fun performFileTransfer(
        urlString: String,
        destinationPath: String,
        transferId: String,
        headersString: String?,
        modelName: String,
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
                    Log.w(LOG_TAG, "Failed to parse headers: $headers", e)
                }
            }

            httpConnection.connectTimeout = 30000
            httpConnection.readTimeout = 30000
            
            httpConnection.connect()
            
            if (httpConnection.responseCode != HttpURLConnection.HTTP_OK) {
                throw IOException("HTTP error: ${httpConnection.responseCode} ${httpConnection.responseMessage}")
            }

            val totalFileSize = httpConnection.contentLength.toLong()
            dataInputStream = httpConnection.inputStream

            val actualDestinationPath = if (destinationPath.startsWith("file://")) {
                destinationPath.substring(7)
            } else {
                destinationPath
            }

            val destinationFile = File(actualDestinationPath)
            destinationFile.parentFile?.mkdirs()
            fileOutputStream = FileOutputStream(destinationFile)

            val dataBuffer = ByteArray(BUFFER_SIZE)
            var totalBytesTransferred = 0L
            var bytesRead: Int
            var lastProgressTimestamp = 0L
            val transferStartTime = System.currentTimeMillis()
            var lastNotificationTimestamp = 0L

            while (dataInputStream.read(dataBuffer).also { bytesRead = it } != -1) {
                if (isStopped) {
                    break
                }

                fileOutputStream.write(dataBuffer, 0, bytesRead)
                totalBytesTransferred += bytesRead

                val currentTimestamp = System.currentTimeMillis()
                if (currentTimestamp - lastProgressTimestamp >= PROGRESS_UPDATE_INTERVAL) {
                    val elapsedTime = currentTimestamp - transferStartTime
                    val transferSpeed = if (elapsedTime > 0) (totalBytesTransferred * 1000) / elapsedTime else 0L
                    val progressPercent = if (totalFileSize > 0) ((totalBytesTransferred * 100) / totalFileSize).toInt() else 0

                    try {
                        setProgress(
                            workDataOf(
                                KEY_PROGRESS_BYTES to totalBytesTransferred,
                                KEY_PROGRESS_TOTAL to totalFileSize,
                                KEY_PROGRESS_PERCENT to progressPercent
                            )
                        )
                    } catch (e: Exception) {
                        Log.w(LOG_TAG, "Failed to set progress", e)
                    }

                    lastBytesTransferred = totalBytesTransferred
                    lastTotalBytes = totalFileSize

                    broadcastProgress(
                        transferId,
                        modelName,
                        destinationPath,
                        urlString,
                        totalBytesTransferred,
                        totalFileSize,
                        transferSpeed,
                        progressPercent,
                    )
                    lastProgressTimestamp = currentTimestamp
                    if (currentTimestamp - lastNotificationTimestamp >= PROGRESS_UPDATE_INTERVAL) {
                        try {
                            setForeground(
                                DownloadNotificationHelper.createForegroundInfo(
                                    applicationContext,
                                    transferId,
                                    modelName,
                                    progressPercent,
                                    totalBytesTransferred,
                                    totalFileSize,
                                ),
                            )
                        } catch (e: Exception) {
                            Log.w(LOG_TAG, "Failed to update foreground notification", e)
                        }
                        lastNotificationTimestamp = currentTimestamp
                    }
                }
            }

            if (isStopped) {
                destinationFile.delete()
                throw TransferModule.TransferCancelledException()
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

    private fun parseHeaderString(headersString: String): Map<String, String> {
        return try {
            if (headersString.startsWith("{") && headersString.endsWith("}")) {
                val cleaned = headersString.substring(1, headersString.length - 1)
                val pairs = cleaned.split(", ")
                val headerMap = mutableMapOf<String, String>()
                
                for (pair in pairs) {
                    val keyValue = pair.split("=", limit = 2)
                    if (keyValue.size == 2) {
                        val key = keyValue[0].trim()
                        val value = keyValue[1].trim()
                        headerMap[key] = value
                    }
                }
                headerMap
            } else {
                emptyMap()
            }
        } catch (e: Exception) {
            Log.w(LOG_TAG, "Failed to parse headers string: $headersString", e)
            emptyMap()
        }
    }
}

class TransferPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(TransferModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
