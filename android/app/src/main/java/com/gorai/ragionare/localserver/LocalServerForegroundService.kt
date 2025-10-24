package com.gorai.ragionare.localserver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.gorai.ragionare.R

class LocalServerForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val broadcastManager by lazy { LocalBroadcastManager.getInstance(this) }
  private val maintenanceTask = object : Runnable {
    override fun run() {
      val intent = Intent(ACTION_MAINTENANCE)
      broadcastManager.sendBroadcast(intent)
      handler.postDelayed(this, INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    createChannel()
    startForeground(NOTIFICATION_ID, buildNotification())
    handler.post(maintenanceTask)
    isRunning = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    isRunning = true
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(maintenanceTask)
    isRunning = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun buildNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(getString(R.string.app_name))
      .setContentText("Local server active")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
      manager?.createNotificationChannel(channel)
    }
  }

  companion object {
    const val CHANNEL_ID = "local_server_channel"
    const val CHANNEL_NAME = "Local Server"
    const val NOTIFICATION_ID = 9234
    const val ACTION_MAINTENANCE = "com.gorai.ragionare.localserver.MAINTENANCE"
    const val INTERVAL_MS = 45000L
    @Volatile
    var isRunning = false
  }
}
