package expo.modules.watermarkencoder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class WatermarkEncoderModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("WatermarkEncoder")

    AsyncFunction("encodeJpeg") { width: Int, height: Int, rgbaBase64: String, quality: Int, outputPath: String ->
      encodeJpeg(width, height, rgbaBase64, quality, outputPath)
    }

    AsyncFunction("encodeOverlay") { inputPath: String, overlayBase64: String, overlayX: Int, overlayY: Int, quality: Int, outputPath: String ->
      encodeOverlay(inputPath, overlayBase64, overlayX, overlayY, quality, outputPath)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private fun nativeLog(message: String) {
    Log.d("WatermarkEncoder", "[native] $message")
  }

  private fun encodeJpeg(width: Int, height: Int, rgbaBase64: String, quality: Int, outputPath: String) {
    if (width <= 0 || height <= 0 || width.toLong() * height.toLong() > Int.MAX_VALUE / 4L) {
      throw IllegalArgumentException("Invalid image dimensions $width x $height")
    }
    var bitmap: Bitmap? = null
    try {
      val rgba = Base64.decode(rgbaBase64, Base64.DEFAULT)
      val expected = width.toLong() * height.toLong() * 4L
      if (rgba.size < expected) {
        throw IllegalArgumentException("RGBA buffer too small: ${rgba.size} < $expected")
      }
      val pixels = IntArray(width * height)
      var offset = 0
      for (i in pixels.indices) {
        pixels[i] = Color.argb(
          rgba[offset + 3].toInt() and 0xFF,
          rgba[offset].toInt() and 0xFF,
          rgba[offset + 1].toInt() and 0xFF,
          rgba[offset + 2].toInt() and 0xFF
        )
        offset += 4
      }
      bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
      writeJpeg(bitmap, outputPath, quality)
    } finally {
      bitmap?.recycle()
    }
  }

  private fun encodeOverlay(inputPath: String, overlayBase64: String, overlayX: Int, overlayY: Int, quality: Int, outputPath: String): Map<String, Any> {
    val timings = mutableMapOf<String, Any>()
    var original: Bitmap? = null
    var overlay: Bitmap? = null
    var result: Bitmap? = null
    try {
      var t = SystemClock.elapsedRealtime()
      original = decodeOrientedOriginal(inputPath)
      timings["decodeOriginalMs"] = SystemClock.elapsedRealtime() - t

      t = SystemClock.elapsedRealtime()
      overlay = decodeOverlay(overlayBase64)
      timings["decodeOverlayMs"] = SystemClock.elapsedRealtime() - t
      timings["overlayWidth"] = overlay.width
      timings["overlayHeight"] = overlay.height
      timings["overlayAlphaNonZero"] = hasAnyAlpha(overlay)

      t = SystemClock.elapsedRealtime()
      result = Bitmap.createBitmap(original.width, original.height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(result)
      canvas.drawBitmap(original, 0f, 0f, null)
      canvas.drawBitmap(overlay, overlayX.toFloat(), overlayY.toFloat(), null)
      timings["compositeApplied"] = true
      timings["drawX"] = overlayX
      timings["drawY"] = overlayY
      timings["sourceWidth"] = original.width
      timings["sourceHeight"] = original.height
      timings["compositeMs"] = SystemClock.elapsedRealtime() - t

      timings["jpegEncodeMs"] = writeJpeg(result, outputPath, quality)
      nativeLog("overlayDone original=${original.width}x${original.height} overlay=${overlay.width}x${overlay.height} path=$outputPath")
      return timings
    } catch (e: Exception) {
      deleteOutput(outputPath)
      throw e
    } finally {
      original?.recycle()
      overlay?.recycle()
      result?.recycle()
    }
  }

  private fun decodeOrientedOriginal(inputPath: String): Bitmap {
    val options = BitmapFactory.Options().apply {
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = decodeFromPath(inputPath, options)
      ?: throw IllegalStateException("Failed to decode original image: $inputPath")
    val degrees = orientationDegrees(inputPath)
    if (degrees == 0) {
      return decoded
    }
    val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
    val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    if (rotated !== decoded) {
      decoded.recycle()
    }
    return rotated
  }

  private fun decodeFromPath(inputPath: String, options: BitmapFactory.Options): Bitmap? {
    val raw = inputPath.trim()
    return when {
      raw.startsWith("content://") ->
        openInputStream(raw)?.use { stream -> BitmapFactory.decodeStream(stream, null, options) }
      raw.startsWith("file://") -> BitmapFactory.decodeFile(Uri.parse(raw).path, options)
      else -> BitmapFactory.decodeFile(raw, options)
    }
  }

  private fun orientationDegrees(inputPath: String): Int {
    val orientation = try {
      val raw = inputPath.trim()
      val value = if (raw.startsWith("content://")) {
        openInputStream(raw)?.use { stream ->
          ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL
      } else {
        val path = if (raw.startsWith("file://")) Uri.parse(raw).path ?: raw else raw
        ExifInterface(File(path)).getAttributeInt(
          ExifInterface.TAG_ORIENTATION,
          ExifInterface.ORIENTATION_NORMAL
        )
      }
      value
    } catch (e: Exception) {
      nativeLog("exifReadFailed=${e.javaClass.simpleName}:${e.message}")
      ExifInterface.ORIENTATION_NORMAL
    }
    return when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
  }

  private fun decodeOverlay(overlayBase64: String): Bitmap {
    val bytes = Base64.decode(overlayBase64, Base64.DEFAULT)
    val options = BitmapFactory.Options().apply {
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      ?: throw IllegalStateException("Failed to decode watermark overlay")
  }

  private fun hasAnyAlpha(overlay: Bitmap): Boolean {
    val width = overlay.width
    val height = overlay.height
    if (width <= 0 || height <= 0) {
      return false
    }
    val row = IntArray(width)
    for (y in 0 until height) {
      overlay.getPixels(row, 0, width, 0, y, width, 1)
      for (x in 0 until width) {
        if ((row[x] ushr 24) and 0xFF != 0) {
          return true
        }
      }
    }
    return false
  }

  private fun writeJpeg(bitmap: Bitmap, outputPath: String, quality: Int): Long {
    val q = quality.coerceIn(1, 100)
    val start = SystemClock.elapsedRealtime()
    val out = File(filePath(outputPath))
    out.parentFile?.mkdirs()
    FileOutputStream(out).use { stream ->
      if (!bitmap.compress(Bitmap.CompressFormat.JPEG, q, stream)) {
        throw IllegalStateException("JPEG compression failed: $outputPath")
      }
    }
    val elapsed = SystemClock.elapsedRealtime() - start
    nativeLog("jpegWroteBytes=${out.length()} quality=$q path=$outputPath")
    return elapsed
  }

  private fun openInputStream(uri: String): InputStream? {
    return context.contentResolver.openInputStream(Uri.parse(uri))
  }

  private fun filePath(raw: String): String {
    return if (raw.startsWith("file://")) {
      Uri.parse(raw).path ?: raw
    } else {
      raw
    }
  }

  private fun deleteOutput(outputPath: String) {
    try {
      val file = File(filePath(outputPath))
      if (file.exists()) {
        file.delete()
      }
    } catch (e: Exception) {
      nativeLog("outputDeleteFailed=${e.javaClass.simpleName}:${e.message}")
    }
  }
}