package expo.modules.rootaccess

import android.util.Log
import com.topjohnwu.superuser.Shell
import java.io.File

object RootShellAdapter {
  private const val LOG_TAG = "RootShellAdapter"
  @Volatile private var configured = false

  private fun ensureConfigured() {
    if (configured) {
      return
    }
    Shell.enableVerboseLogging = false
    Shell.setDefaultBuilder(
      Shell.Builder.create()
        .setTimeout(10),
    )
    configured = true
  }

  fun hasSuBinary(): Boolean {
    val candidates = listOf(
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/system/sbin/su",
      "/vendor/bin/su",
      "/su/bin/su",
    )
    val found = candidates.any { File(it).exists() }
    Log.i(LOG_TAG, "su_probe_$found")
    return found
  }

  fun requestAccess(): Boolean {
    ensureConfigured()
    Log.i(LOG_TAG, "su_request")
    return try {
      Shell.getShell().isRoot
    } catch (error: Exception) {
      Log.e(LOG_TAG, "su_request_fail", error)
      false
    }
  }

  fun runAllowlisted(argv: List<String>, timeoutSec: Long = 10): Shell.Result {
    ensureConfigured()
    require(argv.isNotEmpty()) { "empty_command" }
    require(argv[0].startsWith("/") || argv[0].matches(Regex("^[a-zA-Z0-9._-]+$"))) {
      "bad_executable"
    }
    for (arg in argv) {
      require(!arg.contains('\n') && !arg.contains('\u0000') && !arg.contains(';') && !arg.contains('|') && !arg.contains('&') && !arg.contains('`') && !arg.contains('$')) {
        "bad_arg"
      }
    }
    Log.i(LOG_TAG, "su_run_${argv[0]}")
    return Shell.cmd(*argv.toTypedArray()).exec()
  }
}
