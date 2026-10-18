package com.yuxizhang.doomscroll

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.ActionMode
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import java.security.SecureRandom

/**
 * Lifts a block for today, or confirms a looser setting, after you type out a challenge by hand:
 * a long sentence for the short-video limits, 20 random characters for the porn blocker.
 * Pasting is switched off.
 */
class UnlockActivity : Activity() {

    private var challenge = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ui = Ui(this)
        ui.styleWindow(this)

        val scope = intent.getStringExtra(EXTRA_SCOPE) ?: SCOPE_ALL
        val app = TargetApp.entries.firstOrNull { it.name == scope }
        val adult = scope == SCOPE_ADULT || scope == SCOPE_ADULT_OFF
        challenge = savedInstanceState?.getString(KEY_CHALLENGE)
            ?: if (adult) randomCode() else SENTENCES.random()

        val what = when (scope) {
            SCOPE_SETTINGS -> "Um das Limit zu lockern"
            SCOPE_ALL -> "Um die Sperre heute für alle Apps aufzuheben"
            SCOPE_ADULT -> "Um den Porno-Blocker heute aufzuheben"
            SCOPE_ADULT_OFF -> "Um den Porno-Blocker auszuschalten"
            else -> "Um die Sperre heute für ${app?.label} aufzuheben"
        }
        val instruction = if (adult) {
            "$what, tippe diese 20 Zeichen genau ab (Groß- und Kleinschreibung zählt):"
        } else {
            "$what, tippe diesen Satz genau ab:"
        }

        val shown = ui.label(challenge, if (adult) 22f else 17f, ui.accent, bold = adult).apply {
            background = ui.rounded(ui.accentSoft, 14f)
            setPadding(ui.dp(16f), ui.dp(16f), ui.dp(16f), ui.dp(16f))
            setLineSpacing(0f, 1.25f)
            if (adult) {
                typeface = Typeface.MONOSPACE
                letterSpacing = 0.08f
                gravity = Gravity.CENTER
            } else {
                setTypeface(typeface, Typeface.ITALIC)
            }
            setTextIsSelectable(false)
        }

        val input = ui.input(if (adult) "20 Zeichen hier abtippen" else "Satz hier abtippen").apply {
            inputType = if (adult) {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            } else {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            }
            if (adult) typeface = Typeface.MONOSPACE
            minLines = if (adult) 1 else 3
            gravity = Gravity.TOP or Gravity.START
            isLongClickable = false
            customSelectionActionModeCallback = NoActions
            customInsertionActionModeCallback = NoActions
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        }

        val confirm = ui.primaryButton("Bestätigen") {
            val ok = if (adult) input.text.toString().trim() == challenge
            else normalize(input.text.toString()) == normalize(challenge)
            if (!ok) {
                Toast.makeText(this, if (adult) "Die Zeichen stimmen noch nicht genau." else "Der Satz stimmt noch nicht genau.", Toast.LENGTH_SHORT).show()
                return@primaryButton
            }
            when (scope) {
                SCOPE_SETTINGS, SCOPE_ADULT_OFF -> Unit
                SCOPE_ADULT -> Store.get(this).unlockAdultToday()
                else -> Store.get(this).unlockToday(app)
            }
            if (scope != SCOPE_SETTINGS && scope != SCOPE_ADULT_OFF) {
                Toast.makeText(this, "Für heute aufgehoben.", Toast.LENGTH_SHORT).show()
            }
            setResult(RESULT_OK)
            finish()
        }

        setContentView(
            ui.page(
                ui.title("Bist du sicher?"),
                ui.subtitle("Kurz innehalten hilft oft schon."),
                ui.card(
                    ui.body(instruction, ui.textColor),
                    ui.spacer(8f),
                    shown,
                    ui.spacer(14f),
                    input,
                    confirm,
                ),
                ui.secondaryButton("Lieber doch nicht") { finish() },
            )
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_CHALLENGE, challenge)
    }

    private object NoActions : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode?, menu: Menu?) = false
        override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?) = false
        override fun onActionItemClicked(mode: ActionMode?, item: MenuItem?) = false
        override fun onDestroyActionMode(mode: ActionMode?) = Unit
    }

    companion object {
        private const val EXTRA_SCOPE = "scope"
        private const val KEY_CHALLENGE = "challenge"
        const val SCOPE_ALL = "ALL"
        const val SCOPE_SETTINGS = "SETTINGS"
        const val SCOPE_ADULT = "ADULT"
        const val SCOPE_ADULT_OFF = "ADULT_OFF"

        // No look-alikes such as 0/O or 1/l/I, so the code can be typed without guessing.
        private const val CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
        private val random = SecureRandom()

        fun intent(context: Context, scope: String): Intent =
            Intent(context, UnlockActivity::class.java).putExtra(EXTRA_SCOPE, scope)

        private fun randomCode(): String =
            (1..20).map { CODE_CHARS[random.nextInt(CODE_CHARS.length)] }.joinToString("")

        /** Case, punctuation and extra spaces don't matter, every word does. */
        fun normalize(text: String): String =
            text.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()

        // Every sentence has at least 15 words.
        private val SENTENCES = listOf(
            "Ich entscheide mich bewusst dafür, heute noch mehr kurze Videos zu schauen, obwohl ich eigentlich etwas anderes vorhatte.",
            "Mir ist klar, dass diese Zeit nicht zurückkommt und ich sie auch mit Freunden oder einem Buch verbringen könnte.",
            "Ich hebe die Sperre jetzt auf, weil ich glaube, dass ein paar weitere Minuten Scrollen mir heute wirklich guttun.",
            "Bevor ich weiterscrolle, atme ich einmal tief durch und frage mich ehrlich, ob ich das gerade wirklich brauche.",
            "Kurze Videos sind so gebaut, dass man nicht aufhört, und ich weiß das, schaue aber trotzdem jetzt weiter.",
            "Heute Abend möchte ich zufrieden auf meinen Tag schauen und nicht bereuen, wie viele Stunden ich am Handy war.",
        )
    }
}
