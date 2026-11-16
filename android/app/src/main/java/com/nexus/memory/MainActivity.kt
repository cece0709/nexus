package com.nexus.memory

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.util.Locale

/**
 * Offline Android host for the product prototype. Only packaged application assets
 * are served, using a secure origin so browser storage, file input and WebGL work.
 * There is deliberately no microphone capture, ASR client or network permission.
 */
class MainActivity : Activity() {
    companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val APP_URL = "https://$ASSET_HOST/assets/index.html"
        private const val PICK_IMAGE = 2101
        private const val SAVE_DOCUMENT = 2102
        private const val NOTIFICATIONS = 2103
        private const val MAX_EXPORT_BYTES = 8 * 1024 * 1024
        private val exportTypes = setOf("application/json", "text/plain", "text/calendar", "audio/wav", "audio/x-wav", "image/jpeg", "image/png", "image/webp", "application/octet-stream")
    }

    private lateinit var webView: WebView
    @Volatile private var trustedDocument = false
    @Volatile private var destroyed = false
    private var imageCallback: ValueCallback<Array<Uri>>? = null
    private var permissionRequestPending = false
    private val saveLock = Any()
    private var pendingSave: PendingExport? = null
    private var pendingEventId: String? = null
    private data class PendingExport(val name: String, val mime: String, val bytes: ByteArray)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(7, 15, 24)
        window.navigationBarColor = Color.rgb(7, 15, 24)
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false)
        else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        val frame = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(7, 15, 24))
            setOnApplyWindowInsetsListener { view, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                } else {
                    @Suppress("DEPRECATION")
                    view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                }
                insets
            }
        }
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 15, 24))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                // Selected image URIs are granted by Android's explicit system picker.
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                mediaPlaybackRequiresUserGesture = true
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                safeBrowsingEnabled = true
                builtInZoomControls = false
                displayZoomControls = false
            }
            addJavascriptInterface(AndroidBridge(), "NexusAndroid")
            webViewClient = LocalAssetClient()
            webChromeClient = LocalChromeClient()
            setDownloadListener { _, _, _, _, _ ->
                Toast.makeText(this@MainActivity, "Use the app’s Export or Download button / 请使用应用内导出按钮", Toast.LENGTH_LONG).show()
            }
        }
        frame.addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(frame)
        pendingEventId = intent?.getStringExtra("event_id")
        webView.loadUrl(APP_URL)
        Thread { ReminderScheduler.createChannel(applicationContext); ReminderScheduler.restoreFuture(applicationContext) }.start()
    }

    private fun isApplicationUrl(uri: Uri): Boolean = uri.scheme == "https" && uri.host == ASSET_HOST && uri.port in setOf(-1, 443) && uri.userInfo == null && uri.path?.startsWith("/assets/") == true

    private fun response(status: Int, reason: String): WebResourceResponse = WebResourceResponse(
        "text/plain", "UTF-8", status, reason, mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(reason.toByteArray(Charsets.UTF_8)))

    private inner class LocalAssetClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !isApplicationUrl(request.url)

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
            if (!isApplicationUrl(request.url) || request.method != "GET") return response(403, "Forbidden")
            val relative = request.url.path?.removePrefix("/assets/") ?: return response(404, "Not found")
            if (relative.isBlank() || relative.contains('\\') || relative.contains('\u0000') || relative.split('/').any { it == "." || it == ".." || it.isBlank() }) return response(403, "Forbidden")
            val extension = relative.substringAfterLast('.', "").lowercase(Locale.ROOT)
            val mime = when (extension) {
                "html" -> "text/html"
                "js", "mjs" -> "text/javascript"
                "css" -> "text/css"
                "json", "map" -> "application/json"
                "svg" -> "image/svg+xml"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "webp" -> "image/webp"
                "woff2" -> "font/woff2"
                "wav" -> "audio/wav"
                "wasm" -> "application/wasm"
                else -> "application/octet-stream"
            }
            return try {
                val headers = mapOf(
                    "Cache-Control" to "no-cache", "X-Content-Type-Options" to "nosniff",
                    "Content-Security-Policy" to "default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"
                )
                WebResourceResponse(mime, "UTF-8", 200, "OK", headers, assets.open(relative))
            } catch (_: FileNotFoundException) { response(404, "Not found") }
            catch (_: Exception) { response(500, "Asset unavailable") }
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            trustedDocument = isApplicationUrl(Uri.parse(url))
        }

        override fun onPageFinished(view: WebView, url: String) {
            trustedDocument = isApplicationUrl(Uri.parse(url))
            if (trustedDocument) {
                emitCapabilities()
                pendingEventId?.let { id -> emit("nexus-native-open-event", JSONObject().put("id", id)); pendingEventId = null }
            }
        }
    }

    private inner class LocalChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            // No implicit microphone or camera access: capture remains a visibly labelled demo.
            request.deny()
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
            imageCallback?.onReceiveValue(null)
            imageCallback = callback
            val picker = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "image/webp"))
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
            }
            return try { startActivityForResult(Intent.createChooser(picker, "Select note photos / 选择笔记照片"), PICK_IMAGE); true }
            catch (_: ActivityNotFoundException) { imageCallback = null; callback.onReceiveValue(null); true }
        }
    }

    private fun capabilityJson(): JSONObject = JSONObject().put("platform", "android").put("bridgeVersion", 1)
        .put("notificationPermission", if (Build.VERSION.SDK_INT < 33) "not-required" else if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
        .put("notificationsEnabled", ReminderScheduler.notificationsEnabled(this))
        .put("exactAlarms", ReminderScheduler.exactAlarmsAllowed(this))
        .put("backgroundReminders", true).put("recording", "demo").put("downloads", true)

    private fun denied(): String = JSONObject().put("ok", false).put("error", "UNTRUSTED_DOCUMENT").toString()

    inner class AndroidBridge {
        @JavascriptInterface fun getCapabilities(): String = if (trustedDocument && !destroyed) capabilityJson().toString() else denied()

        @JavascriptInterface fun scheduleEvent(id: String, title: String, epochMs: Double): String =
            if (trustedDocument && !destroyed) ReminderScheduler.schedule(applicationContext, id, title, epochMs).toString() else denied()

        @JavascriptInterface fun cancelEvent(id: String): String =
            if (trustedDocument && !destroyed) ReminderScheduler.cancel(applicationContext, id).toString() else denied()

        @JavascriptInterface fun cancelAllEvents(): String =
            if (trustedDocument && !destroyed) ReminderScheduler.cancelAll(applicationContext).toString() else denied()

        @JavascriptInterface fun requestNotifications(): String {
            if (!trustedDocument || destroyed) return denied()
            if (ReminderScheduler.notificationsEnabled(this@MainActivity)) return JSONObject().put("ok", true).put("permission", "granted").toString()
            runOnUiThread {
                if (permissionRequestPending || destroyed) return@runOnUiThread
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    val preferences = getSharedPreferences("nexus-native-ui", MODE_PRIVATE)
                    val askedBefore = preferences.getBoolean("notifications-requested", false)
                    if (askedBefore && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                        try { startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)) }
                        catch (_: ActivityNotFoundException) { emitCapabilities() }
                    } else {
                        preferences.edit().putBoolean("notifications-requested", true).apply()
                        permissionRequestPending = true
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATIONS)
                    }
                } else {
                    try { startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)) }
                    catch (_: ActivityNotFoundException) { emitCapabilities() }
                }
            }
            return JSONObject().put("ok", true).put("pending", true).toString()
        }

        @JavascriptInterface fun requestExactAlarmPermission(): String {
            if (!trustedDocument || destroyed) return denied()
            if (ReminderScheduler.exactAlarmsAllowed(this@MainActivity)) return JSONObject().put("ok", true).put("permission", "granted").toString()
            if (Build.VERSION.SDK_INT >= 31) runOnUiThread {
                try { startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))) }
                catch (_: ActivityNotFoundException) { emitCapabilities() }
            }
            return JSONObject().put("ok", true).put("pending", true).toString()
        }

        @JavascriptInterface fun saveBase64(name: String, mime: String, data: String): String {
            if (!trustedDocument || destroyed) return denied()
            val type = mime.substringBefore(';').trim().lowercase(Locale.ROOT)
            if (type !in exportTypes || data.length > (MAX_EXPORT_BYTES * 4L / 3L + 16)) return JSONObject().put("ok", false).put("error", "INVALID_EXPORT").toString()
            val bytes = try { Base64.decode(data, Base64.DEFAULT) } catch (_: IllegalArgumentException) { return JSONObject().put("ok", false).put("error", "INVALID_BASE64").toString() }
            if (bytes.size > MAX_EXPORT_BYTES) return JSONObject().put("ok", false).put("error", "EXPORT_TOO_LARGE").toString()
            val safeName = name.take(120).replace(Regex("[\\x00-\\x1f\\x7f/\\\\:*?\"<>|]"), "_").trim().trim('.').ifBlank { "nexus-export" }
            synchronized(saveLock) {
                if (pendingSave != null) return JSONObject().put("ok", false).put("error", "EXPORT_BUSY").toString()
                pendingSave = PendingExport(safeName, type, bytes)
            }
            runOnUiThread {
                if (destroyed) { synchronized(saveLock) { pendingSave = null }; return@runOnUiThread }
                try {
                    startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        this.type = type
                        putExtra(Intent.EXTRA_TITLE, safeName)
                    }, SAVE_DOCUMENT)
                } catch (_: ActivityNotFoundException) {
                    synchronized(saveLock) { pendingSave = null }
                    emitExportResult(false, safeName, "NO_DOCUMENT_PICKER")
                }
            }
            return JSONObject().put("ok", true).put("pending", true).toString()
        }
    }

    @Deprecated("Uses built-in Activity result flow to avoid an AndroidX runtime dependency")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK_IMAGE) {
            val callback = imageCallback ?: return
            imageCallback = null
            if (resultCode != RESULT_OK || data == null) { callback.onReceiveValue(null); return }
            val selected = mutableListOf<Uri>()
            data.clipData?.let { clip -> for (i in 0 until minOf(clip.itemCount, 4)) selected.add(clip.getItemAt(i).uri) }
            if (selected.isEmpty()) data.data?.let { selected.add(it) }
            // No arbitrary file:// URIs from another activity are exposed to the WebView.
            callback.onReceiveValue(selected.filter { it.scheme == "content" }.toTypedArray().takeIf { it.isNotEmpty() })
        } else if (requestCode == SAVE_DOCUMENT) {
            val export = synchronized(saveLock) { val current = pendingSave; pendingSave = null; current } ?: return
            val destination = data?.data
            if (resultCode != RESULT_OK || destination == null || destination.scheme != "content") { emitExportResult(false, export.name, "CANCELLED"); return }
            Thread {
                try {
                    val output = contentResolver.openOutputStream(destination, "w") ?: throw IllegalStateException("No output stream")
                    output.use { it.write(export.bytes); it.flush() }
                    emitExportResult(true, export.name)
                } catch (_: Exception) { emitExportResult(false, export.name, "WRITE_FAILED") }
            }.start()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATIONS) { permissionRequestPending = false; emitCapabilities() }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) emitCapabilities()
        Thread { ReminderScheduler.restoreFuture(applicationContext) }.start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("event_id")?.let { id ->
            if (trustedDocument) emit("nexus-native-open-event", JSONObject().put("id", id)) else pendingEventId = id
        }
    }

    private fun emitCapabilities() { if (!destroyed) emit("nexus-native-capabilities", capabilityJson()) }

    private fun emitExportResult(ok: Boolean, name: String, error: String? = null) {
        val result = JSONObject().put("ok", ok).put("name", name)
        if (error != null) result.put("error", error)
        emit("nexus-native-export-result", result)
        emit("nexus-native-save-result", result)
    }

    private fun emit(event: String, detail: JSONObject) {
        if (destroyed || !::webView.isInitialized) return
        runOnUiThread {
            if (trustedDocument && !destroyed) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)},{detail:$detail}));", null)
        }
    }

    @Deprecated("Uses platform back navigation")
    override fun onBackPressed() { if (webView.canGoBack()) webView.goBack() else super.onBackPressed() }

    override fun onDestroy() {
        destroyed = true
        trustedDocument = false
        imageCallback?.onReceiveValue(null)
        imageCallback = null
        synchronized(saveLock) { pendingSave = null }
        if (::webView.isInitialized) { webView.removeJavascriptInterface("NexusAndroid"); webView.stopLoading(); webView.destroy() }
        super.onDestroy()
    }
}
