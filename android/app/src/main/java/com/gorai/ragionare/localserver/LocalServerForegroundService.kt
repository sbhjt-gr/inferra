package com.gorai.ragionare.localserver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.gorai.ragionare.R

class LocalServerForegroundService : Service() {
    companion object {
        private const val notificationId = 8124
        private const val channelId = "local_server_foreground"
        private const val actionStart = "local_server_start"
        private const val actionStop = "local_server_stop"
        private const val actionUpdate = "local_server_update"
        private const val extraPort = "local_server_port"
        private const val extraUrl = "local_server_url"
        private const val extraPeerCount = "local_server_peers"

        fun startService(context: Context, port: Int, url: String?) {
            val intent = Intent(context, LocalServerForegroundService::class.java)
            intent.action = actionStart
            intent.putExtra(extraPort, port)
            intent.putExtra(extraUrl, url)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, LocalServerForegroundService::class.java)
            intent.action = actionStop
            context.startService(intent)
        }

        fun updateStatus(context: Context, peerCount: Int, url: String?) {
            val intent = Intent(context, LocalServerForegroundService::class.java)
            intent.action = actionUpdate
            intent.putExtra(extraPeerCount, peerCount)
            intent.putExtra(extraUrl, url)
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var currentPort: Int = 0
    private var currentUrl: String? = null
    private var currentPeerCount: Int = 0
    private var started = false

    override fun onCreate() {
        super.onCreate()
        createChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            actionStart -> handleStart(intent)
            actionStop -> handleStop()
            actionUpdate -> handleUpdate(intent)
            else -> {}
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        started = false
        super.onDestroy()
    }

    private fun handleStart(intent: Intent) {
        currentPort = intent.getIntExtra(extraPort, 0)
        currentUrl = intent.getStringExtra(extraUrl)
        currentPeerCount = 0
        started = true
        val notification = buildNotification()
        startForeground(notificationId, notification)
    }

    private fun handleStop() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun handleUpdate(intent: Intent) {
        if (!started) {
            return
        }
        currentPeerCount = intent.getIntExtra(extraPeerCount, currentPeerCount)
        currentUrl = intent.getStringExtra(extraUrl) ?: currentUrl
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, buildNotification())
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        } else {
            null
        }
        val contentParts = mutableListOf<String>()
        if (currentPeerCount > 0) {
            val peers = if (currentPeerCount == 1) "1 peer" else "$currentPeerCount peers"
            contentParts.add(peers)
        } else {
            contentParts.add("Waiting")
        }
        currentUrl?.let { contentParts.add(it) }
        val content = contentParts.joinToString(" • ")
        val builder = NotificationCompat.Builder(this, channelId)
        builder.setContentTitle("Inferra server active")
        builder.setContentText(content)
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(content))
        builder.setSmallIcon(R.mipmap.ic_launcher)
        builder.setOngoing(true)
        builder.setPriority(NotificationCompat.PRIORITY_LOW)
        builder.setCategory(NotificationCompat.CATEGORY_SERVICE)
        pendingIntent?.let { builder.setContentIntent(it) }
        return builder.build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(channelId, "Inferra Local Server", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Local server status"
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
    }

    private fun acquireWakeLock() {
        val manager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val lock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "InferraLocalServer")
        lock.setReferenceCounted(false)
        lock.acquire(10 * 60 * 60 * 1000L)
        wakeLock = lock
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }
}
