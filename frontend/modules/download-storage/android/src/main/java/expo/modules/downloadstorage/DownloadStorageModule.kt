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

    AsyncFunction("ensureFolder") { relativePath: String ->
      ensureFolder(relativePath)
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

    AsyncFunction("renameFile") { uri: String, newFileName: String ->
      renameFile(uri, newFileName)
    }

    AsyncFunction("getRelativePath") { uri: String ->
      getRelativePath(uri)
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  // MediaStore.Downloads.RELATIVE_PATH must start with Download/ for API >= 29.
  // The path is relative to the Downloads root, but the primary directory segment
  // must be "Download" for content://media/external_primary/downloads.
  private fun downloadRelativePath(relativePath: String): String {
    val normalized = normalizeRelativePath(relativePath)
    val base = "Download/${ROOT_DIR_NAME}/"
    val finalPath = if (normalized.isEmpty()) base else "$base$normalized/"
    nativeLog("finalRelativePath='$finalPath'")
    return finalPath
  }

  // Keep these protections:
  // - remove leading /
  // - block ../ traversal
  // - collapse duplicate Download/Download/
  // Do NOT strip Download/ — it is required by MediaStore.Downloads.
  private fun normalizeRelativePath(raw: String): String {
    var p = raw.trim()
    while (p.startsWith("/") || p.startsWith("../")) {
      p = if (p.startsWith("/")) p.substring(1) else p.substring(3)
    }
    p = p.replace(Regex("(?i)Download/Download/"), "Download/")
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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return folderHasFiles(downloadRelativePath(relativePath))
    }
    return legacyDir(relativePath).let { dir -> dir.exists() && (dir.listFiles()?.isNotEmpty() ?: false) }
  }

  /**
   * Idempotent folder creation. Returns true when the folder already existed,
   * false when it was just created. Throws on failure — never swallows errors.
   */
  private fun ensureFolder(relativePath: String): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val relative = downloadRelativePath(relativePath)
      if (folderHasFiles(relative)) {
        nativeLog("ensureFolderExists=true relativePath='$relative'")
        return true
      }
      // Directory is missing or empty. Materialize it with a pending placeholder
      // row, then remove the placeholder — MediaStore keeps the empty directory.
      if (!createDirectoryPlaceholder(relative)) {
        throw IllegalStateException("Failed to ensure folder '$relative'")
      }
      nativeLog("ensureFolderCreated=true relativePath='$relative'")
      return false
    }
    val dir = legacyDir(relativePath)
    if (dir.exists()) {
      nativeLog("ensureFolderExists=true path='${dir.path}'")
      return true
    }
    if (!dir.mkdirs()) {
      throw IllegalStateException("Failed to create directory $dir")
    }
    nativeLog("ensureFolderCreated=true path='${dir.path}'")
    return false
  }

  private fun escapeLikeWildcards(value: String): String {
    return buildString {
      for (ch in value) {
        if (ch == '\\' || ch == '%' || ch == '_') {
          append('\\')
        }
        append(ch)
      }
    }
  }

  private fun folderHasFiles(relative: String): Boolean {
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val projection = arrayOf(MediaStore.Downloads._ID)
    val selection = "${MediaStore.Downloads.RELATIVE_PATH} LIKE ? ESCAPE '\\'"
    val selectionArgs = arrayOf("${escapeLikeWildcards(relative)}%")
    return context.contentResolver
      .query(collection, projection, selection, selectionArgs, null)
      ?.use { cursor -> cursor.moveToFirst() } ?: false
  }

  private fun createDirectoryPlaceholder(relative: String): Boolean {
    val resolver = context.contentResolver
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    try {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, ".accc_ensure_${System.currentTimeMillis()}")
        put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream")
        put(MediaStore.Downloads.RELATIVE_PATH, relative)
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(collection, values) ?: return false
      resolver.openOutputStream(uri, "w")?.use { /* materialize directory */ } ?: return false
      resolver.delete(uri, null, null)
      return true
    } catch (e: Exception) {
      nativeLog("ensureFolderPlaceholderFailed=${e.javaClass.simpleName}:${e.message}")
      return false
    }
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

  /**
   * Renames an existing file in place. Returns the resulting URI, or null when
   * the file does not exist (the caller decides to skip). Never re-encodes the
   * bytes, so watermark pixels and GPS metadata are preserved.
   */
  private fun renameFile(uri: String, newFileName: String): String? {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == "content") {
      val resolver = context.contentResolver
      val exists = resolver.query(parsed, arrayOf(MediaStore.Downloads._ID), null, null, null)
        ?.use { cursor -> cursor.moveToFirst() } ?: false
      if (!exists) {
        nativeLog("renameNotFound uri=$uri")
        return null
      }
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, newFileName)
      }
      val updated = resolver.update(parsed, values, null, null)
      if (updated <= 0) {
        throw IllegalStateException("Failed to rename MediaStore entry $uri")
      }
      nativeLog("renameSuccess uri=$uri")
      return parsed.toString()
    }
    val file = File(parsed.path ?: return null)
    if (!file.exists()) {
      nativeLog("renameNotFound path=${file.path}")
      return null
    }
    val renamed = File(file.parentFile, newFileName)
    if (!file.renameTo(renamed)) {
      throw IllegalStateException("Failed to rename ${file.path}")
    }
    nativeLog("renameSuccess path=${renamed.path}")
    return Uri.fromFile(renamed).toString()
  }

  // Returns the MediaStore RELATIVE_PATH (e.g. "Download/ACCC Dynamic Inspection/<label>/")
  // for a content:// photo URI, or null when the row is missing or not resolvable.
  private fun getRelativePath(uri: String): String? {
    val parsed = try {
      Uri.parse(uri)
    } catch (e: Exception) {
      nativeLog("getRelativePathParseError uri=$uri err=${e.message}")
      return null
    }
    if (parsed.lastPathSegment.isNullOrEmpty()) return null
    val resolver = context.contentResolver
    return try {
      resolver.query(
        parsed,
        arrayOf(MediaStore.Downloads.RELATIVE_PATH),
        null,
        null,
        null
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Downloads.RELATIVE_PATH))
        } else {
          null
        }
      }
    } catch (e: Exception) {
      nativeLog("getRelativePathQueryError uri=$uri err=${e.message}")
      null
    }
  }

  private companion object {
    const val ROOT_DIR_NAME = "ACCC Dynamic Inspection"
  }
}
