package com.yuxizhang.doomscroll

import android.content.Context
import android.graphics.Typeface
import android.text.InputType
import android.util.TypedValue
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Tiny view builders, so the app needs no layout files and no extra libraries. */
object Ui {

    fun dp(context: Context, value: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).toInt()

    fun page(context: Context, vararg children: View): View {
        val content = column(context, *children).apply {
            val pad = dp(context, 20f)
            setPadding(pad, pad, pad, pad)
        }
        return ScrollView(context).apply {
            fitsSystemWindows = true
            addView(content)
        }
    }

    fun column(context: Context, vararg children: View): LinearLayout =
        LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            children.forEach { addView(it) }
        }

    fun row(context: Context, vararg children: View): LinearLayout =
        LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            children.forEach { addView(it) }
        }

    fun title(context: Context, text: String) = TextView(context).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, 0, 0, dp(context, 12f))
    }

    fun section(context: Context, text: String) = TextView(context).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(context, 24f), 0, dp(context, 8f))
    }

    fun text(context: Context, text: String) = TextView(context).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setPadding(0, dp(context, 4f), 0, dp(context, 4f))
    }

    fun quote(context: Context, text: String) = TextView(context).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        setTypeface(typeface, Typeface.ITALIC)
        setTextIsSelectable(false)
        setPadding(0, dp(context, 12f), 0, dp(context, 12f))
    }

    fun minutesInput(context: Context, minutes: Int) = EditText(context).apply {
        inputType = InputType.TYPE_CLASS_NUMBER
        setText(minutes.toString())
        minEms = 3
        hint = "Min."
    }
}
