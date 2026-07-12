package expo.modules.rootaccess

import android.util.Log
import org.json.JSONObject
import java.io.File

data class RootCommand(
  val id: String,
  val family: String,
  val risk: String,
  val description: String,
)

data class RootCommandResult(
  val ok: Boolean,
  val valueJson: String? = null,
  val error: String? = null,
)

object RootCommandBroker {
  private const val LOG_TAG = "RootCommandBroker"
  private const val MAX_OUT = 12_000

  private val settingsPrev = mutableMapOf<String, String>()

  private val commands = listOf(
    RootCommand("device_health", "diagnostics", "read", "Read thermal memory and battery summary"),
    RootCommand("log_slice", "diagnostics", "read", "Read a filtered short log slice"),
    RootCommand("app_force_stop", "app_control", "write", "Force-stop a non-protected package"),
    RootCommand("app_trim_cache", "app_control", "write", "Trim cache for a non-protected package"),
    RootCommand("setting_apply", "settings", "write", "Apply an allowlisted settings value"),
    RootCommand("setting_restore", "settings", "write", "Restore a previously changed setting"),
    RootCommand("file_copy", "files", "write", "Copy a file within approved safe paths"),
    RootCommand("package_set_enabled", "packages", "write", "Enable or disable an eligible package"),
    RootCommand("package_install_review", "packages", "write", "Open installer review for an APK path"),
    RootCommand("package_uninstall_review", "packages", "destructive", "Open uninstall confirmation for a package"),
  )

  fun list(): List<RootCommand> = commands

  fun execute(commandId: String, argsJson: String): RootCommandResult {
    Log.i(LOG_TAG, "cmd_$commandId")
    val args = try {
      JSONObject(if (argsJson.isBlank()) "{}" else argsJson)
    } catch (_: Exception) {
      return RootCommandResult(false, error = "bad_args")
    }
    return when (commandId) {
      "device_health" -> deviceHealth()
      "log_slice" -> logSlice(args.optString("filter", "Inferra"))
      "app_force_stop" -> appForceStop(args.optString("packageName"))
      "app_trim_cache" -> appTrimCache(args.optString("packageName"))
      "setting_apply" -> settingApply(args.optString("key"), args.optString("value"))
      "setting_restore" -> settingRestore(args.optString("key"))
      "file_copy" -> fileCopy(args.optString("from"), args.optString("to"))
      "package_set_enabled" -> packageSetEnabled(args.optString("packageName"), args.optBoolean("enabled", true))
      "package_install_review" -> packageInstallReview(args.optString("apkPath"))
      "package_uninstall_review" -> packageUninstallReview(args.optString("packageName"))
      else -> RootCommandResult(false, error = "unknown_command")
    }
  }

  private fun deviceHealth(): RootCommandResult {
    val thermal = readFile("/sys/class/thermal/thermal_zone0/temp")
    val mem = capped(RootShellAdapter.runAllowlisted(listOf("cat", "/proc/meminfo")).out.joinToString("\n"), 2000)
    val battery = capped(RootShellAdapter.runAllowlisted(listOf("dumpsys", "battery")).out.joinToString("\n"), 2000)
    val json = JSONObject()
      .put("thermal", thermal)
      .put("memory", mem)
      .put("battery", battery)
    return RootCommandResult(true, valueJson = json.toString())
  }

  private fun logSlice(filter: String): RootCommandResult {
    val safe = filter.replace(Regex("[^a-zA-Z0-9._-]"), "").ifBlank { "Inferra" }
    val result = RootShellAdapter.runAllowlisted(listOf("logcat", "-d", "-t", "80", "-s", safe))
    val out = capped(result.out.joinToString("\n").replace(Regex("(token|password|key)=\\S+"), "$1=***"), MAX_OUT)
    return RootCommandResult(true, valueJson = JSONObject().put("lines", out).toString())
  }

