package com.yuxizhang.doomscroll

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.Toast

/** Settings, today's usage, and the way to lift the block for today. */
class MainActivity : Activity() {

    private lateinit var store: Store

    private lateinit var perAppRadio: RadioButton
    private lateinit var globalInput: EditText
    private val enabledBoxes = mutableMapOf<TargetApp, CheckBox>()
    private val limitInputs = mutableMapOf<TargetApp, EditText>()

    /** Settings waiting for the unlock sentence because they loosen a limit. */
    private var pending: PendingSettings? = null

    override fun onResume() {
        super.onResume()
        store = Store.get(this)
        render()
    }

    // The old result API is fine here; the app avoids AndroidX on purpose.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_SETTINGS && resultCode == RESULT_OK) {
            pending?.let { apply(it) }
        }
        pending = null
    }

    private fun render() {
        val views = mutableListOf<View>()
        views += Ui.title(this, "Doomscroll Blocker")
        views += serviceStatus()

        views += Ui.section(this, "Tageslimit")
        val group = RadioGroup(this)
        val globalRadio = RadioButton(this).apply { text = "Ein Limit für alle Apps zusammen"; id = View.generateViewId() }
        perAppRadio = RadioButton(this).apply { text = "Ein Limit pro App"; id = View.generateViewId() }
        group.addView(globalRadio)
        group.addView(perAppRadio)
        group.check(if (store.perAppMode) perAppRadio.id else globalRadio.id)
        views += group

        globalInput = Ui.minutesInput(this, store.globalLimitMinutes)
        views += Ui.row(this, Ui.text(this, "Gemeinsames Limit (Minuten):  "), globalInput)
        views += Ui.text(this, "Heute zusammen: ${minutes(store.totalUsageMs())} von ${store.globalLimitMinutes} min")

        views += Ui.section(this, "Apps")
        for (app in TargetApp.entries) {
            val box = CheckBox(this).apply { text = app.label; isChecked = store.isEnabled(app) }
            val input = Ui.minutesInput(this, store.limitMinutes(app))
            enabledBoxes[app] = box
            limitInputs[app] = input
            views += box
            views += Ui.row(this, Ui.text(this, "Limit pro App (Minuten):  "), input)
            views += Ui.text(this, "Heute: ${minutes(store.usageMs(app))} min" + if (store.isUnlockedToday(app)) " · heute entsperrt" else "")
        }
        views += Ui.text(this, "TikTok besteht fast nur aus dem Video-Feed, deshalb zählt dort die ganze App und die Sperre schickt dich zum Startbildschirm.")

        views += Button(this).apply {
            text = "Speichern"
            setOnClickListener { save() }
        }

        views += Ui.section(this, "Sperre für heute aufheben")
        views += Ui.text(this, "Dafür musst du einen langen Satz abtippen. Morgen gilt die Sperre wieder.")
        if (store.isUnlockedToday(null)) {
            views += Ui.text(this, "Heute für alle Apps aufgehoben.")
        } else {
            views += unlockButton("Für alle Apps", UnlockActivity.SCOPE_ALL)
            for (app in TargetApp.entries) {
                if (!store.isUnlockedToday(app)) views += unlockButton("Nur für ${app.label}", app.name)
            }
        }

        setContentView(Ui.page(this, *views.toTypedArray()))
    }

    private fun serviceStatus(): View {
        if (isServiceEnabled()) return Ui.text(this, "✅ Der Blocker läuft im Hintergrund.")
        return Ui.column(
            this,
            Ui.text(this, "⚠️ Der Blocker ist noch aus. Schalte \"Doomscroll Blocker\" in den Bedienungshilfen ein."),
            Button(this).apply {
                text = "Bedienungshilfen öffnen"
                setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            },
        )
    }

    private fun unlockButton(label: String, scope: String) = Button(this).apply {
        text = label
        setOnClickListener { startActivity(UnlockActivity.intent(this@MainActivity, scope)) }
    }

    private fun save() {
        val next = PendingSettings(
            perAppMode = perAppRadio.isChecked,
            globalLimit = globalInput.minutes(store.globalLimitMinutes),
            enabled = TargetApp.entries.associateWith { enabledBoxes.getValue(it).isChecked },
            limits = TargetApp.entries.associateWith { limitInputs.getValue(it).minutes(store.limitMinutes(it)) },
        )
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

    private fun EditText.minutes(fallback: Int): Int = text.toString().trim().toIntOrNull() ?: fallback

    private fun minutes(ms: Long): Long = ms / Store.MINUTE

    private data class PendingSettings(
        val perAppMode: Boolean,
        val globalLimit: Int,
        val enabled: Map<TargetApp, Boolean>,
        val limits: Map<TargetApp, Int>,
    )

    companion object {
        private const val REQUEST_SETTINGS = 1
    }
}
