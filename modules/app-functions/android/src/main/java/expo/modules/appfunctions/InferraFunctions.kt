package expo.modules.appfunctions

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.appfunctions.AppFunctionContext
import androidx.appfunctions.AppFunctionInvalidArgumentException
import androidx.appfunctions.service.AppFunction

class InferraFunctions {
  /**
   * Open InferrLM with a draft prompt for the user to review and send.
   *
   * @param appFunctionContext The execution context provided by the system.
   * @param prompt The draft prompt text to open in InferrLM.
   * @param title Optional title for the draft conversation.
   * @return A PendingIntent that opens InferrLM with the draft prompt.
   */
  @AppFunction(isDescribedByKDoc = true, isEnabled = false)
  suspend fun composePrompt(
    appFunctionContext: AppFunctionContext,
    prompt: String,
    title: String? = null,
  ): PendingIntent {
    Log.i("InferraFunctions", "compose_prompt")
    val context = appFunctionContext.context
    if (!ProviderGate.isEnabled(context)) {
      throw AppFunctionInvalidArgumentException("provider_disabled")
    }
    val cleaned = prompt.trim()
    if (cleaned.isEmpty() || cleaned.length > 4000) {
      throw AppFunctionInvalidArgumentException("invalid_prompt")
    }
    val intent = Intent(context, ComposeActivity::class.java).apply {
      action = ComposeActivity.ACTION_COMPOSE
      putExtra(ComposeActivity.EXTRA_PROMPT, cleaned)
      putExtra(ComposeActivity.EXTRA_TITLE, title?.take(120))
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(context, cleaned.hashCode(), intent, flags)
  }
}
