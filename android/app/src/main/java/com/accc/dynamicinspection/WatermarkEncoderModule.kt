package com.accc.dynamicinspection

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
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
        val outputFile = resolveFile(outputPath)
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
        val outputFile = resolveFile(outputPath)
        Thread {
            var source: Bitmap? = null
            var overlay: Bitmap? = null
            var composited: Bitmap? = null
            try {
                val timing = if (BuildConfig.DEBUG) TimingCollector() else null
                val tDecodeOriginal = timing?.mark()
                val inputFile = resolveFile(inputPath)
                source = BitmapFactory.decodeFile(inputFile.absolutePath)
                timing?.stage("decodeOriginal", tDecodeOriginal)
                if (source == null) {
                    promise.reject("E_DECODE", "Failed to decode source image: $inputPath")
                    return@Thread
                }
                val tOverlay = timing?.mark()
                val overlayBytes = Base64.decode(overlayBase64, Base64.DEFAULT)
                overlay = BitmapFactory.decodeStream(overlayBytes.inputStream())
                timing?.stage("decodeOverlay", tOverlay)
                if (overlay == null) {
                    promise.reject("E_DECODE", "Failed to decode overlay PNG")
                    return@Thread
                }
                val ox = if (overlayX + overlay.width <= source.width) overlayX else (source.width - overlay.width).coerceAtLeast(0)
                val oy = if (overlayY + overlay.height <= source.height) overlayY else (source.height - overlay.height).coerceAtLeast(0)
                val tComposite = timing?.mark()
                composited = source.copy(source.config ?: Bitmap.Config.ARGB_8888, true)
                val canvas = Canvas(composited)
                canvas.drawBitmap(overlay, ox.toFloat(), oy.toFloat(), null)
                timing?.stage("composite", tComposite)
                outputFile.parentFile?.mkdirs()
                val tEnc = timing?.mark()
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
                timing?.stage("jpegEncode", tEnc)
                if (timing != null) {
                    val map = timing.build()
                    map.putDouble("sourceWidth", source.width.toDouble())
                    map.putDouble("sourceHeight", source.height.toDouble())
                    map.putDouble("drawX", ox.toDouble())
                    map.putDouble("drawY", oy.toDouble())
                    map.putDouble("overlayWidth", overlay.width.toDouble())
                    map.putDouble("overlayHeight", overlay.height.toDouble())
                    map.putBoolean("overlayAlphaNonZero", overlayHasAlpha(overlay))
                    map.putBoolean("compositeApplied", compositeChangedPixels(source, composited, ox, oy, overlay.width, overlay.height))
                    promise.resolve(map)
                } else {
                    promise.resolve(true)
                }
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
        var cleaned = path
        if (cleaned.startsWith("file://")) cleaned = cleaned.removePrefix("file://")
        else if (cleaned.startsWith("file:/")) cleaned = cleaned.removePrefix("file:")
        return File(cleaned)
    }

    private fun overlayHasAlpha(overlay: Bitmap): Boolean {
        val w = overlay.width
        val h = overlay.height
        if (w <= 0 || h <= 0) return false
        val pixels = IntArray(w * h)
        overlay.getPixels(pixels, 0, w, 0, 0, w, h)
        for (pixel in pixels) {
            if (pixel ushr 24 and 0xFF > 0) return true
        }
        return false
    }

    private fun compositeChangedPixels(
        source: Bitmap,
        composited: Bitmap,
        ox: Int,
        oy: Int,
        overlayWidth: Int,
        overlayHeight: Int
    ): Boolean {
        val right = (ox + overlayWidth).coerceAtMost(source.width)
        val bottom = (oy + overlayHeight).coerceAtMost(source.height)
        if (right <= ox || bottom <= oy) return false
        val stepX = ((right - ox) / 64).coerceAtLeast(1)
        val stepY = ((bottom - oy) / 64).coerceAtLeast(1)
        var x = ox
        while (x < right) {
            var y = oy
            while (y < bottom) {
                if (source.getPixel(x, y) != composited.getPixel(x, y)) return true
                y += stepY
            }
            x += stepX
        }
        return false
    }

    private class TimingCollector {
        private val marks = LinkedHashMap<String, Double>()

        fun mark(): Long = System.nanoTime()

        fun stage(key: String, startNs: Long?) {
            if (startNs == null) return
            marks[key] = (System.nanoTime() - startNs) / 1_000_000.0
        }

        fun build(): WritableMap {
            val map = Arguments.createMap()
            for ((key, ms) in marks) {
                map.putDouble(key + "Ms", ms)
            }
            return map
        }
    }

    companion object {
        const val NAME = "WatermarkEncoder"
    }
}