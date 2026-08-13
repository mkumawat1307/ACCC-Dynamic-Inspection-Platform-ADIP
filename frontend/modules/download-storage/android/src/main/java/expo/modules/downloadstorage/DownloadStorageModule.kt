package expo.modules.downloadstorage

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class DownloadStorageModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("DownloadStorage")

    Constants(
      "androidApiLevel" to Build.VERSION.SDK_INT
    )

    AsyncFunction("hasFiles") { relativePath: String ->
      hasFiles(relativePath)
    }

    AsyncFunction("writeBase64") { relativePath: String, fileName: String, mimeType: String, base64: String ->
      writeBase64(relativePath, fileName, mimeType, base64)
    }

    AsyncFunction("writeUtf8") { relativePath: String, fileName: String, mimeType: String, text: String ->
      writeUtf8(relativePath, fileName, mimeType, text)
    }

    AsyncFunction("readBase64") { uri: String ->
      readBase64(uri)
    }

    AsyncFunction("deleteFile") { uri: String ->
      deleteFile(uri)
    }

    AsyncFunction("findFile") { relativePath: String, fileName: String ->
      findFile(relativePath, fileName)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  // MediaStore.Downloads.RELATIVE_PATH is relative to the Downloads directory —
  // it must NOT include the "Download/" prefix or MediaStore rejects it.
  private fun downloadRoot(): String = ROOT_DIR_NAME

  /** Returns e.g. "ACCC Dynamic Inspection/" or "ACCC Dynamic Inspection/<rel>/". */
  private fun downloadRelativePath(relativePath: String): String {
    val normalized = normalizeRelativePath(relativePath)
    val base = "${downloadRoot()}/"
    return if (normalized.isEmpty()) base else "$base$normalized/"
  }

  // MediaStore.Downloads.RELATIVE_PATH must be relative to the Downloads root:
  // the final path NEVER contains a leading "/" or a "Download/" segment prefix.
  private fun normalizeRelativePath(raw: String): String {
    var p = raw.trim()
    while (p.startsWith("/") || p.startsWith("../")) {
      p = if (p.startsWith("/")) p.substring(1) else p.substring(3)
    }
    if (p.equals("Download", ignoreCase = true)) {
      p = ""
    } else if (p.startsWith("Download/", ignoreCase = true)) {
      p = p.substring("Download/".length)
    }
    while (p.startsWith("/")) {
      p = p.substring(1)
    }
    p = p.split('/').filter { it.isNotEmpty() }.joinToString("/")
    if (p != raw) {
      nativeLog("normalizedRelativePath='$p'")
    }
    return p
  }

  private fun nativeLog(message: String) {
    Log.d("DownloadStorage", "[Storage:native] $message")
  }

  private fun hasFiles(relativePath: String): Boolean {
    val prefix = downloadRelativePath(relativePath)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val projection = arrayOf(MediaStore.Downloads._ID)
      val selection = "${MediaStore.Downloads.RELATIVE_PATH} LIKE ?"
      val selectionArgs = arrayOf("$prefix%")
      return context.contentResolver
        .query(collection, projection, selection, selectionArgs, null)
        ?.use { cursor -> cursor.moveToFirst() } ?: false
    }
    return legacyDir(relativePath).let { dir -> dir.exists() && (dir.listFiles()?.isNotEmpty() ?: false) }
  }

  private fun writeBase64(relativePath: String, fileName: String, mimeType: String, base64: String): String {
    val bytes = Base64.decode(base64, Base64.DEFAULT)
    return writeBytes(relativePath, fileName, mimeType, bytes)
  }

  private fun writeUtf8(relativePath: String, fileName: String, mimeType: String, text: String): String {
    return writeBytes(relativePath, fileName, mimeType, text.toByteArray(Charsets.UTF_8))
  }

  private fun writeBytes(relativePath: String, fileName: String, mimeType: String, bytes: ByteArray): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return writeBytesModern(relativePath, fileName, mimeType, bytes)
    }
    return writeBytesLegacy(relativePath, fileName, bytes)
  }

  private fun writeBytesModern(relativePath: String, fileName: String, mimeType: String, bytes: ByteArray): String {
    val resolver = context.contentResolver
    val relative = downloadRelativePath(relativePath)
    // Every write (photos, Excel/CSV exports, backups) lands under
    // Download/ACCC Dynamic Inspection, so the Downloads collection is used for all
    // of them. MediaStore creates the directory tree implicitly on first insert
    // (API >= 29) — no manual mkdir is needed or performed here.
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    nativeLog("collection=Downloads")
    nativeLog("relativePath='$relative'")
    nativeLog("displayName='$fileName'")

    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, fileName)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      put(MediaStore.Downloads.RELATIVE_PATH, relative)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }

    try {
      nativeLog("insertStart")
      // Overwrite semantics: reuse an existing row with the same name, otherwise insert a new one.
      val existing = findMediaRow(relative, fileName, resolver)
      val uri = existing ?: (resolver.insert(collection, values)
        ?: throw IllegalStateException("Failed to create MediaStore entry for $fileName"))
      nativeLog("insertUri=$uri")

      resolver.openOutputStream(uri, "w")?.use { stream ->
        stream.write(bytes)
      } ?: throw IllegalStateException("Failed to open output stream for $fileName")

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)

      nativeLog("writeSuccess")
      return uri.toString()
    } catch (e: Exception) {
      nativeLog("writeFailed=${e.javaClass.simpleName}:${e.message}")
      throw e
    }
  }

  private fun findMediaRow(relative: String, fileName: String, resolver: android.content.ContentResolver): Uri? {
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val projection = arrayOf(MediaStore.Downloads._ID)
    val selection = "${MediaStore.Downloads.DISPLAY_NAME} = ? AND ${MediaStore.Downloads.RELATIVE_PATH} = ?"
    val selectionArgs = arrayOf(fileName, relative)
    return resolver.query(collection, projection, selection, selectionArgs, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID))
        Uri.withAppendedPath(collection, id.toString())
      } else {
        null
      }
    }
  }

  private fun writeBytesLegacy(relativePath: String, fileName: String, bytes: ByteArray): String {
    val dir = legacyDir(relativePath)
    nativeLog("collection=Downloads-legacy (API ${Build.VERSION.SDK_INT})")
    nativeLog("relativePath='${dir.path}'")
    nativeLog("displayName='$fileName'")
    try {
      if (!dir.exists() && !dir.mkdirs()) {
        throw IllegalStateException("Failed to create directory $dir")
      }
      val file = File(dir, fileName)
      FileOutputStream(file).use { stream -> stream.write(bytes) }
      nativeLog("writeSuccess")
      return Uri.fromFile(file).toString()
    } catch (e: Exception) {
      nativeLog("writeFailed=${e.javaClass.simpleName}:${e.message}")
      throw e
    }
  }

  private fun legacyDir(relativePath: String): File {
    val root = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
      ROOT_DIR_NAME
    )
    val normalized = normalizeRelativePath(relativePath)
    return if (normalized.isEmpty()) root else File(root, normalized)
  }

  private fun readBase64(uri: String): String {
    val parsed = Uri.parse(uri)
    val bytes = when (parsed.scheme) {
      "content" -> context.contentResolver
        .openInputStream(parsed)
        ?.use { stream -> stream.readBytes() }
        ?: throw IllegalStateException("Cannot read $uri")
      else -> File(parsed.path ?: throw IllegalStateException("Cannot read $uri")).readBytes()
    }
    return Base64.encodeToString(bytes, Base64.NO_WRAP)
  }

  private fun deleteFile(uri: String): Boolean {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "content" -> context.contentResolver.delete(parsed, null, null) > 0
      else -> {
        val file = File(parsed.path ?: return false)
        file.exists() && file.delete()
      }
    }
  }

  private fun findFile(relativePath: String, fileName: String): String? {
    val relative = downloadRelativePath(relativePath)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return findMediaRow(relative, fileName, context.contentResolver)?.toString()
    }
    val file = File(legacyDir(relativePath), fileName)
    return if (file.exists()) Uri.fromFile(file).toString() else null
  }

  private companion object {
    const val ROOT_DIR_NAME = "ACCC Dynamic Inspection"
  }
}
