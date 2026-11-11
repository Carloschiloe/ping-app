package expo.modules.vorianalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The alarm went off: ring, light the screen, and set the next one. */
class BriefingAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    BriefingScheduler.ring(context)
    BriefingScheduler.scheduleNext(context)
  }
}

/** Alarms are forgotten when the phone restarts or the app updates; set it again. */
class BriefingBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      BriefingScheduler.scheduleNext(context)
    }
  }
}
