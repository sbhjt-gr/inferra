package expo.modules.appfunctions

import android.os.Build
import android.util.Log
import androidx.appfunctions.AppFunctionManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class AppFunctionsModule : Module() {
  private val logTag = "AppFunctions"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val handles = ConcurrentHashMap<String, FunctionRef>()
  private val jobs = ConcurrentHashMap<String, Job>()

  data class FunctionRef(
    val packageName: String,
    val functionId: String,
    val name: String,
    val description: String,
    val enabled: Boolean,
    val parametersJson: String,
  )

  override fun definition() = ModuleDefinition {
    Name("AppFunctions")

    OnDestroy {
      scope.cancel()
      handles.clear()
      jobs.clear()
    }

    AsyncFunction("getCapabilities") { promise: Promise ->
      scope.launch {
        try {
          val context = appContext.reactContext
          if (context == null) {
            promise.resolve(
              mapOf(
                "sdk" to Build.VERSION.SDK_INT,
                "appFunctions" to "unavailable",
              ),
            )
            return@launch
          }
          val manager = AppFunctionManager.getInstance(context)
          val status = when {
            manager == null -> "unavailable"
            Build.VERSION.SDK_INT < 36 -> "unavailable"
            else -> "supported"
          }
          Log.i(logTag, "caps_$status")
          promise.resolve(
            mapOf(
              "sdk" to Build.VERSION.SDK_INT,
              "appFunctions" to status,
            ),
          )
        } catch (error: SecurityException) {
          Log.w(logTag, "caps_denied", error)
          promise.resolve(
            mapOf(
              "sdk" to Build.VERSION.SDK_INT,
              "appFunctions" to "permission_denied",
            ),
          )
        } catch (error: Exception) {
          Log.e(logTag, "caps_fail", error)
          promise.resolve(
            mapOf(
              "sdk" to Build.VERSION.SDK_INT,
              "appFunctions" to "unavailable",
            ),
          )
        }
      }
    }

    AsyncFunction("searchFunctions") { query: String?, promise: Promise ->
      scope.launch {
        try {
          val context = appContext.reactContext
            ?: throw IllegalStateException("no_context")
          val manager = AppFunctionManager.getInstance(context)
            ?: throw IllegalStateException("unavailable")
          val results = AppFunctionsCaller.search(manager, query)
          handles.clear()
          val mapped = results.map { item ->
            val handle = UUID.randomUUID().toString()
            handles[handle] = item
            mapOf(
              "handle" to handle,
              "packageName" to item.packageName,
              "functionId" to item.functionId,
              "name" to item.name,
              "description" to item.description,
              "enabled" to item.enabled,
              "parameters" to jsonParams(item.parametersJson),
            )
          }
          Log.i(logTag, "search_ok_${mapped.size}")
          promise.resolve(mapped)
        } catch (error: SecurityException) {
          Log.w(logTag, "search_denied", error)
          promise.reject("permission_denied", "permission_denied", error)
        } catch (error: Exception) {
          Log.e(logTag, "search_fail", error)
          promise.resolve(emptyList<Any>())
        }
      }
    }

    AsyncFunction("executeFunction") { handle: String, argsJson: String, requestId: String, promise: Promise ->
      val job = scope.launch {
        try {
          val context = appContext.reactContext
            ?: throw IllegalStateException("no_context")
          val manager = AppFunctionManager.getInstance(context)
            ?: throw IllegalStateException("unavailable")
          val ref = handles[handle] ?: throw IllegalStateException("stale_handle")
          if (!ref.enabled) {
            throw IllegalStateException("disabled")
          }
          val value = withTimeout(25_000) {
            AppFunctionsCaller.execute(manager, ref, argsJson)
          }
          Log.i(logTag, "exec_ok")
          promise.resolve(
            mapOf(
              "ok" to true,
              "valueJson" to value,
            ),
          )
        } catch (error: CancellationException) {
          Log.w(logTag, "exec_cancel")
          promise.resolve(mapOf("ok" to false, "error" to "cancelled"))
        } catch (error: SecurityException) {
          Log.w(logTag, "exec_denied", error)
          promise.resolve(mapOf("ok" to false, "error" to "permission_denied"))
        } catch (error: Exception) {
          Log.e(logTag, "exec_fail", error)
          promise.resolve(mapOf("ok" to false, "error" to (error.message ?: "execution_failed")))
        } finally {
          jobs.remove(requestId)
        }
      }
      jobs[requestId] = job
    }

    AsyncFunction("cancelExecution") { requestId: String ->
      val job = jobs.remove(requestId)
      job?.cancel()
      Log.i(logTag, "exec_cancel_req")
      job != null
    }

    AsyncFunction("setProviderEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      ProviderGate.setEnabled(context, enabled)
      Log.i(logTag, "provider_$enabled")
      true
    }

    AsyncFunction("isProviderEnabled") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      ProviderGate.isEnabled(context)
    }
  }

  private fun jsonParams(raw: String): List<Map<String, Any?>> {
    return try {
      val array = JSONArray(raw)
      buildList {
        for (i in 0 until array.length()) {
          val obj = array.optJSONObject(i) ?: continue
          add(
            mapOf(
              "name" to obj.optString("name"),
              "type" to obj.optString("type", "string"),
              "description" to obj.optString("description"),
              "required" to obj.optBoolean("required", false),
            ),
          )
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }
}
