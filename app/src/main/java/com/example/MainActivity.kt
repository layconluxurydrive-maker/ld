package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.ByteArrayInputStream
import java.io.IOException

private const val GAME_ORIGIN = "https://appassets.local"

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
    )
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
    setContent { InkBladeHost() }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InkBladeHost() {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current

  val webView = remember {
    WebView(context).apply {
      layoutParams =
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT,
        )
      setBackgroundColor(AndroidColor.parseColor("#0B0B0E"))
      isFocusable = true
      isFocusableInTouchMode = true

      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = false
        useWideViewPort = true
        loadWithOverviewMode = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        cacheMode = WebSettings.LOAD_DEFAULT
      }

      webChromeClient = WebChromeClient()
      webViewClient = LocalAssetWebViewClient(context)
      loadUrl("$GAME_ORIGIN/index.html")
    }
  }

  DisposableEffect(lifecycleOwner, webView) {
    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_RESUME -> webView.onResume()
        Lifecycle.Event.ON_PAUSE -> webView.onPause()
        Lifecycle.Event.ON_DESTROY -> webView.destroy()
        else -> Unit
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }

  BackHandler {
    webView.evaluateJavascript("window.inkBladeHandleBack ? window.inkBladeHandleBack() : false") { _ ->
      // Handled inside game pause/modal UI
    }
  }

  Box(
    modifier =
      Modifier.fillMaxSize()
        .background(Color(0xFF0B0B0E))
        .windowInsetsPadding(WindowInsets.displayCutout)
  ) {
    AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
  }
}

private class LocalAssetWebViewClient(private val context: Context) : WebViewClient() {
  override fun shouldInterceptRequest(
    view: WebView,
    request: WebResourceRequest,
  ): WebResourceResponse? {
    val url = request.url
    if (url.scheme != "https" || url.host != "appassets.local") {
      return super.shouldInterceptRequest(view, request)
    }

    val rawPath = url.path?.trimStart('/')?.takeIf { it.isNotEmpty() } ?: "index.html"
    return try {
      val stream = context.assets.open(rawPath)
      val mime = guessMimeType(rawPath)
      val headers = mapOf("Access-Control-Allow-Origin" to "*")
      WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
    } catch (_: IOException) {
      WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }
  }

  private fun guessMimeType(path: String): String =
    when {
      path.endsWith(".html") -> "text/html"
      path.endsWith(".js") || path.endsWith(".mjs") -> "application/javascript"
      path.endsWith(".css") -> "text/css"
      path.endsWith(".json") -> "application/json"
      path.endsWith(".svg") -> "image/svg+xml"
      path.endsWith(".png") -> "image/png"
      path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
      else -> "application/octet-stream"
    }
}
