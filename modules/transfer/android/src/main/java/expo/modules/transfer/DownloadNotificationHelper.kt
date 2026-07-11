package expo.modules.transfer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.ForegroundInfo
import java.text.DecimalFormat
import java.util.concurrent.atomic.AtomicBoolean

object DownloadNotificationHelper {
  private const val CHANNEL_ID = "inferra.model.downloads"
  private const val CHANNEL_NAME = "Model Downloads"
  private const val CHANNEL_DESCRIPTION = "Download progress for Inferra models"
  private val channelCreated = AtomicBoolean(false)

  private fun ensureChannel(context: Context) {
    if (channelCreated.get()) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existingChannel = notificationManager.getNotificationChannel(CHANNEL_ID)

      if (existingChannel == null) {
        val channel = NotificationChannel(
          CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = CHANNEL_DESCRIPTION
          setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)
      }
    }

    channelCreated.set(true)
  }

  private fun createBaseBuilder(
    context: Context,
    transferId: String,
    modelName: String,
  ): NotificationCompat.Builder {
    ensureChannel(context)

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pendingIntent = if (launchIntent != null) {
      PendingIntent.getActivity(
        context,
        transferId.hashCode(),
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    } else null

    val iconResId = context.applicationInfo.icon.takeIf { it != 0 }
      ?: android.R.drawable.ic_dialog_info

    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(iconResId)
      .setContentTitle(modelName)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .apply { pendingIntent?.let { setContentIntent(it) } }
      .setOngoing(true)
  }

  private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt()
    val formatter = DecimalFormat("#,##0.##")
    return "${formatter.format(bytes / Math.pow(1024.0, digitGroups.toDouble()))} ${units[digitGroups]}"
  }

  fun createForegroundInfo(
    context: Context,
    transferId: String,
    modelName: String,
    progress: Int,
    bytesDownloaded: Long,
    totalBytes: Long,
  ): ForegroundInfo {
    val notification = createProgressNotification(
      context, transferId, modelName, progress, bytesDownloaded, totalBytes
    )
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    } else 0

    return if (type == 0) {
      ForegroundInfo(transferId.hashCode(), notification)
    } else {
      ForegroundInfo(transferId.hashCode(), notification, type)
    }
  }

  fun createProgressNotification(
    context: Context,
    transferId: String,
    modelName: String,
    progress: Int,
    bytesDownloaded: Long,
    totalBytes: Long,
  ): android.app.Notification {
    val clampedProgress = progress.coerceIn(0, 100)
    val builder = createBaseBuilder(context, transferId, modelName)
      .setOngoing(clampedProgress < 100)

    if (clampedProgress >= 100) {
      builder.setContentText("Download complete")
      builder.setProgress(0, 0, false)
    } else {
      val progressText = if (totalBytes > 0) {
        "${clampedProgress}% • ${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)}"
      } else {
        "${clampedProgress}%"
      }
      builder.setContentText(progressText)

      if (totalBytes > 0) {
        builder.setProgress(100, clampedProgress, false)
      } else {
        builder.setProgress(0, 0, true)
      }
    }

    return builder.build()
  }

  fun notifyProgress(
    context: Context,
    transferId: String,
    modelName: String,
    progress: Int,
    bytesDownloaded: Long,
    totalBytes: Long,
  ) {
    val notification = createProgressNotification(
      context, transferId, modelName, progress, bytesDownloaded, totalBytes
    )
    NotificationManagerCompat.from(context).notify(transferId.hashCode(), notification)
  }

  fun showCompletionNotification(context: Context, transferId: String, modelName: String) {
    cancelNotification(context, transferId)
  }

  fun showFailureNotification(
    context: Context,
    transferId: String,
    modelName: String,
    reason: String? = null,
  ) {
    val builder = createBaseBuilder(context, transferId, modelName)
      .setContentText(reason ?: "Download failed")
      .setProgress(0, 0, false)
      .setOngoing(false)

    NotificationManagerCompat.from(context).notify(transferId.hashCode(), builder.build())
  }

  fun showPausedNotification(
    context: Context,
    transferId: String,
    modelName: String,
    bytesDownloaded: Long,
    totalBytes: Long,
  ) {
    val progress = if (totalBytes > 0) {
      ((bytesDownloaded * 100) / totalBytes).toInt().coerceIn(0, 100)
    } else {
      0
    }
    val text = if (totalBytes > 0) {
      "Paused • $progress% • ${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)}"
    } else {
      "Paused"
    }
    val builder = createBaseBuilder(context, transferId, modelName)
      .setContentText(text)
      .setProgress(100, progress, false)
      .setOngoing(false)

    NotificationManagerCompat.from(context).notify(transferId.hashCode(), builder.build())
  }

  fun cancelNotification(context: Context, transferId: String) {
    NotificationManagerCompat.from(context).cancel(transferId.hashCode())
  }
}
