package expo.modules.transfer

import android.content.Context

object TransferStateStore {
  private const val PREFS = "transfer_state_store"
  const val STATE_DOWNLOADING = "downloading"
  const val STATE_PAUSED = "paused"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setState(context: Context, transferId: String, state: String) {
    prefs(context).edit().putString("state_$transferId", state).apply()
  }

  fun getState(context: Context, transferId: String): String? {
    return prefs(context).getString("state_$transferId", null)
  }

  fun setBytes(context: Context, transferId: String, bytes: Long, total: Long) {
    prefs(context).edit()
      .putLong("bytes_$transferId", bytes)
      .putLong("total_$transferId", total)
      .apply()
  }

  fun getBytes(context: Context, transferId: String): Long {
    return prefs(context).getLong("bytes_$transferId", 0L)
  }

  fun getTotal(context: Context, transferId: String): Long {
    return prefs(context).getLong("total_$transferId", 0L)
  }

  fun requestPause(context: Context, transferId: String) {
    prefs(context).edit().putBoolean("pause_$transferId", true).apply()
  }

  fun isPauseRequested(context: Context, transferId: String): Boolean {
    return prefs(context).getBoolean("pause_$transferId", false)
  }

  fun clearPauseRequest(context: Context, transferId: String) {
    prefs(context).edit().remove("pause_$transferId").apply()
  }

  fun requestCancel(context: Context, transferId: String) {
    prefs(context).edit().putBoolean("cancel_$transferId", true).apply()
  }

  fun isCancelRequested(context: Context, transferId: String): Boolean {
    return prefs(context).getBoolean("cancel_$transferId", false)
  }

  fun clear(context: Context, transferId: String) {
    prefs(context).edit()
      .remove("state_$transferId")
      .remove("bytes_$transferId")
      .remove("total_$transferId")
      .remove("pause_$transferId")
      .remove("cancel_$transferId")
      .apply()
  }

  fun allPausedIds(context: Context): List<String> {
    val all = prefs(context).all
    return all.keys
      .filter { it.startsWith("state_") && all[it] == STATE_PAUSED }
      .map { it.removePrefix("state_") }
  }
}
