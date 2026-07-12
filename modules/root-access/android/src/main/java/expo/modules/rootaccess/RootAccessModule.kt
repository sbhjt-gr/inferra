package expo.modules.rootaccess

import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class RootAccessModule : Module() {
  private val logTag = "RootAccess"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val jobs = ConcurrentHashMap<String, Job>()
  private var status = "not_requested"

  override fun definition() = ModuleDefinition {
    Name("RootAccess")

    OnDestroy {
      scope.cancel()
      jobs.clear()
    }

    AsyncFunction("getCapabilities") {
      val present = RootShellAdapter.hasSuBinary()
      val root = when {
        Build.VERSION.SDK_INT < 1 -> "unavailable"
        !present -> "su_missing"
        status == "granted" -> "granted"
        status == "denied" -> "denied"
        status == "error" -> "error"
        else -> "not_requested"
      }
      Log.i(logTag, "caps_$root")
      mapOf(
        "sdk" to Build.VERSION.SDK_INT,
        "root" to root,
      )
    }

    AsyncFunction("requestAccess") { promise: Promise ->
      scope.launch {
        try {
          if (!RootShellAdapter.hasSuBinary()) {
            status = "su_missing"
            promise.resolve(status)
            return@launch
          }
          val granted = RootShellAdapter.requestAccess()
          status = if (granted) "granted" else "denied"
          Log.i(logTag, "request_$status")
          promise.resolve(status)
        } catch (error: Exception) {
          Log.e(logTag, "request_fail", error)
          status = "error"
          promise.resolve(status)
        }
      }
    }

    AsyncFunction("listCommands") {
      RootCommandBroker.list().map {
        mapOf(
          "id" to it.id,
          "family" to it.family,
          "risk" to it.risk,
          "description" to it.description,
        )
      }
    }

    AsyncFunction("executeCommand") { commandId: String, argsJson: String, requestId: String, promise: Promise ->
      val job = scope.launch {
        try {
          if (status != "granted") {
            promise.resolve(mapOf("ok" to false, "error" to "root_not_granted"))
            return@launch
          }
          val result = RootCommandBroker.execute(commandId, argsJson)
          promise.resolve(
            mapOf(
              "ok" to result.ok,
              "valueJson" to result.valueJson,
              "error" to result.error,
            ),
          )
        } catch (error: Exception) {
          Log.e(logTag, "exec_fail", error)
          promise.resolve(mapOf("ok" to false, "error" to (error.message ?: "execution_failed")))
        } finally {
          jobs.remove(requestId)
        }
      }
      jobs[requestId] = job
    }

    AsyncFunction("cancelCommand") { requestId: String ->
      val job = jobs.remove(requestId)
      job?.cancel()
      job != null
    }
  }
}
