package com.gorai.ragionare

import android.view.View
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class KeyboardModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "KeyboardModule"
    }

    @ReactMethod
    fun enableResize() {
        UiThreadUtil.runOnUiThread {
            val activity = currentActivity ?: return@runOnUiThread
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
    }

    @ReactMethod
    fun enablePan() {
        UiThreadUtil.runOnUiThread {
            val activity = currentActivity ?: return@runOnUiThread
            activity.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN)
        }
    }

    @ReactMethod
    fun setKeyboardVerticalOffset(offset: Int) {
        // Not implemented for Android as this is handled by the windowSoftInputMode
    }
} 