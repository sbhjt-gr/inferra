package expo.modules.appfunctions

import android.content.Context
import android.content.SharedPreferences

object ProviderGate {
  private const val PREFS = "inferrlm_appfunctions"
  private const val KEY = "provider_enabled"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY, enabled).apply()
  }
}
