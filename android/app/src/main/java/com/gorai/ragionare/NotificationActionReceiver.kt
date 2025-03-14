package com.gorai.ragionare

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NotificationActionReceiver : BroadcastReceiver() {

    private fun handleAction(context: Context, downloadId: String, modelName: String, actionType: String) {
        val reactContext = (context.applicationContext as? ReactApplication)
            ?.reactNativeHost
            ?.reactInstanceManager
            ?.currentReactContext
            ?: return

        // For resume action, actually resume the download via ModelDownloaderModule
        if (actionType == "resume") {
            val modelDownloaderModule = reactContext.getNativeModule(ModelDownloaderModule::class.java)
            modelDownloaderModule?.let {
                try {
                    // Resume the download and get the new download ID
                    val result = it.resumeDownloadFromNotification(downloadId, modelName)
                    
                    // The event will be emitted by the resumeDownloadFromNotification method
                    return
                } catch (e: Exception) {
                    // If resume fails, continue with the standard event emission
                    println("Error resuming download from notification: ${e.message}")
                }
            }
        }

        // Standard event emission for other actions or if resume failed
        val params = Arguments.createMap().apply {
            putString("modelName", modelName)
            putString("downloadId", downloadId)
            putInt("progress", 0)
            putBoolean("isCompleted", false)
            putBoolean("isPaused", actionType == "pause")
            putString("source", "notification_${actionType}")
        }

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("downloadProgress", params)
    }

    override fun onReceive(context: Context, intent: Intent) {
        val downloadId = intent.getStringExtra("downloadId") ?: return
        val modelName = intent.getStringExtra("modelName") ?: return

        when (intent.action) {
            "com.gorai.ragionare.PAUSE_DOWNLOAD" -> {
                handleAction(context, downloadId, modelName, "pause")
            }
            "com.gorai.ragionare.RESUME_DOWNLOAD" -> {
                handleAction(context, downloadId, modelName, "resume")
            }
            "com.gorai.ragionare.CANCEL_DOWNLOAD" -> {
                handleAction(context, downloadId, modelName, "cancel")
            }
        }
    }

    private fun getApplicationName(context: Context): String {
        val applicationInfo = context.applicationInfo
        val stringId = applicationInfo.labelRes
        return if (stringId == 0) {
            applicationInfo.nonLocalizedLabel.toString()
        } else {
            context.getString(stringId)
        }
    }
}