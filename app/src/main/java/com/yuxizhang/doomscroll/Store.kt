package com.yuxizhang.doomscroll

import android.content.Context
import android.content.SharedPreferences
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * All settings and today's counters, kept in one small SharedPreferences file.
 * Usage and unlocks belong to a single day and are wiped the first time they are
 * read on a new day.
 */
class Store private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("doomscroll", Context.MODE_PRIVATE)

    var perAppMode: Boolean
        get() = prefs.getBoolean(KEY_PER_APP, false)
        set(value) = prefs.edit().putBoolean(KEY_PER_APP, value).apply()

    var globalLimitMinutes: Int
        get() = prefs.getInt(KEY_GLOBAL_LIMIT, 30)
        set(value) = prefs.edit().putInt(KEY_GLOBAL_LIMIT, value.coerceAtLeast(0)).apply()

    fun limitMinutes(app: TargetApp): Int = prefs.getInt("limit_${app.name}", 15)

    fun setLimitMinutes(app: TargetApp, minutes: Int) =
        prefs.edit().putInt("limit_${app.name}", minutes.coerceAtLeast(0)).apply()

    /** False until the first-start setup (which apps, how much time) has been finished. */
    var setupDone: Boolean
        get() = prefs.getBoolean(KEY_SETUP_DONE, false)
        set(value) = prefs.edit().putBoolean(KEY_SETUP_DONE, value).apply()

    /** The version whose "what's new" popup was last shown. */
    var lastSeenVersion: String?
        get() = prefs.getString(KEY_LAST_SEEN_VERSION, null)
        set(value) = prefs.edit().putString(KEY_LAST_SEEN_VERSION, value).apply()

    /** The newest version a notification was already shown for. */
    var notifiedVersion: String?
        get() = prefs.getString(KEY_NOTIFIED_VERSION, null)
        set(value) = prefs.edit().putString(KEY_NOTIFIED_VERSION, value).apply()

    /** Whether [app] is one of your apps: only these are counted, blocked and shown. */
    fun isEnabled(app: TargetApp): Boolean = prefs.getBoolean("enabled_${app.name}", true)

    fun setEnabled(app: TargetApp, enabled: Boolean) =
        prefs.edit().putBoolean("enabled_${app.name}", enabled).apply()

    /** Quiet hours: all short videos are blocked between start and end (minutes of the day). */
    var quietEnabled: Boolean
        get() = prefs.getBoolean(KEY_QUIET, false)
        set(value) = prefs.edit().putBoolean(KEY_QUIET, value).apply()

    var quietStart: Int
        get() = prefs.getInt(KEY_QUIET_START, 22 * 60)
        set(value) = prefs.edit().putInt(KEY_QUIET_START, value).apply()

    var quietEnd: Int
        get() = prefs.getInt(KEY_QUIET_END, 7 * 60)
        set(value) = prefs.edit().putInt(KEY_QUIET_END, value).apply()

    fun isQuietNow(): Boolean = quietEnabled && inWindow(minuteOfDay(), quietStart, quietEnd)

    /** Milliseconds until the next quiet hours begin, or null when they are off. */
    fun msUntilQuietStart(): Long? {
        if (!quietEnabled) return null
        val now = LocalDateTime.now()
        val nowMs = (now.hour * 60 + now.minute) * MINUTE + now.second * 1000L
        val startMs = quietStart * MINUTE
        return (startMs - nowMs).mod(DAY_MS).let { if (it == 0L) DAY_MS else it }
    }

    /** Minutes before the limit runs out when the warning shows; 0 switches it off. */
    var warnMinutes: Int
        get() = prefs.getInt(KEY_WARN, 5)
        set(value) = prefs.edit().putInt(KEY_WARN, value.coerceAtLeast(0)).apply()

    /** The daily limit that applies to [app], shared or its own. */
    fun limitFor(app: TargetApp): Int = if (perAppMode) limitMinutes(app) else globalLimitMinutes

    /** The warning is shown once a day per limit. */
    fun wasWarnedToday(app: TargetApp): Boolean {
        ensureToday()
        return prefs.getBoolean(warnKey(app), false)
    }

    fun markWarned(app: TargetApp) {
        ensureToday()
        prefs.edit().putBoolean(warnKey(app), true).apply()
    }

    private fun warnKey(app: TargetApp) = "warn_${if (perAppMode) app.name else "ALL"}"

    /** Short-video time on [day] across all apps; past days come from the saved history. */
    fun dayTotalMs(day: LocalDate): Long {
        ensureToday()
        if (day == LocalDate.now()) return TargetApp.entries.sumOf(::usageMs)
        return prefs.getLong("$HISTORY$day", 0L)
    }

    /** Porn blocker for browsers; on unless switched off with the 20-character code. */
    var adultFilterEnabled: Boolean
        get() = prefs.getBoolean(KEY_ADULT, true)
        set(value) = prefs.edit().putBoolean(KEY_ADULT, value).apply()

    fun isAdultUnlockedToday(): Boolean {
        ensureToday()
        return prefs.getBoolean(KEY_ADULT_UNLOCK, false)
    }

    fun unlockAdultToday() {
        ensureToday()
        prefs.edit().putBoolean(KEY_ADULT_UNLOCK, true).apply()
    }

    fun isAdultFilterActive(): Boolean = adultFilterEnabled && !isAdultUnlockedToday()

    /** Until when (wall clock) the uninstall/switch-off protection is lifted. */
    var protectionUnlockedUntil: Long
        get() = prefs.getLong(KEY_PROTECTION_UNTIL, 0L)
        set(value) = prefs.edit().putLong(KEY_PROTECTION_UNTIL, value).apply()

    /** Short window in which the device admin activation screen may be shown. */
    var adminSetupUntil: Long
        get() = prefs.getLong(KEY_ADMIN_SETUP_UNTIL, 0L)
        set(value) = prefs.edit().putLong(KEY_ADMIN_SETUP_UNTIL, value).apply()

    fun isProtectionActive(): Boolean {
        val now = System.currentTimeMillis()
        return now > protectionUnlockedUntil && now > adminSetupUntil
    }

    fun usageMs(app: TargetApp): Long {
        ensureToday()
        return prefs.getLong("usage_${app.name}", 0L)
    }

    fun addUsage(app: TargetApp, ms: Long) {
        if (ms <= 0) return
        ensureToday()
        prefs.edit().putLong("usage_${app.name}", prefs.getLong("usage_${app.name}", 0L) + ms).apply()
    }

    fun totalUsageMs(): Long = TargetApp.entries.filter(::isEnabled).sumOf(::usageMs)

    fun isUnlockedToday(app: TargetApp?): Boolean {
        ensureToday()
        return prefs.getBoolean(unlockKey(app), false)
    }

    fun unlockToday(app: TargetApp?) {
        ensureToday()
        prefs.edit().putBoolean(unlockKey(app), true).apply()
    }

    /**
     * Milliseconds of short videos left today for [app], or null when it is not limited
     * right now (switched off, or unlocked for today).
     */
    fun remainingMs(app: TargetApp): Long? {
        if (!isEnabled(app) || isUnlockedToday(null) || isUnlockedToday(app)) return null
        if (isQuietNow()) return 0
        val left = if (perAppMode) {
            limitMinutes(app) * MINUTE - usageMs(app)
        } else {
            globalLimitMinutes * MINUTE - totalUsageMs()
        }
        // The timer also has to fire when quiet hours begin.
        return msUntilQuietStart()?.let { minOf(left, it) } ?: left
    }

    private fun unlockKey(app: TargetApp?) = "unlock_${app?.name ?: "ALL"}"

    /**
     * On the first read of a new day, yesterday's total moves into the history (kept for
     * [HISTORY_DAYS] days) and the day's counters, unlocks and warnings are wiped.
     */
    private fun ensureToday() {
        val today = LocalDate.now()
        val last = prefs.getString(KEY_DAY, null)
        if (last == today.toString()) return
        val editor = prefs.edit()
        val all = prefs.all
        if (last != null) {
            val total = all.filterKeys { it.startsWith("usage_") }.values.sumOf { (it as? Long) ?: 0L }
            editor.putLong("$HISTORY$last", total)
        }
        val oldest = today.minusDays(HISTORY_DAYS)
        all.keys
            .filter {
                it.startsWith("usage_") || it.startsWith("unlock_") || it.startsWith("warn_") ||
                    (it.startsWith(HISTORY) && runCatching { LocalDate.parse(it.removePrefix(HISTORY)) < oldest }.getOrDefault(true))
            }
            .forEach(editor::remove)
        editor.putString(KEY_DAY, today.toString()).apply()
    }

    private fun minuteOfDay(): Int = LocalDateTime.now().let { it.hour * 60 + it.minute }

    companion object {
        const val MINUTE = 60_000L
        private const val DAY_MS = 24 * 60 * MINUTE
        private const val HISTORY = "hist_"
        private const val HISTORY_DAYS = 30L
        private const val KEY_WARN = "warning_minutes" // not "warn_", those are wiped daily
        private const val KEY_QUIET = "quiet"
        private const val KEY_QUIET_START = "quiet_start"
        private const val KEY_QUIET_END = "quiet_end"

        /** Whether [minute] lies in the window from [start] to [end], which may run past midnight. */
        fun inWindow(minute: Int, start: Int, end: Int): Boolean = when {
            start == end -> false
            start < end -> minute in start until end
            else -> minute >= start || minute < end
        }
        private const val KEY_PER_APP = "per_app_mode"
        private const val KEY_SETUP_DONE = "setup_done"
        private const val KEY_NOTIFIED_VERSION = "notified_version"
        private const val KEY_LAST_SEEN_VERSION = "last_seen_version"
        private const val KEY_GLOBAL_LIMIT = "global_limit"
        private const val KEY_DAY = "day"
        private const val KEY_ADULT = "adult_filter"
        private const val KEY_ADULT_UNLOCK = "unlock_adult_filter"
        private const val KEY_PROTECTION_UNTIL = "protection_until"
        private const val KEY_ADMIN_SETUP_UNTIL = "admin_setup_until"

        @Volatile
        private var instance: Store? = null

        fun get(context: Context): Store =
            instance ?: synchronized(this) {
                instance ?: Store(context.applicationContext).also { instance = it }
            }
    }
}
