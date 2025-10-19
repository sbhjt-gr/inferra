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
import android.os.Build
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import com.gorai.ragionare.notifications.DownloadNotificationHelper

class TransferModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    data class OngoingTransfer(val destination: String, val modelName: String, val url: String?, val headers: String?)

    private val ongoingTransfers = ConcurrentHashMap<String, OngoingTransfer>()
    private val transferScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var progressReceiver: BroadcastReceiver? = null
    
    companion object {
        private const val LOG_TAG = "TransferModule"
        const val MODULE_NAME = "TransferModule"
        const val ACTION_TRANSFER_PROGRESS = "com.inferra.transfer.PROGRESS"
        const val ACTION_TRANSFER_COMPLETE = "com.inferra.transfer.COMPLETE" 
        const val ACTION_TRANSFER_ERROR = "com.inferra.transfer.ERROR"
        const val ACTION_TRANSFER_CANCELLED = "com.inferra.transfer.CANCELLED"
        const val ACTION_TRANSFER_PAUSED = "com.inferra.transfer.PAUSED"
        private val pausedTransfers = ConcurrentHashMap<String, Boolean>()
        restoreOngoingTransfers()

        fun markPaused(transferId: String) {
            pausedTransfers[transferId] = true
        }

        fun isPaused(transferId: String): Boolean {
            return pausedTransfers[transferId] == true
        }

        fun clearPaused(transferId: String) {
            pausedTransfers.remove(transferId)
        }
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

    private fun restoreOngoingTransfers() {
        transferScope.launch(Dispatchers.IO) {
            try {
                val workInfos = WorkManager.getInstance(reactApplicationContext)
                    .getWorkInfosByTag(FileTransferWorker.WORK_TAG)
                    .get()

                for (info in workInfos) {
                    if (info.state.isFinished) continue

                    val transferId = info.inputData.getString(FileTransferWorker.KEY_TRANSFER_ID) ?: continue
                    val destination = info.inputData.getString(FileTransferWorker.KEY_DESTINATION) ?: ""
                    val modelName = info.inputData.getString(FileTransferWorker.KEY_MODEL_NAME)
                        ?: extractModelName(destination)
                        ?: transferId
                    val url = info.inputData.getString(FileTransferWorker.KEY_URL)
                    val headers = info.inputData.getString(FileTransferWorker.KEY_HEADERS)

                    ongoingTransfers[transferId] = OngoingTransfer(destination, modelName, url, headers)
                }
            } catch (e: Exception) {
                Log.w(LOG_TAG, "Failed to restore transfers", e)
            }
        }
    }

    class TransferCancelledException : Exception("Transfer was cancelled")

    init {
        setupBroadcastReceiver()
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
                    ACTION_TRANSFER_PAUSED -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        val modelName = intent.getStringExtra("modelName")
                        val destination = intent.getStringExtra("destination")
                        val url = intent.getStringExtra("url")
                        val bytesWritten = intent.getLongExtra("bytesWritten", 0)
                        val totalBytes = intent.getLongExtra("totalBytes", 0)
                        onTransferPaused(transferId, modelName, destination, url, bytesWritten, totalBytes)
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

        LocalBroadcastManager.getInstance(reactApplicationContext)
            .registerReceiver(progressReceiver!!, intentFilter)
    }

    override fun getName(): String = MODULE_NAME

    override fun getConstants(): MutableMap<String, Any>? {
        return hashMapOf("supportsWebRTCEventEmitter" to true)
    }

    @ReactMethod
    fun addListener(eventName: String?) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int?) {
        // Required for NativeEventEmitter  
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
            val headersString = headersMap.toString()

            val modelName = extractModelName(destination) ?: transferId

            val inputData = workDataOf(
                FileTransferWorker.KEY_URL to url,
                FileTransferWorker.KEY_DESTINATION to destination,
                FileTransferWorker.KEY_TRANSFER_ID to transferId,
                FileTransferWorker.KEY_HEADERS to headersString,
                FileTransferWorker.KEY_MODEL_NAME to modelName
            )

            val transferRequest = OneTimeWorkRequestBuilder<FileTransferWorker>()
                .setInputData(inputData)
                .addTag(transferId)
                .addTag(FileTransferWorker.WORK_TAG)
                .build()

            WorkManager.getInstance(reactApplicationContext)
                .enqueue(transferRequest)

            ongoingTransfers[transferId] = OngoingTransfer(destination, modelName, url, headersString)

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
            clearPaused(transferId)
            promise.resolve(null)
            
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to cancel transfer", e)
            promise.reject("TRANSFER_CANCEL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun pauseTransfer(transferId: String, promise: Promise) {
        try {
            val transferInfo = ongoingTransfers[transferId]
            if (transferInfo == null) {
                promise.resolve(false)
                return
            }

            markPaused(transferId)
            WorkManager.getInstance(reactApplicationContext)
                .cancelAllWorkByTag(transferId)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to pause transfer", e)
            promise.reject("TRANSFER_PAUSE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun resumeTransfer(transferId: String, promise: Promise) {
        try {
            val transferInfo = ongoingTransfers[transferId]
            val destination = transferInfo?.destination
            val url = transferInfo?.url
            if (transferInfo == null || destination.isNullOrEmpty() || url.isNullOrEmpty()) {
                promise.reject("TRANSFER_RESUME_FAILED", "Missing transfer metadata", null)
                return
            }

            val destinationPath = destination
            val destinationFile = if (destinationPath.startsWith("file://")) {
                java.io.File(destinationPath.substring(7))
            } else {
                java.io.File(destinationPath)
            }
            val resumeBytes = if (destinationFile.exists()) destinationFile.length() else 0L

            clearPaused(transferId)

            val inputData = workDataOf(
                FileTransferWorker.KEY_URL to url,
                FileTransferWorker.KEY_DESTINATION to destinationPath,
                FileTransferWorker.KEY_TRANSFER_ID to transferId,
                FileTransferWorker.KEY_HEADERS to (transferInfo.headers ?: "{}"),
                FileTransferWorker.KEY_MODEL_NAME to transferInfo.modelName,
                FileTransferWorker.KEY_RESUME_BYTES to resumeBytes
            )

            val transferRequest = OneTimeWorkRequestBuilder<FileTransferWorker>()
                .setInputData(inputData)
                .addTag(transferId)
                .addTag(FileTransferWorker.WORK_TAG)
                .build()

            WorkManager.getInstance(reactApplicationContext)
                .enqueue(transferRequest)

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(LOG_TAG, "Failed to resume transfer", e)
            promise.reject("TRANSFER_RESUME_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getOngoingTransfers(promise: Promise) {
        try {
            transferScope.launch {
                try {
                    val workInfos = withContext(Dispatchers.IO) {
                        WorkManager.getInstance(reactApplicationContext)
                            .getWorkInfosByTag(FileTransferWorker.WORK_TAG)
                            .get()
                    }

                    val ongoingTransfersList = Arguments.createArray()

                    workInfos
                        .filter { !it.state.isFinished }
                        .forEach { workInfo ->
                            val transferId = workInfo.inputData.getString(FileTransferWorker.KEY_TRANSFER_ID) ?: return@forEach
                            val destination = workInfo.inputData.getString(FileTransferWorker.KEY_DESTINATION) ?: ""
                            val modelName = workInfo.inputData.getString(FileTransferWorker.KEY_MODEL_NAME)
                                ?: extractModelName(destination)
                                ?: transferId
                            val url = workInfo.inputData.getString(FileTransferWorker.KEY_URL)
                            val headers = workInfo.inputData.getString(FileTransferWorker.KEY_HEADERS)

                            val progressData = workInfo.progress
                            val bytesWritten = progressData.getLong(FileTransferWorker.KEY_PROGRESS_BYTES, 0L)
                            val totalBytes = progressData.getLong(FileTransferWorker.KEY_PROGRESS_TOTAL, 0L)
                            val progressPercent = progressData.getInt(FileTransferWorker.KEY_PROGRESS_PERCENT, 0)

                            val transferInfo = Arguments.createMap().apply {
                                putString("id", transferId)
                                putString("destination", destination)
                                putString("modelName", modelName)
                                if (!url.isNullOrEmpty()) {
                                    putString("url", url)
                                }
                                putDouble("bytesWritten", bytesWritten.toDouble())
                                putDouble("totalBytes", totalBytes.toDouble())
                                putInt("progress", progressPercent)
                            }

                            ongoingTransfers[transferId] = OngoingTransfer(destination, modelName, url, headers)
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
    val resolvedHeaders = transferInfo?.headers

    ongoingTransfers[transferId] = OngoingTransfer(resolvedDestination, resolvedModelName, resolvedUrl, resolvedHeaders)

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

        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("modelName", resolvedModelName)
            resolvedDestination?.let { putString("destination", it) }
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }
        emitEvent("onTransferCancelled", params)
    }

    fun onTransferPaused(
        transferId: String,
        modelName: String?,
        destination: String?,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val transferInfo = ongoingTransfers[transferId]
        val resolvedModelName = modelName
            ?: transferInfo?.modelName
            ?: extractModelName(destination)
            ?: transferId
        val resolvedDestination = destination ?: transferInfo?.destination
        val resolvedUrl = url ?: transferInfo?.url

    val headers = transferInfo?.headers
    ongoingTransfers[transferId] = OngoingTransfer(resolvedDestination ?: "", resolvedModelName, resolvedUrl, headers)

        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("modelName", resolvedModelName)
            resolvedDestination?.let { putString("destination", it) }
            resolvedUrl?.let { putString("url", it) }
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
        }
        emitEvent("onTransferPaused", params)
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
        const val KEY_RESUME_BYTES = "resumeBytes"
        const val WORK_TAG = "inferra_file_transfer"
        private const val BUFFER_SIZE = 8192
        private const val PROGRESS_UPDATE_INTERVAL = 500L
    }

    class TransferPausedException : Exception("Transfer was paused")

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

    private fun broadcastPaused(
        transferId: String,
        modelName: String,
        destination: String,
        url: String?,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_PAUSED).apply {
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
        val resumeBytesInput = inputData.getLong(KEY_RESUME_BYTES, 0L)

        if (url == null || destination == null || transferId == null) {
            return Result.failure()
        }

        val modelName = modelNameInput ?: extractModelName(destination) ?: transferId

        lastBytesTransferred = resumeBytesInput
        lastTotalBytes = 0L

        try {
            setForeground(
                DownloadNotificationHelper.createForegroundInfo(
                    applicationContext,
                    transferId,
                    modelName,
                    if (resumeBytesInput > 0) 1 else 0,
                    resumeBytesInput,
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
                resumeBytesInput,
            )

            broadcastComplete(transferId, modelName, destination, url, bytesWritten, totalBytes)
            DownloadNotificationHelper.showCompletionNotification(applicationContext, transferId, modelName)
            Result.success()
        } catch (e: TransferPausedException) {
            broadcastPaused(transferId, modelName, destination, url, lastBytesTransferred, lastTotalBytes)
            DownloadNotificationHelper.showPausedNotification(
                applicationContext,
                transferId,
                modelName,
                lastBytesTransferred,
                lastTotalBytes,
            )
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
        resumeBytes: Long,
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

            var effectiveResumeBytes = if (resumeBytes > 0) resumeBytes else 0L
            if (effectiveResumeBytes > 0) {
                httpConnection.setRequestProperty("Range", "bytes=$effectiveResumeBytes-")
            }

            httpConnection.connectTimeout = 30000
            httpConnection.readTimeout = 30000
            
            httpConnection.connect()

            val responseCode = httpConnection.responseCode
            val actualDestinationPath = if (destinationPath.startsWith("file://")) {
                destinationPath.substring(7)
            } else {
                destinationPath
            }
            val destinationFile = File(actualDestinationPath)

            if (effectiveResumeBytes > 0 && responseCode == HttpURLConnection.HTTP_OK) {
                if (destinationFile.exists()) {
                    destinationFile.delete()
                }
                effectiveResumeBytes = 0L
            }

            if (responseCode != HttpURLConnection.HTTP_OK && responseCode != HttpURLConnection.HTTP_PARTIAL) {
                throw IOException("HTTP error: ${httpConnection.responseCode} ${httpConnection.responseMessage}")
            }

            val contentRange = httpConnection.getHeaderField("Content-Range")
            val parsedTotal = contentRange?.substringAfterLast("/")?.toLongOrNull()
            val contentLength = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                httpConnection.contentLengthLong
            } else {
                httpConnection.contentLength.toLong()
            }

            val totalFileSize = when {
                parsedTotal != null -> parsedTotal
                contentLength > 0 -> if (effectiveResumeBytes > 0) effectiveResumeBytes + contentLength else contentLength
                else -> 0L
            }

            dataInputStream = httpConnection.inputStream

            destinationFile.parentFile?.mkdirs()
            val append = effectiveResumeBytes > 0 && destinationFile.exists()
            fileOutputStream = FileOutputStream(destinationFile, append)

            val dataBuffer = ByteArray(BUFFER_SIZE)
            var totalBytesTransferred = effectiveResumeBytes
            var bytesRead: Int
            var lastProgressTimestamp = 0L
            val transferStartTime = System.currentTimeMillis()
            var lastNotificationTimestamp = 0L

            lastBytesTransferred = effectiveResumeBytes
            lastTotalBytes = totalFileSize

            while (dataInputStream.read(dataBuffer).also { bytesRead = it } != -1) {
                if (isStopped) {
                    if (TransferModule.isPaused(transferId)) {
                        throw TransferPausedException()
                    }
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
                if (TransferModule.isPaused(transferId)) {
                    throw TransferPausedException()
                }
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
