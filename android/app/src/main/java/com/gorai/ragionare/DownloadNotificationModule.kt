package com.gorai.ragionare

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import android.graphics.Color
import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap

@ReactModule(name = DownloadNotificationModule.NAME)
class DownloadNotificationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "DownloadNotificationModule"
        private const val CHANNEL_ID = "model_downloads"
        private const val CHANNEL_NAME = "Model Downloads"
    }

    private val notificationManager: NotificationManager by lazy {
        reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    private val activeNotifications = ConcurrentHashMap<String, Int>()
    private val handler = Handler(Looper.getMainLooper())

    init {
        createNotificationChannel()
    }

    override fun getName(): String = NAME

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifications for model downloads"
                enableLights(true)
                lightColor = Color.BLUE
                setShowBadge(true)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    @ReactMethod
    fun showDownloadNotification(modelName: String, downloadId: String, progress: Int, promise: Promise) {
        try {
            val notificationId = downloadId.hashCode()
            
            // Create intent for when notification is tapped
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(reactApplicationContext.packageName)
            val pendingIntent = PendingIntent.getActivity(
                reactApplicationContext,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Build the notification
            val builder = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Downloading $modelName")
                .setContentText("Download in progress")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pendingIntent)

            // Add progress
            if (progress < 100) {
                builder.setProgress(100, progress, false)
            } else {
                // Download complete
                builder.setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Download Complete")
                    .setContentText("$modelName has been downloaded")
                    .setProgress(0, 0, false)
                    .setOngoing(false)
                    .setAutoCancel(true)
                
                // Schedule removal of notification after 5 seconds
                handler.postDelayed({
                    activeNotifications.remove(downloadId)
                    notificationManager.cancel(notificationId)
                }, 5000)
            }

            // Show the notification
            notificationManager.notify(notificationId, builder.build())
            activeNotifications[downloadId] = notificationId
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to show download notification: ${e.message}")
        }
    }

    @ReactMethod
    fun cancelNotification(downloadId: String, promise: Promise) {
        try {
            // Try to get the notification ID from active notifications
            val notificationId = activeNotifications[downloadId] ?: downloadId.hashCode()
            
            // Cancel the notification
            notificationManager.cancel(notificationId)
            activeNotifications.remove(downloadId)
            
            // Remove any pending removal callbacks
            handler.removeCallbacksAndMessages(null)
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to cancel notification: ${e.message}")
        }
    }

    @ReactMethod
    fun updateDownloadProgress(downloadId: String, progress: Int, promise: Promise) {
        try {
            val notificationId = activeNotifications[downloadId] ?: downloadId.hashCode()
            
            // Get existing notification
            val builder = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Downloading Model")
                .setContentText("Download in progress: $progress%")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(100, progress, false)

            // Update the notification
            notificationManager.notify(notificationId, builder.build())
            activeNotifications[downloadId] = notificationId
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to update notification: ${e.message}")
        }
    }
} 