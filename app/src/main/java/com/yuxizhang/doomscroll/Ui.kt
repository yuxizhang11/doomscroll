package com.yuxizhang.doomscroll

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView

/**
 * Small design system built from plain framework views, so the app needs no layout files and
 * no extra libraries. Colours follow the phone's light or dark mode.
 */
class Ui(private val context: Context) {

    private val dark =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    val pageColor = if (dark) 0xFF0F0F14.toInt() else 0xFFF4F4F8.toInt()
    val surface = if (dark) 0xFF1B1B24.toInt() else 0xFFFFFFFF.toInt()
    val textColor = if (dark) 0xFFF2F2F7.toInt() else 0xFF1A1A2E.toInt()
    val muted = if (dark) 0xFF9A9AAE.toInt() else 0xFF6B6B80.toInt()
    val accent = if (dark) 0xFF8B7CF6.toInt() else 0xFF6C5CE7.toInt()
    val accentSoft = if (dark) 0xFF2A2547.toInt() else 0xFFECEAFD.toInt()
    val track = if (dark) 0xFF2A2A36.toInt() else 0xFFE6E6EF.toInt()
    val danger = if (dark) 0xFFFF6B6B.toInt() else 0xFFE5484D.toInt()
    val dangerSoft = if (dark) 0xFF3A1E22.toInt() else 0xFFFDECEC.toInt()
    val success = if (dark) 0xFF4ADE80.toInt() else 0xFF2FA36B.toInt()
    val successSoft = if (dark) 0xFF16301F.toInt() else 0xFFE6F6EE.toInt()

    fun dp(value: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).toInt()

    /** Colours the window and status bar to match the page. */
    fun styleWindow(activity: Activity) {
        activity.actionBar?.hide()
        val window = activity.window
        window.decorView.setBackgroundColor(pageColor)
        @Suppress("DEPRECATION")
        window.statusBarColor = pageColor
        @Suppress("DEPRECATION")
        window.navigationBarColor = pageColor
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
        } else if (!dark) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
    }

    fun page(vararg children: View): View {
        val content = column(*children).apply {
            setPadding(dp(20f), dp(24f), dp(20f), dp(32f))
        }
        return ScrollView(context).apply {
            fitsSystemWindows = true
            isVerticalScrollBarEnabled = false
            setBackgroundColor(pageColor)
            addView(content)
        }
    }

    fun column(vararg children: View): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        children.forEach { addView(it) }
    }

    /** Horizontal row; the first child takes the free space. */
    fun row(vararg children: View): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        children.forEachIndexed { i, child ->
            if (i == 0) addView(child, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            else addView(child)
        }
    }

    fun card(vararg children: View, color: Int = surface): LinearLayout = column(*children).apply {
        background = rounded(color, 20f)
        setPadding(dp(18f), dp(16f), dp(18f), dp(18f))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(14f) }
    }

    fun title(text: String) = label(text, 30f, textColor, bold = true)

    fun subtitle(text: String) = label(text, 15f, muted).apply { setPadding(0, dp(2f), 0, dp(20f)) }

    fun cardTitle(text: String) = label(text, 18f, textColor, bold = true).apply { setPadding(0, 0, 0, dp(4f)) }

    fun body(text: String, color: Int = muted) = label(text, 14f, color).apply {
        setLineSpacing(0f, 1.2f)
        setPadding(0, dp(2f), 0, dp(6f))
    }

    fun label(text: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(context).apply {
        this.text = text
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    fun spacer(heightDp: Float) = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(1, dp(heightDp))
    }

    fun primaryButton(text: String, onClick: () -> Unit) = button(text, accent, 0xFFFFFFFF.toInt(), onClick)

    fun secondaryButton(text: String, onClick: () -> Unit) = button(text, accentSoft, accent, onClick)

    private fun button(text: String, fill: Int, textColor: Int, onClick: () -> Unit) = TextView(context).apply {
        this.text = text
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        gravity = Gravity.CENTER
        setPadding(dp(16f), dp(14f), dp(16f), dp(14f))
        background = ripple(rounded(fill, 14f))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(10f) }
    }

    /** Round "−" / "+" button for the minute steppers. */
    fun roundButton(text: String, onClick: () -> Unit) = TextView(context).apply {
        this.text = text
        setTextColor(accent)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        gravity = Gravity.CENTER
        background = ripple(GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(accentSoft) })
        isClickable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(dp(40f), dp(40f))
    }

    /** Small coloured label like "Aktiv" or "Heute aufgehoben". */
    fun pill(text: String, fill: Int, color: Int) = label(text, 12f, color, bold = true).apply {
        background = rounded(fill, 99f)
        setPadding(dp(10f), dp(4f), dp(10f), dp(4f))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8f) }
    }

    /** Two-option toggle; [onSelect] receives the chosen index. */
    fun segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit): LinearLayout {
        val bar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            background = rounded(track, 14f)
            setPadding(dp(4f), dp(4f), dp(4f), dp(4f))
        }
        val items = options.map { option ->
            label(option, 14f, textColor, bold = true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(10f), 0, dp(10f))
                isClickable = true
            }
        }
        fun paint(index: Int) = items.forEachIndexed { i, item ->
            item.background = if (i == index) rounded(surface, 11f) else null
            item.setTextColor(if (i == index) accent else muted)
        }
        items.forEachIndexed { i, item ->
            item.setOnClickListener { paint(i); onSelect(i) }
            bar.addView(item, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        paint(selected)
        return bar
    }

    @Suppress("UseSwitchCompatOrMaterialCode")
    fun switch(checked: Boolean) = Switch(context).apply {
        isChecked = checked
        val states = arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf())
        thumbTintList = ColorStateList(states, intArrayOf(accent, if (dark) muted else 0xFFFFFFFF.toInt()))
        trackTintList = ColorStateList(states, intArrayOf(accent, track))
    }

    fun input(hint: String) = EditText(context).apply {
        this.hint = hint
        setHintTextColor(muted)
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        background = rounded(track, 14f)
        setPadding(dp(14f), dp(12f), dp(14f), dp(12f))
        inputType = InputType.TYPE_CLASS_TEXT
    }

    fun progress(fraction: Float, color: Int = accent) = ProgressBarView(context, fraction, color, track).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8f)).apply {
            topMargin = dp(6f)
            bottomMargin = dp(12f)
        }
    }

    fun rounded(color: Int, radiusDp: Float) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun ripple(content: GradientDrawable) =
        RippleDrawable(ColorStateList.valueOf(0x22000000), content, null)
}

/** Rounded progress bar; turns red when full. */
class ProgressBarView(
    context: Context,
    private val fraction: Float,
    private val color: Int,
    private val trackColor: Int,
) : View(context) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()

    override fun onDraw(canvas: Canvas) {
        val r = height / 2f
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        paint.color = trackColor
        canvas.drawRoundRect(rect, r, r, paint)
        val f = fraction.coerceIn(0f, 1f)
        if (f <= 0f) return
        rect.right = (width * f).coerceAtLeast(height.toFloat())
        paint.color = if (f >= 1f) 0xFFE5484D.toInt() else color
        canvas.drawRoundRect(rect, r, r, paint)
    }
}