  private fun appForceStop(packageName: String): RootCommandResult {
    val pkg = requireSafePackage(packageName) ?: return RootCommandResult(false, error = "bad_package")
    val result = RootShellAdapter.runAllowlisted(listOf("am", "force-stop", pkg))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("stopped", pkg).toString())
    } else {
      RootCommandResult(false, error = "force_stop_failed")
    }
  }

  private fun appTrimCache(packageName: String): RootCommandResult {
    val pkg = requireSafePackage(packageName) ?: return RootCommandResult(false, error = "bad_package")
    val result = RootShellAdapter.runAllowlisted(listOf("pm", "trim-caches", "128M"))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("trimmed", pkg).toString())
    } else {
      RootCommandResult(false, error = "trim_failed")
    }
  }

  private fun settingApply(key: String, value: String): RootCommandResult {
    val allowed = mapOf(
      "animator_duration_scale" to "global",
      "transition_animation_scale" to "global",
      "window_animation_scale" to "global",
      "stay_on_while_plugged_in" to "global",
    )
    val namespace = allowed[key] ?: return RootCommandResult(false, error = "setting_not_allowed")
    if (!value.matches(Regex("^[0-9.]+$"))) {
      return RootCommandResult(false, error = "bad_value")
    }
    val previous = RootShellAdapter.runAllowlisted(listOf("settings", "get", namespace, key)).out.firstOrNull().orEmpty()
    settingsPrev[key] = previous
    val result = RootShellAdapter.runAllowlisted(listOf("settings", "put", namespace, key, value))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("key", key).put("value", value).put("previous", previous).toString())
    } else {
      RootCommandResult(false, error = "setting_failed")
    }
  }

  private fun settingRestore(key: String): RootCommandResult {
    val previous = settingsPrev[key] ?: return RootCommandResult(false, error = "no_previous")
    return settingApply(key, previous.ifBlank { "1" })
  }

  private fun fileCopy(from: String, to: String): RootCommandResult {
    val src = requireSafePath(from) ?: return RootCommandResult(false, error = "bad_from")
    val dst = requireSafePath(to) ?: return RootCommandResult(false, error = "bad_to")
    if (src.length() > 25_000_000L) {
      return RootCommandResult(false, error = "file_too_large")
    }
    val result = RootShellAdapter.runAllowlisted(listOf("cp", src.absolutePath, dst.absolutePath))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("copied", true).toString())
    } else {
      RootCommandResult(false, error = "copy_failed")
    }
  }

  private fun packageSetEnabled(packageName: String, enabled: Boolean): RootCommandResult {
    val pkg = requireSafePackage(packageName) ?: return RootCommandResult(false, error = "bad_package")
    val mode = if (enabled) "enable" else "disable-user"
    val result = RootShellAdapter.runAllowlisted(listOf("pm", mode, pkg))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("packageName", pkg).put("enabled", enabled).toString())
    } else {
      RootCommandResult(false, error = "package_state_failed")
    }
  }

  private fun packageInstallReview(apkPath: String): RootCommandResult {
    val file = requireSafePath(apkPath) ?: return RootCommandResult(false, error = "bad_apk")
    if (!file.name.endsWith(".apk", ignoreCase = true)) {
      return RootCommandResult(false, error = "not_apk")
    }
    val result = RootShellAdapter.runAllowlisted(listOf("am", "start", "-a", "android.intent.action.VIEW", "-t", "application/vnd.android.package-archive", "-d", "file://${file.absolutePath}"))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("openedInstaller", true).toString())
    } else {
      RootCommandResult(false, error = "installer_failed")
    }
  }

  private fun packageUninstallReview(packageName: String): RootCommandResult {
    val pkg = requireSafePackage(packageName) ?: return RootCommandResult(false, error = "bad_package")
    val result = RootShellAdapter.runAllowlisted(listOf("am", "start", "-a", "android.intent.action.DELETE", "-d", "package:$pkg"))
    return if (result.isSuccess) {
      RootCommandResult(true, valueJson = JSONObject().put("openedUninstall", true).toString())
    } else {
      RootCommandResult(false, error = "uninstall_failed")
    }
  }

  private fun requireSafePackage(packageName: String): String? {
    if (!packageName.matches(Regex("^[a-zA-Z0-9._]+$"))) {
      return null
    }
    if (packageName == "android" || packageName.startsWith("com.android.") || packageName.startsWith("com.google.android.")) {
      return null
    }
    return packageName
  }

  private fun requireSafePath(path: String): File? {
    if (path.isBlank() || path.contains('\u0000')) {
      return null
    }
    val file = try {
      File(path).canonicalFile
    } catch (_: Exception) {
      return null
    }
    val allowedRoots = listOf(
      File("/sdcard").canonicalFile,
      File("/storage/emulated/0").canonicalFile,
      File("/data/local/tmp").canonicalFile,
    )
    val ok = allowedRoots.any { root ->
      file.path == root.path || file.path.startsWith(root.path + "/")
    }
    if (!ok || file.isDirectory) {
      return null
    }
    return file
  }

  private fun readFile(path: String): String {
    return try {
      File(path).takeIf { it.exists() }?.readText()?.take(200) ?: ""
    } catch (_: Exception) {
      ""
    }
  }

  private fun capped(value: String, max: Int): String {
    return if (value.length <= max) value else value.take(max) + "…[truncated]"
  }
}
