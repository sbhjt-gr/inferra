package com.gorai.ragionare

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.IOException
import org.json.JSONObject
import org.json.JSONArray

class FileSystemModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val TAG = "FileSystemModule"
    private val context: Context = reactContext.applicationContext

    override fun getName(): String {
        return "FileSystemModule"
    }

    @ReactMethod
    fun makeDirectoryAsync(path: String, options: ReadableMap, promise: Promise) {
        try {
            val intermediates = options.getBoolean("intermediates")
            val file = File(context.filesDir, path)

            if (file.exists()) {
                if (file.isDirectory) {
                    promise.resolve(null)
                    return
                } else {
                    promise.reject("ERR_FILESYSTEM", "Path exists but is not a directory")
                    return
                }
            }

            if (intermediates) {
                file.mkdirs()
            } else {
                file.mkdir()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error making directory: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to create directory: ${e.message}")
        }
    }

    @ReactMethod
    fun readDirectoryAsync(path: String, promise: Promise) {
        try {
            val directory = File(context.filesDir, path)
            if (!directory.exists() || !directory.isDirectory) {
                promise.reject("ERR_FILESYSTEM", "Directory does not exist")
                return
            }

            val files = directory.listFiles()
            if (files == null) {
                promise.resolve(WritableNativeArray())
                return
            }

            val result = WritableNativeArray()
            files.forEach { file ->
                result.pushString(file.name)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error reading directory: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to read directory: ${e.message}")
        }
    }

    @ReactMethod
    fun getInfoAsync(path: String, options: ReadableMap, promise: Promise) {
        try {
            val file = File(context.filesDir, path)
            val result = WritableNativeMap()

            result.putBoolean("exists", file.exists())
            if (file.exists()) {
                result.putBoolean("isDirectory", file.isDirectory)
                if (options.getBoolean("size")) {
                    result.putDouble("size", file.length().toDouble())
                }
                result.putDouble("modificationTime", file.lastModified().toDouble())
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting file info: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to get file info: ${e.message}")
        }
    }

    @ReactMethod
    fun deleteAsync(path: String, options: ReadableMap, promise: Promise) {
        try {
            val file = File(context.filesDir, path)
            val idempotent = options.getBoolean("idempotent")

            if (!file.exists()) {
                if (idempotent) {
                    promise.resolve(null)
                    return
                }
                promise.reject("ERR_FILESYSTEM", "File does not exist")
                return
            }

            if (file.delete()) {
                promise.resolve(null)
            } else {
                promise.reject("ERR_FILESYSTEM", "Failed to delete file")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting file: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to delete file: ${e.message}")
        }
    }

    @ReactMethod
    fun moveAsync(options: ReadableMap, promise: Promise) {
        try {
            val from = File(context.filesDir, options.getString("from") ?: throw Exception("'from' path is required"))
            val to = File(context.filesDir, options.getString("to") ?: throw Exception("'to' path is required"))

            if (!from.exists()) {
                promise.reject("ERR_FILESYSTEM", "Source file does not exist")
                return
            }

            if (to.exists()) {
                to.delete()
            }

            if (from.renameTo(to)) {
                promise.resolve(null)
            } else {
                // If rename fails, try copy and delete
                from.copyTo(to, overwrite = true)
                from.delete()
                promise.resolve(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error moving file: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to move file: ${e.message}")
        }
    }

    @ReactMethod
    fun copyAsync(options: ReadableMap, promise: Promise) {
        try {
            val from = File(context.filesDir, options.getString("from") ?: throw Exception("'from' path is required"))
            val to = File(context.filesDir, options.getString("to") ?: throw Exception("'to' path is required"))

            if (!from.exists()) {
                promise.reject("ERR_FILESYSTEM", "Source file does not exist")
                return
            }

            from.copyTo(to, overwrite = true)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error copying file: ${e.message}")
            promise.reject("ERR_FILESYSTEM", "Failed to copy file: ${e.message}")
        }
    }

    companion object {
        const val documentDirectory = "documents"
        const val cacheDirectory = "cache"
    }
} 