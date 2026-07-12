package expo.modules.rootaccess

import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RootCommandBrokerTest {
  @Test
  fun rejects_system_package() {
    val result = RootCommandBroker.execute(
      "app_force_stop",
      """{"packageName":"com.android.settings"}""",
    )
    assertTrue(result.ok.not())
    assertTrue(result.error == "bad_package")
  }

  @Test
  fun rejects_unknown_command() {
    val result = RootCommandBroker.execute("run_shell", """{"cmd":"id"}""")
    assertTrue(result.ok.not())
    assertTrue(result.error == "unknown_command")
  }

  @Test
  fun rejects_unsafe_path() {
    val result = RootCommandBroker.execute(
      "file_copy",
      """{"from":"/data/data/com.android.settings/files/a","to":"/sdcard/a"}""",
    )
    assertTrue(result.ok.not())
    assertNull(result.valueJson)
  }
}
