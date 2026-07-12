package expo.modules.appfunctions

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log

class ComposeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Log.i(LOG_TAG, "compose_open")
    val prompt = intent?.getStringExtra(EXTRA_PROMPT).orEmpty()
    val title = intent?.getStringExtra(EXTRA_TITLE)
    val uri = Uri.Builder()
      .scheme("com.gorai.ragionare")
      .authority("compose")
      .appendQueryParameter("prompt", prompt.take(4000))
      .apply {
        if (!title.isNullOrBlank()) {
          appendQueryParameter("title", title.take(120))
        }
      }
      .build()
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      data = uri
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    if (launch != null) {
      startActivity(launch)
    }
    finish()
  }

  companion object {
    const val LOG_TAG = "ComposeActivity"
    const val ACTION_COMPOSE = "com.gorai.ragionare.action.COMPOSE_PROMPT"
    const val EXTRA_PROMPT = "prompt"
    const val EXTRA_TITLE = "title"
  }
}
