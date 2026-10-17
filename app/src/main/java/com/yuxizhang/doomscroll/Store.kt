package com.yuxizhang.doomscroll

import android.content.Context
import android.content.SharedPreferences
import java.time.LocalDate

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

    fun isEnabled(app: TargetApp): Boolean = prefs.getBoolean("enabled_${app.name}", true)

    fun setEnabled(app: TargetApp, enabled: Boolean) =
        prefs.edit().putBoolean("enabled_${app.name}", enabled).apply()

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
        return if (perAppMode) {
            limitMinutes(app) * MINUTE - usageMs(app)
        } else {
            globalLimitMinutes * MINUTE - totalUsageMs()
        }
    }

    private fun unlockKey(app: TargetApp?) = "unlock_${app?.name ?: "ALL"}"

    private fun ensureToday() {
        val today = LocalDate.now().toString()
        if (prefs.getString(KEY_DAY, null) == today) return
        val editor = prefs.edit()
        prefs.all.keys
            .filter { it.startsWith("usage_") || it.startsWith("unlock_") }
            .forEach(editor::remove)
        editor.putString(KEY_DAY, today).apply()
    }

    companion object {
        const val MINUTE = 60_000L
        private const val KEY_PER_APP = "per_app_mode"
        private const val KEY_GLOBAL_LIMIT = "global_limit"
        private const val KEY_DAY = "day"

        @Volatile
        private var instance: Store? = null

        fun get(context: Context): Store =
            instance ?: synchronized(this) {
                instance ?: Store(context.applicationContext).also { instance = it }
            }
    }
}
