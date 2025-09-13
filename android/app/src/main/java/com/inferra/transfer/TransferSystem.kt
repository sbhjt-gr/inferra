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

class TransferModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private val ongoingTransfers = ConcurrentHashMap<String, String>()
    private val transferScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var progressReceiver: BroadcastReceiver? = null
    
    companion object {
        private const val LOG_TAG = "TransferModule"
        const val MODULE_NAME = "TransferModule"
        const val ACTION_TRANSFER_PROGRESS = "com.inferra.transfer.PROGRESS"
        const val ACTION_TRANSFER_COMPLETE = "com.inferra.transfer.COMPLETE" 
        const val ACTION_TRANSFER_ERROR = "com.inferra.transfer.ERROR"
        const val ACTION_TRANSFER_CANCELLED = "com.inferra.transfer.CANCELLED"
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
                        
                        onTransferProgress(transferId, bytesWritten, totalBytes, speed)
                    }
                    ACTION_TRANSFER_COMPLETE -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        onTransferComplete(transferId)
                    }
                    ACTION_TRANSFER_ERROR -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        val error = intent.getStringExtra("error") ?: "Unknown error"
                        onTransferError(transferId, error)
                    }
                    ACTION_TRANSFER_CANCELLED -> {
                        val transferId = intent.getStringExtra("transferId") ?: return
                        onTransferCancelled(transferId)
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

            val inputData = workDataOf(
                FileTransferWorker.KEY_URL to url,
                FileTransferWorker.KEY_DESTINATION to destination,
                FileTransferWorker.KEY_TRANSFER_ID to transferId,
                FileTransferWorker.KEY_HEADERS to headersMap.toString()
            )

            val transferRequest = OneTimeWorkRequestBuilder<FileTransferWorker>()
                .setInputData(inputData)
                .addTag(transferId)
                .build()

            WorkManager.getInstance(reactApplicationContext)
                .enqueue(transferRequest)

            ongoingTransfers[transferId] = destination

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
                    val ongoingTransfersList = Arguments.createArray()
                    
                    for ((transferId, destination) in ongoingTransfers) {
                        val transferInfo = Arguments.createMap().apply {
                            putString("id", transferId)
                            putString("destination", destination)
                            putInt("bytesWritten", 0)
                            putInt("totalBytes", 0)
                            putInt("progress", 0)
                        }
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

    fun onTransferProgress(transferId: String, bytesWritten: Long, totalBytes: Long, speed: Long) {
        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putDouble("speed", speed.toDouble())
            putDouble("eta", if (speed > 0) (totalBytes - bytesWritten).toDouble() / speed else 0.0)
        }
        
        emitEvent("onTransferProgress", params)
    }

    fun onTransferComplete(transferId: String) {
        ongoingTransfers.remove(transferId)
        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
        }
        emitEvent("onTransferComplete", params)
    }

    fun onTransferError(transferId: String, error: String) {
        ongoingTransfers.remove(transferId)
        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
            putString("error", error)
        }
        emitEvent("onTransferError", params)
    }
    
    fun onTransferCancelled(transferId: String) {
        ongoingTransfers.remove(transferId)
        val params = Arguments.createMap().apply {
            putString("downloadId", transferId)
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
        private const val BUFFER_SIZE = 8192
        private const val PROGRESS_UPDATE_INTERVAL = 500L
    }

    private fun broadcastProgress(transferId: String, bytesWritten: Long, totalBytes: Long, speed: Long) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_PROGRESS).apply {
            putExtra("transferId", transferId)
            putExtra("bytesWritten", bytesWritten)
            putExtra("totalBytes", totalBytes)
            putExtra("speed", speed)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    private fun broadcastComplete(transferId: String) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_COMPLETE).apply {
            putExtra("transferId", transferId)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    private fun broadcastError(transferId: String, error: String) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_ERROR).apply {
            putExtra("transferId", transferId)
            putExtra("error", error)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }
    
    private fun broadcastCancelled(transferId: String) {
        val intent = Intent(TransferModule.ACTION_TRANSFER_CANCELLED).apply {
            putExtra("transferId", transferId)
        }
        
        LocalBroadcastManager.getInstance(applicationContext)
            .sendBroadcast(intent)
    }

    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL)
        val destination = inputData.getString(KEY_DESTINATION) 
        val transferId = inputData.getString(KEY_TRANSFER_ID)
        val headersString = inputData.getString(KEY_HEADERS)

        if (url == null || destination == null || transferId == null) {
            return Result.failure()
        }

        return try {
            performFileTransfer(url, destination, transferId, headersString)
            broadcastComplete(transferId)
            Result.success()
        } catch (e: TransferModule.TransferCancelledException) {
            broadcastCancelled(transferId)
            Result.success()
        } catch (e: Exception) {
            broadcastError(transferId, e.message ?: "Unknown error")
            Result.failure()
        }
    }

    private suspend fun performFileTransfer(
        urlString: String,
        destinationPath: String,
        transferId: String,
        headersString: String?
    ) = withContext(Dispatchers.IO) {
        
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
                destinationPath.substring(7) // Remove "file://" prefix
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
                                "bytesWritten" to totalBytesTransferred.toInt(),
                                "totalBytes" to totalFileSize.toInt(),
                                "progress" to progressPercent
                            )
                        )
                    } catch (e: Exception) {
                        Log.w(LOG_TAG, "Failed to set progress", e)
                    }

                    broadcastProgress(transferId, totalBytesTransferred, totalFileSize, transferSpeed)
                    lastProgressTimestamp = currentTimestamp
                }
            }

            if (isStopped) {
                destinationFile.delete()
                throw TransferModule.TransferCancelledException()
            }

            fileOutputStream.flush()

        } finally {
            dataInputStream?.close()
            fileOutputStream?.close()
            httpConnection?.disconnect()
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
