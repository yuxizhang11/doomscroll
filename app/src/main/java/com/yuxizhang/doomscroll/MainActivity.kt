package com.yuxizhang.doomscroll

import android.app.Activity
import android.app.TimePickerDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.widget.Toast
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Date
import java.util.Locale

/** Settings, today's usage, and the ways to lift a block for today. */
class MainActivity : Activity() {

    private lateinit var store: Store
    private lateinit var ui: Ui

    // Draft of the limit settings, applied on "Speichern".
    private var perAppMode = false
    private var globalLimit = 0
    private val enabled = mutableMapOf<TargetApp, Boolean>()
    private val limits = mutableMapOf<TargetApp, Int>()
    private var warnMinutes = 0
    private var quietEnabled = false
    private var quietStart = 0
    private var quietEnd = 0

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
                REQUEST_APP_SETTINGS -> openAppSettings()
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
        warnMinutes = store.warnMinutes
        quietEnabled = store.quietEnabled
        quietStart = store.quietStart
        quietEnd = store.quietEnd
    }

    private fun render() {
        setContentView(
            ui.page(
                ui.title("Doomscroll Blocker"),
                ui.subtitle("Weniger scrollen, mehr leben."),
                statusCard(),
                todayCard(),
                weekCard(),
                limitsCard(),
                quietCard(),
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
                ui.body("Läuft sparsam im Hintergrund und wird nur in Instagram, YouTube, TikTok, Snapchat, Facebook, Browsern und den Einstellungen wach."),
                appSettingsButton(),
            )
        }
        return ui.card(
            ui.row(ui.cardTitle("Blocker ist aus"), ui.pill("AUS", ui.surface, ui.danger)),
            ui.body("Schalte „Doomscroll Blocker“ in den Bedienungshilfen ein, damit gezählt und gesperrt wird.", ui.textColor),
            ui.primaryButton("Bedienungshilfen öffnen") {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            },
            ui.body("Ist der Schalter ausgegraut, erlaube in den App-Einstellungen über ⋮ zuerst „Eingeschränkte Einstellungen zulassen“."),
            appSettingsButton(),
            color = ui.dangerSoft,
        )
    }

    private fun todayCard(): View {
        val card = ui.card(ui.cardTitle("Heute"))
        if (store.isQuietNow() && !store.isUnlockedToday(null)) {
            card.addView(ui.pill("Ruhezeit bis ${clock(store.quietEnd)} · alles gesperrt", ui.accentSoft, ui.accent))
            card.addView(ui.spacer(8f))
        }
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

    /** Short-video minutes for the last seven days, today on the right. */
    private fun weekCard(): View {
        val today = LocalDate.now()
        val days = (6L downTo 0L).map { today.minusDays(it) }
        val values = days.map { minutes(store.dayTotalMs(it)).toInt() }
        val labels = days.map { it.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.GERMAN).removeSuffix(".") }
        val total = values.sum()
        return ui.card(
            ui.cardTitle("Letzte 7 Tage"),
            ui.body("Zusammen $total min · Schnitt ${total / days.size} min pro Tag"),
            ui.barChart(labels, values, highlight = days.lastIndex),
        )
    }

    private fun quietCard(): View {
        fun timeButton(prefix: String, minute: () -> Int, set: (Int) -> Unit): View {
            lateinit var button: android.widget.TextView
            button = ui.secondaryButton("$prefix ${clock(minute())}") {
                TimePickerDialog(this, { _, h, m ->
                    set(h * 60 + m)
                    button.text = "$prefix ${clock(minute())}"
                }, minute() / 60, minute() % 60, true).show()
            }
            return button
        }
        val toggle = ui.switch(quietEnabled).apply {
            setOnCheckedChangeListener { _, on -> quietEnabled = on }
        }
        return ui.card(
            ui.row(ui.cardTitle("Ruhezeiten"), toggle),
            ui.body("In dieser Zeit sind alle Kurzvideos gesperrt, egal wie viel vom Limit übrig ist. Kürzer machen oder ausschalten braucht den langen Satz."),
            timeButton("Von", { quietStart }) { quietStart = it },
            timeButton("Bis", { quietEnd }) { quietEnd = it },
            ui.primaryButton("Speichern") { save() },
        )
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
        card.addView(ui.spacer(10f))
        card.addView(ui.label("Vorwarnung", 16f, ui.textColor, bold = true))
        card.addView(stepper("Minuten vor Ablauf", warnMinutes) { warnMinutes = it })
        card.addView(ui.body("0 schaltet sie aus. Ist das Limit nicht länger als die Vorwarnung, kommt keine."))
        card.addView(ui.primaryButton("Speichern") { save() })
        showMode()
        return card
    }

    /** "Label   −  [15] min  +": type any number of minutes, or step by 5 with the buttons. */
    private fun stepper(label: String, initial: Int, onChange: (Int) -> Unit): View {
        val field = ui.input("0").apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(3))
            setText(initial.toString())
            gravity = Gravity.CENTER
            setPadding(ui.dp(6f), ui.dp(8f), ui.dp(6f), ui.dp(8f))
            minWidth = ui.dp(56f)
            setSelectAllOnFocus(true)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(s: Editable?) {
                    onChange((s?.toString()?.toIntOrNull() ?: 0).coerceIn(0, MAX_MINUTES))
                }
            })
        }
        fun change(delta: Int) {
            val now = field.text.toString().toIntOrNull() ?: 0
            field.setText((now + delta).coerceIn(0, MAX_MINUTES).toString())
        }
        return ui.row(
            ui.body(label),
            ui.roundButton("−") { change(-STEP_MINUTES) },
            ui.spacer(0f).apply { layoutParams = android.widget.LinearLayout.LayoutParams(ui.dp(8f), 1) },
            field,
            ui.label(" min", 16f, ui.textColor),
            ui.spacer(0f).apply { layoutParams = android.widget.LinearLayout.LayoutParams(ui.dp(8f), 1) },
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

    /**
     * Opens this app's page in the system settings. While the blocker guards that page,
     * the protection has to be lifted first, or the page would close right away.
     */
    private fun appSettingsButton(): View = ui.secondaryButton("App-Einstellungen öffnen") {
        if (isServiceEnabled() && store.isProtectionActive()) {
            startActivityForResult(UnlockActivity.intent(this, UnlockActivity.SCOPE_PROTECTION), REQUEST_APP_SETTINGS)
        } else {
            openAppSettings()
        }
    }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
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
        val next = PendingSettings(perAppMode, globalLimit, enabled.toMap(), limits.toMap(), warnMinutes, quietEnabled, quietStart, quietEnd)
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
            } ||
            quietShrinks(next)

    /** True when some minute that was quiet before would no longer be quiet. */
    private fun quietShrinks(next: PendingSettings): Boolean {
        if (!store.quietEnabled) return false
        return (0 until 24 * 60).any { m ->
            Store.inWindow(m, store.quietStart, store.quietEnd) &&
                !(next.quietEnabled && Store.inWindow(m, next.quietStart, next.quietEnd))
        }
    }

    private fun apply(settings: PendingSettings) {
        store.perAppMode = settings.perAppMode
        store.globalLimitMinutes = settings.globalLimit
        for (app in TargetApp.entries) {
            store.setEnabled(app, settings.enabled.getValue(app))
            store.setLimitMinutes(app, settings.limits.getValue(app))
        }
        store.warnMinutes = settings.warnMinutes
        store.quietEnabled = settings.quietEnabled
        store.quietStart = settings.quietStart
        store.quietEnd = settings.quietEnd
        Toast.makeText(this, "Gespeichert", Toast.LENGTH_SHORT).show()
    }

    private fun isServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, BlockerService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    private fun minutes(ms: Long): Long = ms / Store.MINUTE

    private fun clock(minuteOfDay: Int) = String.format(Locale.GERMAN, "%02d:%02d", minuteOfDay / 60, minuteOfDay % 60)

    private fun fraction(used: Long, limitMinutes: Int): Float =
        if (limitMinutes <= 0) 1f else used.toFloat() / limitMinutes

    private data class PendingSettings(
        val perAppMode: Boolean,
        val globalLimit: Int,
        val enabled: Map<TargetApp, Boolean>,
        val limits: Map<TargetApp, Int>,
        val warnMinutes: Int,
        val quietEnabled: Boolean,
        val quietStart: Int,
        val quietEnd: Int,
    )

    companion object {
        private const val REQUEST_SETTINGS = 1
        private const val REQUEST_ADULT_OFF = 2
        private const val REQUEST_APP_SETTINGS = 3
        private const val STEP_MINUTES = 5
        private const val MAX_MINUTES = 600
    }
}
