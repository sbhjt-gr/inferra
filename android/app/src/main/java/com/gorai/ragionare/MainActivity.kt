package com.gorai.ragionare
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.bridge.ReactContext

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.Theme_App_SplashScreen)
    
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        SplashScreenManager.registerOnActivity(this)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
    
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      super.invokeDefaultOnBackPressed()
  }
}
