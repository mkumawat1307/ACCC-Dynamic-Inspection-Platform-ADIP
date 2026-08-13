package com.accc.dynamicinspection

import android.app.backup.BackupManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidBackupModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AndroidBackup"

  @ReactMethod
  fun requestBackup() {
    try {
      BackupManager(reactApplicationContext).dataChanged()
    } catch (ignored: Throwable) {
      // Signalling backup is best-effort; never crash the app.
    }
  }
}