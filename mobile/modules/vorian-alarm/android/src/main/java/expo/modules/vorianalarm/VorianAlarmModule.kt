package expo.modules.vorianalarm

import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VorianAlarmModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "No context" }

  override fun definition() = ModuleDefinition {
    Name("VorianAlarm")

    /** Saves the summary time and days and sets the next alarm. Returns its time in ms, or null. */
    Function("configureBriefing") { enabled: Boolean, hour: Int, minute: Int, days: List<Int>, title: String, body: String ->
      BriefingScheduler.save(context, enabled, hour, minute, days, title, body)
      BriefingScheduler.scheduleNext(context)?.toDouble()
    }

    /** The summary is over: Vorian no longer shows over the lock screen. */
    Function("releaseLockScreen") {
      BriefingScheduler.dismiss(context)
      VorianActivity.current?.get()?.let { VorianActivity.showOverLockScreen(it, false) }
    }

    /** Android 14+ asks the person to allow full-screen alarms for each app. */
    Function("canUseFullScreen") {
      if (Build.VERSION.SDK_INT >= 34) {
        context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false
      } else {
        true
      }
    }

    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    /** "Hablar con Vorian" when pressing and holding the app icon. */
    Function("setVoiceShortcut") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
        val manager = context.getSystemService(ShortcutManager::class.java) ?: return@Function false
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("ping://voz")).setPackage(context.packageName)
        val shortcut = ShortcutInfo.Builder(context, "vorian_voice")
          .setShortLabel("Hablar con Vorian")
          .setLongLabel("Hablar con Vorian")
          .setIcon(Icon.createWithResource(context, android.R.drawable.ic_btn_speak_now))
          .setIntent(intent)
          .build()
        manager.dynamicShortcuts = listOf(shortcut)
        true
      } else {
        false
      }
    }
  }
}
