package com.yuxizhang.doomscroll

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.text.format.DateFormat
import android.view.View
import android.widget.Toast
import java.util.Date

/** Settings, today's usage, and the ways to lift a block for today. */
class MainActivity : Activity() {

    private lateinit var store: Store
    private lateinit var ui: Ui

    // Draft of the limit settings, applied on "Speichern".
    private var perAppMode = false
    private var globalLimit = 0
    private val enabled = mutableMapOf<TargetApp, Boolean>()
    private val limits = mutableMapOf<TargetApp, Int>()

    /** Settings waiting for the unlock sentence because they loosen a limit. */
    private var pending: PendingSettings? = null

    override fun onResume() {
        super.onResume()
        store = Store.get(this)
        ui = Ui(this)
        ui.styleWindow(this)
        loadDraft()
        render()
    }

    // The old result API is fine here; the app avoids AndroidX on purpose.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode == RESULT_OK) {
            when (requestCode) {
                REQUEST_SETTINGS -> pending?.let { apply(it) }
                REQUEST_ADULT_OFF -> store.adultFilterEnabled = false
            }
        }
        pending = null
    }

    private fun loadDraft() {
        perAppMode = store.perAppMode
        globalLimit = store.globalLimitMinutes
        for (app in TargetApp.entries) {
            enabled[app] = store.isEnabled(app)
            limits[app] = store.limitMinutes(app)
        }
    }

    private fun render() {
        setContentView(
            ui.page(
                ui.title("Doomscroll Blocker"),
                ui.subtitle("Weniger scrollen, mehr leben."),
                statusCard(),
                todayCard(),
                limitsCard(),
                adultCard(),
                protectionCard(),
                unlockCard(),
            )
        )
    }

    private fun statusCard(): View {
        if (isServiceEnabled()) {
            return ui.card(
                ui.row(ui.cardTitle("Blocker ist aktiv"), ui.pill("AN", ui.successSoft, ui.success)),
                ui.body("Läuft sparsam im Hintergrund und wird nur in Instagram, YouTube, TikTok, Browsern und den Einstellungen wach."),
            )
        }
        return ui.card(
            ui.row(ui.cardTitle("Blocker ist aus"), ui.pill("AUS", ui.surface, ui.danger)),
            ui.body("Schalte „Doomscroll Blocker“ in den Bedienungshilfen ein, damit gezählt und gesperrt wird.", ui.textColor),
            ui.primaryButton("Bedienungshilfen öffnen") {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            },
            color = ui.dangerSoft,
        )
    }

    private fun todayCard(): View {
        val card = ui.card(ui.cardTitle("Heute"))
        if (!store.perAppMode) {
            val total = minutes(store.totalUsageMs())
            card.addView(ui.row(ui.body("Zusammen", ui.textColor), ui.body("$total / ${store.globalLimitMinutes} min", ui.textColor)))
            card.addView(ui.progress(fraction(total, store.globalLimitMinutes)))
        }
        for (app in TargetApp.entries) {
            if (!store.isEnabled(app)) continue
            val used = minutes(store.usageMs(app))
            val unlocked = store.isUnlockedToday(app) || store.isUnlockedToday(null)
            val right = when {
                unlocked -> "$used min · frei"
                store.perAppMode -> "$used / ${store.limitMinutes(app)} min"
                else -> "$used min"
            }
            card.addView(ui.row(ui.body(app.label, ui.textColor), ui.body(right)))
            val limit = if (store.perAppMode) store.limitMinutes(app) else store.globalLimitMinutes
            card.addView(ui.progress(if (unlocked) 0f else fraction(used, limit)))
        }
        return card
    }

    private fun limitsCard(): View {
        val globalRow = stepper("Limit für alle zusammen", globalLimit) { globalLimit = it }
        val appSteppers = TargetApp.entries.associateWith { app ->
            stepper("Tageslimit", limits.getValue(app)) { limits[app] = it }
        }
        fun showMode() {
            globalRow.visibility = if (perAppMode) View.GONE else View.VISIBLE
            appSteppers.values.forEach { it.visibility = if (perAppMode) View.VISIBLE else View.GONE }
        }

        val card = ui.card(
            ui.cardTitle("Limits"),
            ui.body("Lockern (mehr Zeit, App aus, Modus wechseln) braucht den langen Satz."),
            ui.spacer(8f),
            ui.segmented(listOf("Gemeinsam", "Pro App"), if (perAppMode) 1 else 0) {
                perAppMode = it == 1
                showMode()
            },
            ui.spacer(8f),
            globalRow,
        )
        for (app in TargetApp.entries) {
            val toggle = ui.switch(enabled.getValue(app)).apply {
                setOnCheckedChangeListener { _, on -> enabled[app] = on }
            }
            card.addView(ui.spacer(10f))
            card.addView(ui.row(ui.label(app.label, 16f, ui.textColor, bold = true), toggle))
            card.addView(appSteppers.getValue(app))
        }
        card.addView(ui.body("TikTok zählt komplett, weil es fast nur aus dem Video-Feed besteht."))
        card.addView(ui.primaryButton("Speichern") { save() })
        showMode()
        return card
    }

    /** "Label   −  15 min  +" in 5-minute steps. */
    private fun stepper(label: String, start: Int, onChange: (Int) -> Unit): View {
        var value = start
        val shown = ui.label("$value min", 16f, ui.textColor, bold = true).apply {
            gravity = android.view.Gravity.CENTER
            minWidth = ui.dp(76f)
        }
        fun change(delta: Int) {
            value = (value + delta).coerceIn(0, MAX_MINUTES)
            shown.text = "$value min"
            onChange(value)
        }
        return ui.row(
            ui.body(label),
            ui.roundButton("−") { change(-STEP_MINUTES) },
            shown,
            ui.roundButton("+") { change(STEP_MINUTES) },
        ).apply { setPadding(0, ui.dp(6f), 0, ui.dp(6f)) }
    }

    private fun adultCard(): View {
        val on = store.adultFilterEnabled
        val unlocked = store.isAdultUnlockedToday()
        val toggle = ui.switch(on).apply {
            setOnCheckedChangeListener { view, checked ->
                if (checked) {
                    store.adultFilterEnabled = true
                } else {
                    // Turning it off needs the code; the switch only flips once that succeeds.
                    view.isChecked = true
                    @Suppress("DEPRECATION")
                    startActivityForResult(UnlockActivity.intent(this@MainActivity, UnlockActivity.SCOPE_ADULT_OFF), REQUEST_ADULT_OFF)
                }
            }
        }
        val card = ui.card(
            ui.row(ui.cardTitle("Porno-Blocker"), toggle),
            ui.body("Sperrt pornografische Seiten in Chrome, Firefox, Samsung Internet, Brave, Edge, Opera und weiteren Browsern. Alle anderen Seiten bleiben offen."),
        )
        when {
            !on -> Unit
            unlocked -> card.addView(ui.pill("Heute aufgehoben", ui.accentSoft, ui.accent))
            else -> card.addView(ui.secondaryButton("Heute aufheben (20 Zeichen abtippen)") {
                startActivity(UnlockActivity.intent(this, UnlockActivity.SCOPE_ADULT))
            })
        }
        return card
    }

    private fun protectionCard(): View {
        val card = ui.card(
            ui.cardTitle("Schutz vor Abschalten"),
            ui.body("Sperrt die Seiten in den Einstellungen, über die man den Blocker deinstallieren oder in den Bedienungshilfen ausschalten könnte. Aufheben geht nur hier mit 20 Zeichen, dann hast du ${UnlockActivity.PROTECTION_MINUTES} Minuten Zeit."),
        )
        val until = store.protectionUnlockedUntil
        if (System.currentTimeMillis() < until) {
            val time = DateFormat.getTimeFormat(this).format(Date(until))
            card.addView(ui.pill("Aufgehoben bis $time", ui.accentSoft, ui.accent))
        } else {
            card.addView(ui.secondaryButton("${UnlockActivity.PROTECTION_MINUTES} Minuten aufheben (20 Zeichen abtippen)") {
                startActivity(UnlockActivity.intent(this, UnlockActivity.SCOPE_PROTECTION))
            })
        }
        val dpm = getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(this, AdminReceiver::class.java)
        if (dpm.isAdminActive(admin)) {
            card.addView(ui.pill("Deinstallieren gesperrt", ui.successSoft, ui.success))
        } else {
            card.addView(ui.body("Zusätzlich kannst du die App als Geräteadministrator eintragen. Dann lässt Android sie gar nicht erst deinstallieren."))
            card.addView(ui.primaryButton("Deinstallieren sperren") {
                // The activation screen mentions "uninstall", so let it through for a moment.
                store.adminSetupUntil = System.currentTimeMillis() + Store.MINUTE * 2
                startActivity(
                    Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin)
                        .putExtra(
                            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                            "Damit Doomscroll Blocker nicht einfach deinstalliert werden kann. Die App bekommt dadurch keine weiteren Rechte.",
                        )
                )
            })
        }
        return card
    }

    private fun unlockCard(): View {
        val card = ui.card(
            ui.cardTitle("Sperre für heute aufheben"),
            ui.body("Dafür tippst du einen langen Satz ab. Morgen gilt die Sperre wieder."),
        )
        if (store.isUnlockedToday(null)) {
            card.addView(ui.pill("Heute für alle Apps aufgehoben", ui.accentSoft, ui.accent))
            return card
        }
        card.addView(ui.secondaryButton("Für alle Apps") {
            startActivity(UnlockActivity.intent(this, UnlockActivity.SCOPE_ALL))
        })
        for (app in TargetApp.entries) {
            if (store.isUnlockedToday(app)) continue
            card.addView(ui.secondaryButton("Nur ${app.label}") {
                startActivity(UnlockActivity.intent(this, app.name))
            })
        }
        return card
    }

    private fun save() {
        val next = PendingSettings(perAppMode, globalLimit, enabled.toMap(), limits.toMap())
        if (loosens(next)) {
            pending = next
            @Suppress("DEPRECATION")
            startActivityForResult(UnlockActivity.intent(this, UnlockActivity.SCOPE_SETTINGS), REQUEST_SETTINGS)
        } else {
            apply(next)
            render()
        }
    }

    /** Anything that gives you more time than before needs the sentence, like an unlock. */
    private fun loosens(next: PendingSettings): Boolean =
        next.perAppMode != store.perAppMode ||
            next.globalLimit > store.globalLimitMinutes ||
            TargetApp.entries.any { app ->
                (store.isEnabled(app) && !next.enabled.getValue(app)) ||
                    next.limits.getValue(app) > store.limitMinutes(app)
            }

    private fun apply(settings: PendingSettings) {
        store.perAppMode = settings.perAppMode
        store.globalLimitMinutes = settings.globalLimit
        for (app in TargetApp.entries) {
            store.setEnabled(app, settings.enabled.getValue(app))
            store.setLimitMinutes(app, settings.limits.getValue(app))
        }
        Toast.makeText(this, "Gespeichert", Toast.LENGTH_SHORT).show()
    }

    private fun isServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, BlockerService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    private fun minutes(ms: Long): Long = ms / Store.MINUTE

    private fun fraction(used: Long, limitMinutes: Int): Float =
        if (limitMinutes <= 0) 1f else used.toFloat() / limitMinutes

    private data class PendingSettings(
        val perAppMode: Boolean,
        val globalLimit: Int,
        val enabled: Map<TargetApp, Boolean>,
        val limits: Map<TargetApp, Int>,
    )

    companion object {
        private const val REQUEST_SETTINGS = 1
        private const val REQUEST_ADULT_OFF = 2
        private const val STEP_MINUTES = 5
        private const val MAX_MINUTES = 600
    }
}
