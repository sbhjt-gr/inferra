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

    // Track active downloads and their pause state
    private val activeDownloadStates = ConcurrentHashMap<String, Pair<Int, Boolean>>()

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

            // Create action intents
            val actionIntents = createActionIntents(modelName, downloadId, progress)

            // Build the notification
            val builder = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Downloading $modelName")
                .setContentText("Download in progress")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pendingIntent)

            // Add actions for in-progress downloads
            if (progress < 100) {
                builder.setProgress(100, progress, false)
                
                // Add cancel action
                builder.addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Cancel",
                    actionIntents.cancelIntent
                )
                
                // Add pause/resume action based on current state
                if (actionIntents.isPaused) {
                    builder.addAction(
                        android.R.drawable.ic_media_play,
                        "Resume",
                        actionIntents.resumeIntent
                    )
                } else {
                    builder.addAction(
                        android.R.drawable.ic_media_pause,
                        "Pause",
                        actionIntents.pauseIntent
                    )
                }
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

    private data class ActionIntents(
        val pauseIntent: PendingIntent,
        val resumeIntent: PendingIntent,
        val cancelIntent: PendingIntent,
        val isPaused: Boolean
    )

    private fun createActionIntents(modelName: String, downloadId: String, progress: Int): ActionIntents {
        // Get current pause state from progress updates
        val isPaused = activeDownloadStates[downloadId]?.second ?: false
        
        // Create cancel intent
        val cancelIntent = Intent(reactApplicationContext, NotificationActionReceiver::class.java).apply {
            action = "com.gorai.ragionare.CANCEL_DOWNLOAD"
            putExtra("downloadId", downloadId)
            putExtra("modelName", modelName)
        }
        val cancelPendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext,
            "${downloadId}_cancel".hashCode(),
            cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create pause intent
        val pauseIntent = Intent(reactApplicationContext, NotificationActionReceiver::class.java).apply {
            action = "com.gorai.ragionare.PAUSE_DOWNLOAD"
            putExtra("downloadId", downloadId)
            putExtra("modelName", modelName)
        }
        val pausePendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext,
            "${downloadId}_pause".hashCode(),
            pauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create resume intent
        val resumeIntent = Intent(reactApplicationContext, NotificationActionReceiver::class.java).apply {
            action = "com.gorai.ragionare.RESUME_DOWNLOAD"
            putExtra("downloadId", downloadId)
            putExtra("modelName", modelName)
        }
        val resumePendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext,
            "${downloadId}_resume".hashCode(),
            resumeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return ActionIntents(
            pauseIntent = pausePendingIntent,
            resumeIntent = resumePendingIntent,
            cancelIntent = cancelPendingIntent,
            isPaused = isPaused
        )
    }

    @ReactMethod
    fun cancelNotification(downloadId: String, promise: Promise) {
        try {
            val notificationId = activeNotifications[downloadId]
            if (notificationId != null) {
                notificationManager.cancel(notificationId)
                activeNotifications.remove(downloadId)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to cancel notification: ${e.message}")
        }
    }

    // Update download state when progress updates
    @ReactMethod
    fun updateDownloadProgress(downloadId: String, progress: Int, isPaused: Boolean, promise: Promise) {
        try {
            // Store current state
            activeDownloadStates[downloadId] = Pair(progress, isPaused)
            
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

            // Create action intents with updated pause state
            val modelName = "Model" // Fallback name, this would be better if you passed the model name
            val actionIntents = createActionIntents(modelName, downloadId, progress)
            
            // Add cancel action
            builder.addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Cancel",
                actionIntents.cancelIntent
            )
            
            // Add pause/resume action based on current state
            if (isPaused) {
                builder.addAction(
                    android.R.drawable.ic_media_play,
                    "Resume",
                    actionIntents.resumeIntent
                )
            } else {
                builder.addAction(
                    android.R.drawable.ic_media_pause,
                    "Pause",
                    actionIntents.pauseIntent
                )
            }

            // Update the notification
            notificationManager.notify(notificationId, builder.build())
            activeNotifications[downloadId] = notificationId
            
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to update notification: ${e.message}")
        }
    }
} 