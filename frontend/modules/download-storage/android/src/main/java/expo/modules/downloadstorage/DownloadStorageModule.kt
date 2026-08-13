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
    val base = "${downloadRoot()}/"
    return if (relativePath.isEmpty()) base else "$base$relativePath/"
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
    Log.d("DownloadStorage", "RELATIVE_PATH used for export $fileName: $relative")
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, fileName)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      put(MediaStore.Downloads.RELATIVE_PATH, relative)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }

    // Overwrite semantics: reuse an existing row with the same name, otherwise insert a new one.
    val existing = findMediaRow(relative, fileName, resolver)
    val uri = existing ?: (resolver.insert(collection, values)
      ?: throw IllegalStateException("Failed to create MediaStore entry for $fileName"))

    resolver.openOutputStream(uri, "w")?.use { stream ->
      stream.write(bytes)
    } ?: throw IllegalStateException("Failed to open output stream for $fileName")

    values.clear()
    values.put(MediaStore.Downloads.IS_PENDING, 0)
    resolver.update(uri, values, null, null)

    return uri.toString()
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
    if (!dir.exists() && !dir.mkdirs()) {
      throw IllegalStateException("Failed to create directory $dir")
    }
    val file = File(dir, fileName)
    FileOutputStream(file).use { stream -> stream.write(bytes) }
    return Uri.fromFile(file).toString()
  }

  private fun legacyDir(relativePath: String): File {
    val root = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
      ROOT_DIR_NAME
    )
    return if (relativePath.isEmpty()) root else File(root, relativePath)
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
