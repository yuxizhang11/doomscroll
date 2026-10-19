package com.yuxizhang.doomscroll

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Looks for a newer release on GitHub and installs it through the system installer.
 * Android always asks once before an update is installed.
 */
object Updater {

    /** Newest published version and where its APK lies. */
    data class Release(val version: String, val apkUrl: String)

    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    fun currentVersion(context: Context): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0"

    /** Calls [done] on the main thread with a newer release, null when up to date, or the error. */
    fun check(context: Context, done: (Result<Release?>) -> Unit) {
        val current = currentVersion(context)
        worker.execute {
            val result = runCatching {
                val json = JSONObject(get(LATEST_RELEASE).bufferedReader().use { it.readText() })
                val version = json.getString("tag_name").removePrefix("v")
                val assets = json.getJSONArray("assets")
                val apk = (0 until assets.length()).map(assets::getJSONObject)
                    .firstOrNull { it.getString("name").endsWith(".apk") }
                    ?: error("Kein APK im Release")
                Release(version, apk.getString("browser_download_url")).takeIf { isNewer(version, current) }
            }
            main.post { done(result) }
        }
    }

    /**
     * Downloads [release] straight into an install session and hands it to the system,
     * which shows its confirmation. [done] gets null on success or the error message.
     */
    fun install(context: Context, release: Release, done: (String?) -> Unit) {
        val app = context.applicationContext
        worker.execute {
            val error = runCatching {
                val installer = app.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                    .apply { setAppPackageName(app.packageName) }
                val id = installer.createSession(params)
                installer.openSession(id).use { session ->
                    get(release.apkUrl).use { input ->
                        session.openWrite("update.apk", 0, -1).use { out ->
                            input.copyTo(out)
                            session.fsync(out)
                        }
                    }
                    val intent = Intent(app, InstallReceiver::class.java)
                    val pending = PendingIntent.getBroadcast(
                        app, id, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    )
                    session.commit(pending.intentSender)
                }
            }.exceptionOrNull()?.let { it.message ?: it.javaClass.simpleName }
            main.post { done(error) }
        }
    }

    private fun get(url: String) = (URL(url).openConnection() as HttpURLConnection).run {
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        setRequestProperty("Accept", "application/vnd.github+json")
        if (responseCode !in 200..299) error("GitHub antwortet mit $responseCode")
        inputStream
    }

    /** Compares dotted versions like 1.9 and 1.10 number by number. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split('.').map { it.toIntOrNull() ?: 0 }
        val b = current.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private const val REPO = "yuxizhang11/doomscroll"
    private const val LATEST_RELEASE = "https://api.github.com/repos/$REPO/releases/latest"
    private const val TIMEOUT_MS = 15_000
}

/** Receives the installer's answer; when it needs your confirmation, shows its dialog. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "abgebrochen"
                Toast.makeText(context, "Update nicht installiert: $message", Toast.LENGTH_LONG).show()
            }
        }
    }
}
