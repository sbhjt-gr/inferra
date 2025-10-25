package com.gorai.ragionare.localserver

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LocalServerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "LocalServerBridge"

    @ReactMethod
    fun startForegroundServer(port: Int, url: String?, promise: Promise) {
        try {
            LocalServerForegroundService.startService(context, port, url)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("foreground_start_failed", error.message, error)
        }
    }

    @ReactMethod
    fun stopForegroundServer(promise: Promise) {
        try {
            LocalServerForegroundService.stopService(context)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("foreground_stop_failed", error.message, error)
        }
    }

    @ReactMethod
    fun updateServerStatus(peerCount: Int, url: String?) {
        LocalServerForegroundService.updateStatus(context, peerCount, url)
    }
}
