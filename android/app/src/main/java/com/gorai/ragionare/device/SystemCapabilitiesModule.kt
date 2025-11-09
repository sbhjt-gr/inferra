package com.gorai.ragionare.device

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.os.Build
import java.io.File
import android.opengl.GLES20
import javax.microedition.khronos.egl.EGL10
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.egl.EGLContext
import javax.microedition.khronos.egl.EGLDisplay

@ReactModule(name = SystemCapabilitiesModule.MODULE_NAME)
class SystemCapabilitiesModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun getCPUInfo(result: Promise) {
    try {
      val data = Arguments.createMap()
      val coreCount = Runtime.getRuntime().availableProcessors()
      data.putInt("cores", coreCount)

      val cpuData = Arguments.createArray()
      val capabilities = mutableSetOf<String>()
      val infoFile = File("/proc/cpuinfo")

      if (infoFile.exists()) {
        val lines = infoFile.readLines()
        var entry = Arguments.createMap()
        var populated = false

        lines.forEach { line ->
          if (line.isEmpty() && populated) {
            cpuData.pushMap(entry)
            entry = Arguments.createMap()
            populated = false
            return@forEach
          }

          val segments = line.split(":")
          if (segments.size >= 2) {
            val field = segments[0].trim()
            val content = segments[1].trim()
            when (field) {
              "processor", "model name", "cpu MHz", "vendor_id" -> {
                entry.putString(field, content)
                populated = true
              }
              "flags", "Features" -> {
                capabilities.addAll(content.split(" ").filter { it.isNotEmpty() })
              }
            }
          }
        }

        if (populated) {
          cpuData.pushMap(entry)
        }

        data.putArray("processors", cpuData)

        val caps = Arguments.createArray()
        capabilities.forEach { caps.pushString(it) }
        data.putArray("features", caps)

        data.putBoolean("hasFp16", capabilities.any { it in setOf("fphp", "fp16") })
        data.putBoolean("hasDotProd", capabilities.any { it in setOf("dotprod", "asimddp") })
        data.putBoolean("hasSve", capabilities.any { it == "sve" })
        data.putBoolean("hasI8mm", capabilities.any { it == "i8mm" })
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        data.putString("socModel", Build.SOC_MODEL)
      }

      result.resolve(data)
    } catch (error: Exception) {
      result.reject("cpu_info_error", error.message)
    }
  }

  @ReactMethod
  fun getGPUInfo(result: Promise) {
    try {
      val data = Arguments.createMap()

      var displayName = ""
      var manufacturer = ""
      var apiVersion = ""

      try {
        val eglInstance = EGLContext.getEGL() as EGL10
        val screen = eglInstance.eglGetDisplay(EGL10.EGL_DEFAULT_DISPLAY)

        if (screen != EGL10.EGL_NO_DISPLAY) {
          val versionData = IntArray(2)
          eglInstance.eglInitialize(screen, versionData)

          val count = IntArray(1)
          val cfgs = arrayOfNulls<EGLConfig>(1)
          val spec = intArrayOf(
            EGL10.EGL_RENDERABLE_TYPE, 4,
            EGL10.EGL_NONE
          )

          eglInstance.eglChooseConfig(screen, spec, cfgs, 1, count)

          if (count[0] > 0) {
            val ctx = eglInstance.eglCreateContext(
              screen,
              cfgs[0],
              EGL10.EGL_NO_CONTEXT,
              intArrayOf(0x3098, 2, EGL10.EGL_NONE)
            )

            if (ctx != null && ctx != EGL10.EGL_NO_CONTEXT) {
              val attrs = intArrayOf(
                EGL10.EGL_WIDTH, 1,
                EGL10.EGL_HEIGHT, 1,
                EGL10.EGL_NONE
              )
              val surf = eglInstance.eglCreatePbufferSurface(screen, cfgs[0], attrs)

              if (surf != null && surf != EGL10.EGL_NO_SURFACE) {
                eglInstance.eglMakeCurrent(screen, surf, surf, ctx)

                displayName = GLES20.glGetString(GLES20.GL_RENDERER) ?: ""
                manufacturer = GLES20.glGetString(GLES20.GL_VENDOR) ?: ""
                apiVersion = GLES20.glGetString(GLES20.GL_VERSION) ?: ""

                eglInstance.eglMakeCurrent(screen, EGL10.EGL_NO_SURFACE, EGL10.EGL_NO_SURFACE, EGL10.EGL_NO_CONTEXT)
                eglInstance.eglDestroySurface(screen, surf)
              }
              eglInstance.eglDestroyContext(screen, ctx)
            }
          }
          eglInstance.eglTerminate(screen)
        }
      } catch (error: Exception) {
      }

      data.putString("renderer", displayName)
      data.putString("vendor", manufacturer)
      data.putString("version", apiVersion)

      val lower = displayName.lowercase()
      val isAdreno = lower.contains("adreno") || lower.contains("qcom") || lower.contains("qualcomm")
      val isMali = lower.contains("mali")
      val isPowerVR = lower.contains("powervr")

      data.putBoolean("hasAdreno", isAdreno)
      data.putBoolean("hasMali", isMali)
      data.putBoolean("hasPowerVR", isPowerVR)
      data.putBoolean("supportsOpenCL", isAdreno)

      val chipType = when {
        isAdreno -> "Adreno (Qualcomm)"
        isMali -> "Mali (ARM)"
        isPowerVR -> "PowerVR (Imagination)"
        displayName.isNotEmpty() -> displayName
        else -> "Unknown"
      }
      data.putString("gpuType", chipType)

      result.resolve(data)
    } catch (error: Exception) {
      result.reject("gpu_info_error", error.message)
    }
  }

  companion object {
    const val MODULE_NAME = "DeviceInfoModule"
  }
}
