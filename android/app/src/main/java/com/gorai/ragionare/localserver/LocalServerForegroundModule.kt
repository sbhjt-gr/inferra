package com.gorai.ragionare.localserver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LocalServerForegroundModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private val broadcastManager = LocalBroadcastManager.getInstance(reactContext)
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      sendMaintenanceEvent()
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
    broadcastManager.registerReceiver(receiver, IntentFilter(LocalServerForegroundService.ACTION_MAINTENANCE))
  }

  override fun getName(): String = "LocalServerBackground"

  @ReactMethod
  fun start(options: com.facebook.react.bridge.ReadableMap?, promise: Promise) {
    val context = reactApplicationContext
    val intent = Intent(context, LocalServerForegroundService::class.java)
    ContextCompat.startForegroundService(context, intent)
    promise.resolve(null)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val context = reactApplicationContext
    val intent = Intent(context, LocalServerForegroundService::class.java)
    context.stopService(intent)
    promise.resolve(null)
  }

  @ReactMethod
  fun status(promise: Promise) {
    val map = Arguments.createMap()
    map.putBoolean("running", LocalServerForegroundService.isRunning)
    promise.resolve(map)
  }

  private fun sendMaintenanceEvent() {
    try {
      val emitter = reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      emitter.emit("local_server_maintenance", null)
    } catch (_: RuntimeException) {
    }
  }

  override fun onHostResume() {}

  override fun onHostPause() {}

  override fun onHostDestroy() {
    broadcastManager.unregisterReceiver(receiver)
    reactApplicationContext.removeLifecycleEventListener(this)
  }

  @ReactMethod
  fun addListener(eventName: String) {
  }

  @ReactMethod
  fun removeListeners(count: Double) {
  }

  override fun invalidate() {
    super.invalidate()
    try {
      broadcastManager.unregisterReceiver(receiver)
    } catch (_: IllegalArgumentException) {
    }
    reactApplicationContext.removeLifecycleEventListener(this)
  }
}
