package expo.modules.vorianalarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/**
 * The day's summary as an alarm clock kept on the phone: it rings at the
 * chosen time and days even when the server sleeps or there is no internet,
 * lights the screen and opens Vorian, which then says the summary out loud.
 */
object BriefingScheduler {
  private const val PREFS = "vorian_briefing"
  const val CHANNEL_ID = "vorian_briefing"
  const val NOTIFICATION_ID = 7303
  private const val ALARM_REQUEST = 7301
  private const val OPEN_REQUEST = 7302
  const val BRIEFING_URL = "ping://briefing"

  fun save(context: Context, enabled: Boolean, hour: Int, minute: Int, days: List<Int>, title: String, body: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", enabled)
      .putInt("hour", hour)
      .putInt("minute", minute)
      .putString("days", days.joinToString(","))
      .putString("title", title)
      .putString("body", body)
      .apply()
  }

  fun openIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(BRIEFING_URL)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

  private fun openPending(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context,
      OPEN_REQUEST,
      openIntent(context),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun alarmPending(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, BriefingAlarmReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  /** Next moment at hour:minute on one of the chosen days (0 = Sunday), or null. */
  fun nextTime(now: Calendar, hour: Int, minute: Int, days: Set<Int>): Long? {
    if (days.isEmpty()) return null
    for (offset in 0..7) {
      val candidate = (now.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, offset)
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      val weekday = candidate.get(Calendar.DAY_OF_WEEK) - 1
      if (candidate.timeInMillis > now.timeInMillis && days.contains(weekday)) return candidate.timeInMillis
    }
    return null
  }

  /** Sets the next alarm from what was saved; returns its time, or null when off. */
  fun scheduleNext(context: Context): Long? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return null
    alarmManager.cancel(alarmPending(context))
    if (!prefs.getBoolean("enabled", false)) return null
    val days = (prefs.getString("days", "") ?: "")
      .split(",")
      .mapNotNull { it.trim().toIntOrNull() }
      .toSet()
    val at = nextTime(Calendar.getInstance(), prefs.getInt("hour", 8), prefs.getInt("minute", 0), days) ?: return null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmPending(context))
    } else {
      alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(at, openPending(context)), alarmPending(context))
    }
    return at
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    val channel = NotificationChannel(CHANNEL_ID, "Resumen del día", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Vorian te despierta con el resumen de tu día"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
      setSound(
        sound,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  fun ring(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    ensureChannel(context)
    val open = openPending(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(prefs.getString("title", "Vorian"))
      .setContentText(prefs.getString("body", "¿Te cuento tu día?"))
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .setTimeoutAfter(10 * 60 * 1000L)
      .build()
    // Keeps ringing like an alarm until Vorian opens or it is dismissed.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // Notifications are off for Vorian; nothing to show.
    }
  }

  fun dismiss(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }
}
