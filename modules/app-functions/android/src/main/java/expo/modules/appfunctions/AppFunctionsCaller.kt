package expo.modules.appfunctions

import android.util.Log
import androidx.appfunctions.AppFunctionManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

object AppFunctionsCaller {
  private const val LOG_TAG = "AppFunctionsCaller"

  suspend fun search(
    manager: AppFunctionManager,
    query: String?,
  ): List<AppFunctionsModule.FunctionRef> {
    Log.i(LOG_TAG, "search_start")
    return try {
      val method = manager.javaClass.methods.firstOrNull { it.name == "observeAppFunctions" }
        ?: return emptyList()
      val specClass = method.parameterTypes.firstOrNull() ?: return emptyList()
      val spec = try {
        val builderClass = Class.forName("${specClass.name}\$Builder")
        val builder = builderClass.getDeclaredConstructor().newInstance()
        builderClass.getMethod("build").invoke(builder)
      } catch (_: Exception) {
        specClass.getDeclaredConstructor().newInstance()
      }
      val flowObj = method.invoke(manager, spec)
      val first = awaitFirst(flowObj) ?: return emptyList()
      val packages = asList(first)
      val q = query?.trim()?.lowercase().orEmpty()
      val out = mutableListOf<AppFunctionsModule.FunctionRef>()
      for (pkg in packages) {
        val packageName = readString(pkg, "getPackageName", "packageName") ?: continue
        val functions = asList(readAny(pkg, "getAppFunctions", "appFunctions", "functions") ?: emptyList<Any>())
        for (fn in functions) {
          val functionId = readString(fn, "getId", "id", "functionId") ?: continue
          val name = functionId.substringAfterLast('/').ifBlank { functionId }
          val description = readString(fn, "getDescription", "description") ?: name
          if (q.isNotEmpty() &&
            !packageName.lowercase().contains(q) &&
            !name.lowercase().contains(q) &&
            !description.lowercase().contains(q)
          ) {
            continue
          }
          val enabled = try {
            manager.javaClass.methods
              .firstOrNull { it.name == "isAppFunctionEnabled" && it.parameterTypes.size == 2 }
              ?.invoke(manager, packageName, functionId) as? Boolean
              ?: true
          } catch (_: Exception) {
            true
          }
          val params = JSONArray()
          val paramList = asList(readAny(fn, "getParameters", "parameters") ?: emptyList<Any>())
          for (param in paramList) {
            params.put(
              JSONObject()
                .put("name", readString(param, "getName", "name") ?: "arg")
                .put("type", readString(param, "getDataType", "dataType", "type") ?: "string")
                .put("description", readString(param, "getDescription", "description") ?: "")
                .put("required", readBool(param, "isRequired", "getIsRequired", "required")),
            )
          }
          out.add(
            AppFunctionsModule.FunctionRef(
              packageName = packageName,
              functionId = functionId,
              name = name,
              description = description.take(500),
              enabled = enabled,
              parametersJson = params.toString(),
            ),
          )
          if (out.size >= 80) {
            return out
          }
        }
      }
      Log.i(LOG_TAG, "search_done_${out.size}")
      out
    } catch (error: Exception) {
      Log.e(LOG_TAG, "search_err", error)
      emptyList()
    }
  }

  suspend fun execute(
    manager: AppFunctionManager,
    ref: AppFunctionsModule.FunctionRef,
    argsJson: String,
  ): String {
    Log.i(LOG_TAG, "execute_start")
    val builderClass = Class.forName("androidx.appfunctions.ExecuteAppFunctionRequest\$Builder")
    val builder = builderClass
      .getConstructor(String::class.java, String::class.java)
      .newInstance(ref.packageName, ref.functionId)
    try {
      val params = JSONObject(if (argsJson.isBlank()) "{}" else argsJson)
      builderClass.methods.firstOrNull { it.name == "setParameters" }?.invoke(builder, params)
    } catch (_: Exception) {
      Log.w(LOG_TAG, "params_skip")
    }
    val request = builderClass.getMethod("build").invoke(builder)
    val execute = manager.javaClass.methods.first {
      it.name == "executeAppFunction" && it.parameterTypes.size == 1
    }
    val response = execute.invoke(manager, request)
    return readString(response, "getResultDocument", "resultDocument")
      ?: response?.toString()
      ?: "{}"
  }

  @Suppress("UNCHECKED_CAST")
  private suspend fun awaitFirst(flow: Any?): Any? {
    if (flow == null) {
      return null
    }
    if (flow is Collection<*>) {
      return flow
    }
    if (flow is Flow<*>) {
      return withTimeout(8_000) { (flow as Flow<Any?>).first() }
    }
    return null
  }

  private fun asList(value: Any?): List<Any> {
    return when (value) {
      null -> emptyList()
      is List<*> -> value.filterNotNull()
      is Array<*> -> value.filterNotNull()
      is Collection<*> -> value.filterNotNull()
      else -> listOf(value)
    }
  }

  private fun readAny(target: Any?, vararg names: String): Any? {
    if (target == null) {
      return null
    }
    for (name in names) {
      try {
        val getter = target.javaClass.methods.firstOrNull {
          it.name == name && it.parameterTypes.isEmpty()
        }
        if (getter != null) {
          return getter.invoke(target)
        }
        val field = target.javaClass.declaredFields.firstOrNull { it.name == name }
        if (field != null) {
          field.isAccessible = true
          return field.get(target)
        }
      } catch (_: Exception) {
      }
    }
    return null
  }

  private fun readString(target: Any?, vararg names: String): String? {
    val value = readAny(target, *names) ?: return null
    return value.toString()
  }

  private fun readBool(target: Any?, vararg names: String): Boolean {
    val value = readAny(target, *names) ?: return false
    return when (value) {
      is Boolean -> value
      else -> value.toString().toBoolean()
    }
  }
}
