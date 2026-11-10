package expo.modules.vorianalarm

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

internal object VorianActivity {
  var current: WeakReference<Activity>? = null

  /** Only while the summary is being said: Vorian over the lock screen, screen on. */
  fun showOverLockScreen(activity: Activity, show: Boolean) {
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(show)
        activity.setTurnScreenOn(show)
      }
    }
  }
}

class VorianAlarmLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    if (activity == null) return
    VorianActivity.current = WeakReference(activity)
    handle(activity, activity.intent)
  }

  override fun onResume(activity: Activity?) {
    if (activity != null) VorianActivity.current = WeakReference(activity)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    val activity = VorianActivity.current?.get() ?: return false
    handle(activity, intent)
    return false
  }

  private fun handle(activity: Activity, intent: Intent?) {
    if (intent?.data?.toString() != BriefingScheduler.BRIEFING_URL) return
    BriefingScheduler.dismiss(activity)
    VorianActivity.showOverLockScreen(activity, true)
  }
}
