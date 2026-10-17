package com.yuxizhang.doomscroll

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.widget.Button
import android.widget.EditText
import android.widget.Toast

/**
 * Lifts the block for today (for one app or all of them) or confirms a looser setting,
 * after you type out a long sentence by hand. Pasting is switched off.
 */
class UnlockActivity : Activity() {

    private val sentence = SENTENCES.random()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scope = intent.getStringExtra(EXTRA_SCOPE) ?: SCOPE_ALL
        val app = TargetApp.entries.firstOrNull { it.name == scope }

        val what = when (scope) {
            SCOPE_SETTINGS -> "Um das Limit zu lockern"
            SCOPE_ALL -> "Um die Sperre heute für alle Apps aufzuheben"
            else -> "Um die Sperre heute für ${app?.label} aufzuheben"
        }

        val input = EditText(this).apply {
            hint = "Satz hier abtippen"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            minLines = 3
            isLongClickable = false
            customSelectionActionModeCallback = NoActions
            customInsertionActionModeCallback = NoActions
        }

        val confirm = Button(this).apply {
            text = "Bestätigen"
            setOnClickListener {
                if (normalize(input.text.toString()) != normalize(sentence)) {
                    Toast.makeText(context, "Der Satz stimmt noch nicht genau.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                if (scope != SCOPE_SETTINGS) {
                    Store.get(context).unlockToday(app)
                    Toast.makeText(context, "Für heute aufgehoben.", Toast.LENGTH_SHORT).show()
                }
                setResult(RESULT_OK)
                finish()
            }
        }

        setContentView(
            Ui.page(
                this,
                Ui.title(this, "Bist du sicher?"),
                Ui.text(this, "$what, tippe diesen Satz genau ab:"),
                Ui.quote(this, sentence),
                input,
                confirm,
            )
        )
    }

    private object NoActions : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode?, menu: Menu?) = false
        override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?) = false
        override fun onActionItemClicked(mode: ActionMode?, item: MenuItem?) = false
        override fun onDestroyActionMode(mode: ActionMode?) = Unit
    }

    companion object {
        private const val EXTRA_SCOPE = "scope"
        const val SCOPE_ALL = "ALL"
        const val SCOPE_SETTINGS = "SETTINGS"

        fun intent(context: Context, scope: String): Intent =
            Intent(context, UnlockActivity::class.java).putExtra(EXTRA_SCOPE, scope)

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
