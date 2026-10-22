package com.yuxizhang.doomscroll

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView

/**
 * Watches the short-video apps through the accessibility API, the address bar of common
 * browsers for pornographic sites and short videos, and the system screens that could switch it off.
 *
 * Efficiency: the system only wakes this service for events from the watched apps
 * (see accessibility_config.xml). While a short video screen is open it glances at which app
 * is in front every second and re-checks the screen every few seconds to notice when you
 * leave, and a single timer fires exactly when the daily limit runs out. Outside those apps
 * nothing runs at all.
 */
class BlockerService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var store: Store

    private var activeApp: TargetApp? = null
    private var sessionStart = 0L
    private var lastBlockAt = 0L
    private var lastApp: TargetApp? = null
    private var lastSessionEnd = 0L
    private var overlay: View? = null

    private var lastScreenCheck = 0L
    private val checkScreen = Runnable {
        lastScreenCheck = SystemClock.elapsedRealtime()
        onScreenMaybeChanged()
    }
    private var browserCheckPending = false
    private val checkBrowser = Runnable {
        browserCheckPending = false
        onBrowserMaybeChanged()
    }
    private val checkGuard = Runnable { onSettingsMaybeChanged() }
    private val hideOverlay = Runnable { removeOverlay() }

    private var pollTicks = 0
    private val poll = object : Runnable {
        override fun run() {
            // The home screen and other apps send no events (only the watched apps do), so
            // a cheap look at which app is in front is what notices you left within a second.
            when {
                !isActiveAppInFront() -> endSession(leftApp = true)
                ++pollTicks % FULL_CHECK_TICKS == 0 -> onScreenMaybeChanged()
            }
            if (activeApp != null) handler.postDelayed(this, POLL_MS)
        }
    }

    private val limitReached = Runnable {
        val app = activeApp ?: return@Runnable
        endSession()
        if (detectShortForm() == app) block(app)
    }

    private val warn = Runnable {
        val app = activeApp ?: return@Runnable
        flushUsage()
        val left = store.remainingMs(app) ?: return@Runnable
        if (left <= 0) return@Runnable
        store.markWarned(app)
        val minutes = (left + Store.MINUTE - 1) / Store.MINUTE
        showOverlay(if (minutes == 1L) "Noch 1 Minute ⏳" else "Noch $minutes Minuten ⏳")
    }

    private val screenOff = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = endSession(leftApp = true)
    }

    override fun onServiceConnected() {
        store = Store.get(this)
        UpdateJob.schedule(this)
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenOff, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(screenOff, filter)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event != null && AdultFilter.isBrowser(event.packageName)) {
            // Throttled, not debounced: a loading page fires events nonstop and would push a
            // debounced check back forever.
            if (isAddressChange(event) && !browserCheckPending) {
                browserCheckPending = true
                handler.postDelayed(checkBrowser, BROWSER_CHECK_MS)
            }
            return
        }
        if (event != null && Guard.isWatched(event.packageName)) {
            handler.removeCallbacks(checkGuard)
            handler.postDelayed(checkGuard, DEBOUNCE_MS)
            return
        }
        // Events arrive in bursts while videos play; look at the screen once they settle,
        // but at least once a second, since a playing video may never let them settle.
        // Opening an app or screen is looked at right away, so the time left shows without delay.
        handler.removeCallbacks(checkScreen)
        val waited = SystemClock.elapsedRealtime() - lastScreenCheck
        val opened = event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        handler.postDelayed(checkScreen, if (opened || waited > SCREEN_MAX_WAIT_MS) 0 else DEBOUNCE_MS)
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        endSession()
        runCatching { unregisterReceiver(screenOff) }
        removeOverlay()
        handler.removeCallbacksAndMessages(null)
        browserCheckPending = false
        super.onDestroy()
    }

    /**
     * Scrolling never changes the address, so it is dropped without a lookup. Typing and
     * content changes all count: Compose toolbars (Firefox) report a new address as a subtree change, not a text change.
     */
    private fun isAddressChange(event: AccessibilityEvent): Boolean =
        event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED

    /** Porn first; otherwise the browser may be showing short videos (youtube.com/shorts and so on). */
    private fun onBrowserMaybeChanged() {
        val root = rootInActiveWindow ?: return
        if (!AdultFilter.isBrowser(root.packageName)) return
        // Read once: on browsers without known ids this walks the toolbar.
        val address = AdultFilter.currentAddress(root)
        if (store.isAdultFilterActive() && blockPorn(root, address)) return
        onScreenMaybeChanged(address?.let(TargetApp::fromAddress))
    }

    /** Returns true when it stepped in. */
    private fun blockPorn(root: AccessibilityNodeInfo, address: String?): Boolean {
        // Typing a porn word or site is stopped right away: the field is emptied and you
        // are sent to the home screen before anything loads.
        val field = AdultFilter.typingField(root)
        if (field != null && AdultFilter.isPorn(field.text?.toString().orEmpty())) {
            val empty = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
            }
            field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, empty)
            showOverlay("Diese Suche ist gesperrt 🔒")
            performGlobalAction(GLOBAL_ACTION_HOME)
            return true
        }
        if (address == null || !AdultFilter.isPorn(address)) return false
        val pkg = root.packageName
        showOverlay("Diese Seite ist gesperrt 🔒")
        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed({
            val now = rootInActiveWindow
            val still = now != null && now.packageName == pkg &&
                AdultFilter.currentAddress(now)?.let(AdultFilter::isPorn) == true
            if (still) performGlobalAction(GLOBAL_ACTION_HOME)
        }, RETRY_MS)
        return true
    }

    private fun onSettingsMaybeChanged() {
        if (!store.isProtectionActive()) return
        val root = rootInActiveWindow ?: return
        if (!Guard.isWatched(root.packageName) || !Guard.isTamperScreen(root)) return
        showOverlay("Geschützt 🔒\nErst in Doomscroll Blocker mit 20 Zeichen freischalten")
        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed({
            val now = rootInActiveWindow
            if (now != null && Guard.isWatched(now.packageName) && Guard.isTamperScreen(now)) {
                performGlobalAction(GLOBAL_ACTION_HOME)
            }
        }, RETRY_MS)
    }

    private fun onScreenMaybeChanged(detected: TargetApp? = detectShortForm()) {
        // Apps you did not choose are neither counted nor blocked.
        val app = detected?.takeIf(store::isEnabled)
        when {
            app == null -> endSession()
            app != activeApp -> startSession(app)
            else -> flushUsage()
        }
    }

    /** Only reads the package of the front window, much cheaper than [detectShortForm]. */
    private fun isActiveAppInFront(): Boolean {
        val pkg = rootInActiveWindow?.packageName ?: return true
        return TargetApp.fromPackage(pkg) == activeApp || AdultFilter.isBrowser(pkg)
    }

    private fun detectShortForm(): TargetApp? {
        val root = rootInActiveWindow ?: return null
        TargetApp.fromPackage(root.packageName)?.let { app ->
            return if (app.isShortFormOnScreen(root)) app else null
        }
        if (!AdultFilter.isBrowser(root.packageName)) return null
        return AdultFilter.currentAddress(root)?.let(TargetApp::fromAddress)
    }

    private fun startSession(app: TargetApp) {
        endSession()
        val remaining = store.remainingMs(app)
        if (remaining != null && remaining <= 0) {
            block(app)
            return
        }
        val now = SystemClock.elapsedRealtime()
        // Show the time left every time counting starts again; only a split-second gap
        // inside the app (the screen briefly not recognised while scrolling) doesn't count.
        if (remaining != null && (app != lastApp || now - lastSessionEnd > REMINDER_GAP_MS)) {
            val minutes = (remaining + Store.MINUTE - 1) / Store.MINUTE
            showOverlay(if (minutes == 1L) "Noch 1 Minute" else "Noch $minutes Minuten", small = true)
        }
        activeApp = app
        sessionStart = now
        pollTicks = 0
        handler.postDelayed(poll, POLL_MS)
        if (remaining != null) {
            handler.postDelayed(limitReached, remaining)
            // A warning only makes sense when the limit is longer than the warning time.
            val warnMinutes = store.warnMinutes
            if (warnMinutes > 0 && store.limitFor(app) > warnMinutes && !store.wasWarnedToday(app)) {
                handler.postDelayed(warn, (remaining - warnMinutes * Store.MINUTE).coerceAtLeast(0))
            }
        }
    }

    /** With [leftApp] the next visit always shows the time left, however soon it comes. */
    private fun endSession(leftApp: Boolean = false) {
        if (activeApp != null) {
            lastApp = if (leftApp) null else activeApp
            lastSessionEnd = SystemClock.elapsedRealtime()
        }
        flushUsage()
        activeApp = null
        handler.removeCallbacks(poll)
        handler.removeCallbacks(limitReached)
        handler.removeCallbacks(warn)
    }

    /** Writes the time since the last flush, so nothing is lost if the process dies. */
    private fun flushUsage() {
        val app = activeApp ?: return
        val now = SystemClock.elapsedRealtime()
        store.addUsage(app, now - sessionStart)
        sessionStart = now
    }

    private fun block(app: TargetApp) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastBlockAt > OVERLAY_COOLDOWN_MS) {
            showOverlay(if (store.isQuietNow()) "Ruhezeit 🌙" else "Genug für heute! ✋")
        }
        lastBlockAt = now

        if (app.wholeAppIsShortForm) {
            performGlobalAction(GLOBAL_ACTION_HOME)
            return
        }
        // Back leaves Reels/Shorts and keeps the rest of the app usable.
        // If that is not enough, try once more and then fall back to the home screen.
        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed({
            if (detectShortForm() == app) {
                performGlobalAction(GLOBAL_ACTION_BACK)
                handler.postDelayed({
                    if (detectShortForm() == app) performGlobalAction(GLOBAL_ACTION_HOME)
                }, RETRY_MS)
            }
        }, RETRY_MS)
    }

    /** A big message in the middle, or with [small] a short hint near the top. */
    private fun showOverlay(message: String, small: Boolean = false) {
        removeOverlay()
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val dp = { v: Float -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics) }
        val view = TextView(this).apply {
            text = message
            setTextColor(0xFFFFFFFF.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (small) 16f else 22f)
            gravity = Gravity.CENTER
            val pad = dp(if (small) 14f else 24f).toInt()
            setPadding(pad * 3 / 2, pad, pad * 3 / 2, pad)
            background = GradientDrawable().apply {
                cornerRadius = dp(20f)
                setColor(0xEE222222.toInt())
            }
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            if (small) {
                gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                y = dp(72f).toInt()
            } else {
                gravity = Gravity.CENTER
            }
        }
        runCatching {
            wm.addView(view, params)
            overlay = view
            handler.postDelayed(hideOverlay, OVERLAY_MS)
        }
    }

    private fun removeOverlay() {
        handler.removeCallbacks(hideOverlay)
        val view = overlay ?: return
        overlay = null
        runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(view) }
    }

    companion object {
        private const val DEBOUNCE_MS = 150L
        private const val SCREEN_MAX_WAIT_MS = 1_000L
        private const val BROWSER_CHECK_MS = 500L
        private const val POLL_MS = 1_000L
        private const val FULL_CHECK_TICKS = 5
        private const val RETRY_MS = 600L
        private const val OVERLAY_MS = 2_500L
        private const val REMINDER_GAP_MS = 1_000L
        private const val OVERLAY_COOLDOWN_MS = 4_000L
    }
}
