package com.accc.dynamicinspection

import android.graphics.Bitmap
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

class WatermarkEncoderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun encodeJpeg(
        width: Int,
        height: Int,
        rgbaBase64: String,
        quality: Int,
        outputPath: String,
        promise: Promise
    ) {
        if (width <= 0 || height <= 0 || quality !in 0..100) {
            promise.reject("E_INVALID_ARGS", "Invalid encode args: ${width}x${height} q=$quality")
            return
        }
        val outputFile = File(outputPath)
        Thread {
            var bitmap: Bitmap? = null
            try {
                val rgbaBytes = Base64.decode(rgbaBase64, Base64.DEFAULT)
                val expected = width.toLong() * height * 4
                if (rgbaBytes.size.toLong() != expected) {
                    promise.reject(
                        "E_DECODE",
                        "RGBA buffer size ${rgbaBytes.size} does not match ${width}x${height} (need $expected)"
                    )
                    return@Thread
                }
                val buffer = ByteBuffer.wrap(rgbaBytes).order(ByteOrder.nativeOrder())
                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                bitmap.copyPixelsFromBuffer(buffer)
                outputFile.parentFile?.mkdirs()
                val stream = FileOutputStream(outputFile)
                try {
                    val ok = bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
                    stream.flush()
                    if (!ok) {
                        promise.reject("E_ENCODE", "Bitmap.compress returned false")
                        return@Thread
                    }
                } finally {
                    stream.close()
                }
                promise.resolve(true)
            } catch (e: OutOfMemoryError) {
                promise.reject("E_OOM", "Out of memory encoding $width x $height JPEG", e)
            } catch (e: Exception) {
                promise.reject("E_ENCODE", "Failed to encode JPEG: ${e.message}", e)
            } finally {
                bitmap?.recycle()
            }
        }.start()
    }

    companion object {
        const val NAME = "WatermarkEncoder"
    }
}
