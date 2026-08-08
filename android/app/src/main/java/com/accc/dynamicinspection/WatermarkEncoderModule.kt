package com.accc.dynamicinspection

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
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

    @ReactMethod
    fun encodeOverlay(
        inputPath: String,
        overlayBase64: String,
        overlayX: Int,
        overlayY: Int,
        quality: Int,
        outputPath: String,
        promise: Promise
    ) {
        if (quality !in 0..100 || overlayX < 0 || overlayY < 0) {
            promise.reject(
                "E_INVALID_ARGS",
                "Invalid overlay args: x=$overlayX y=$overlayY q=$quality"
            )
            return
        }
        val outputFile = File(outputPath)
        Thread {
            var source: Bitmap? = null
            var overlay: Bitmap? = null
            var composited: Bitmap? = null
            try {
                val inputFile = resolveFile(inputPath)
                source = BitmapFactory.decodeFile(inputFile.absolutePath)
                if (source == null) {
                    promise.reject("E_DECODE", "Failed to decode source image: $inputPath")
                    return@Thread
                }
                val overlayBytes = Base64.decode(overlayBase64, Base64.DEFAULT)
                overlay = BitmapFactory.decodeStream(overlayBytes.inputStream())
                if (overlay == null) {
                    promise.reject("E_DECODE", "Failed to decode overlay PNG")
                    return@Thread
                }
                val ox = if (overlayX + overlay.width <= source.width) overlayX else (source.width - overlay.width).coerceAtLeast(0)
                val oy = if (overlayY + overlay.height <= source.height) overlayY else (source.height - overlay.height).coerceAtLeast(0)
                composited = source.copy(source.config ?: Bitmap.Config.ARGB_8888, true)
                val canvas = Canvas(composited)
                canvas.drawBitmap(overlay, ox.toFloat(), oy.toFloat(), null)
                outputFile.parentFile?.mkdirs()
                val stream = FileOutputStream(outputFile)
                try {
                    val ok = composited.compress(Bitmap.CompressFormat.JPEG, quality, stream)
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
                promise.reject("E_OOM", "Out of memory composing overlay onto $inputPath", e)
            } catch (e: Exception) {
                promise.reject("E_ENCODE", "Failed to compose overlay: ${e.message}", e)
            } finally {
                source?.recycle()
                overlay?.recycle()
                composited?.recycle()
            }
        }.start()
    }

    private fun resolveFile(path: String): File {
        val cleaned = path.removePrefix("file://")
        return File(cleaned)
    }

    companion object {
        const val NAME = "WatermarkEncoder"
    }
}