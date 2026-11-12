package com.yuxizhang.doomscroll

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.PowerManager
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView

/**
 * Small design system built from plain framework views, so the app needs no layout files and
 * no extra libraries. There is one design, Liquid Glass (DESIGN.md 6); dark mode, glass style,
 * glass level and background are settings that only change the [Look] this class reads.
 */
class Ui(private val context: Context) {

    private val store = Store.get(context)

    private val style = store.glassStyle

    /** The saved picture, or null: then a backdrop of kind "bild" falls back to the standard. */
    private val picture = if (store.backdrop(style).kind == Backdrop.IMAGE) BackdropImage.load(context, style) else null

    val look: Look = Look(
        theme = store.theme,
        style = style,
        glass = store.glass,
        backdrop = store.backdrop(style).let { if (it.kind == Backdrop.IMAGE && picture == null) it.copy(kind = Backdrop.STANDARD) else it },
        systemDark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES,
        // Below Android 13 and in power saving the glass is replaced by opaque surfaces (DESIGN.md 6, Fallback).
        reduced = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            context.getSystemService(PowerManager::class.java)?.isPowerSaveMode == true,
    )

    val pageColor = look.barTop
    val surface = look.card
    val textColor = look.text
    val muted = look.muted
    val accent = look.accent
    val onAccent = look.onAccent
    val accentSoft = look.lo
    val track = look.track
    val danger = look.danger
    val dangerSoft = look.warnCard
    val success = look.success
    val successSoft = look.lo

    /** Symbol in front of a status text, so ok and problem never differ by colour alone. */
    fun mark(ok: Boolean): String = if (ok) "✓ " else "✕ "

    /** Text size chosen in the app on top of the phone's font size (1.0 = normal). */
    val textScale = store.textScale

    /** [value] in sp, scaled by the app's text size setting. */
    fun sp(value: Float): Float = value * textScale

    fun dp(value: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).toInt()

    /** Colours the window and the bars to match the ground. */
    fun styleWindow(activity: Activity) {
        activity.actionBar?.hide()
        val window = activity.window
        window.decorView.setBackgroundColor(look.barTop)
        @Suppress("DEPRECATION")
        window.statusBarColor = look.barTop
        @Suppress("DEPRECATION")
        window.navigationBarColor = look.barBottom
        // The ground is always dark enough for light bar icons.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(0, light)
        }
    }

    /** Theme for [AlertDialog.Builder]: light for black text (Tinted Dark), dark for white text. */
    val dialogTheme: Int
        get() = if (look.tinted) android.R.style.Theme_DeviceDefault_Light_Dialog_Alert else android.R.style.Theme_DeviceDefault_Dialog_Alert

    fun styleDialog(dialog: AlertDialog) {
        dialog.window?.setBackgroundDrawable(glass(look.opaqueCard, 20f))
        for (which in intArrayOf(AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE)) {
            dialog.getButton(which)?.setTextColor(accent)
        }
    }

    /** The scrolling page on the ground. */
    fun page(vararg children: View): View {
        val content = column(*children).apply {
            setPadding(dp(20f), dp(24f), dp(20f), dp(32f))
        }
        val scroll = ScrollView(context).apply {
            fitsSystemWindows = true
            isVerticalScrollBarEnabled = false
            addView(content)
        }
        return FrameLayout(context).apply {
            addView(BackgroundView(context, look, picture), FrameLayout.LayoutParams(-1, -1))
            addView(scroll, FrameLayout.LayoutParams(-1, -1))
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

    /** A glass surface with [fill]; opaque fills also get a soft shadow. */
    fun glass(fill: Int, radiusDp: Float): Drawable =
        GlassDrawable(fill, dp(radiusDp).toFloat(), look.edge, look.highlight, dp(1f).toFloat())

    /** Card: glass at level "voll", an opaque surface otherwise; a given [color] is always opaque. */
    fun card(vararg children: View, color: Int? = null): LinearLayout = column(*children).apply {
        background = glass(color ?: look.card, 20f)
        if (color != null || !look.cardsGlass) elevation = dp(2f).toFloat()
        setPadding(dp(16f), dp(14f), dp(16f), dp(14f))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(10f) }
    }

    /** Header bar on glass: titles never stand straight on the ground (DESIGN.md 6a). */
    fun header(vararg children: View): LinearLayout = column(*children).apply {
        background = glass(look.hi, 20f)
        setPadding(dp(16f), dp(12f), dp(16f), dp(12f))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(14f) }
    }

    fun header(title: String, subtitle: String) = header(
        label(title, 30f, textColor, bold = true),
        label(subtitle, 15f, muted).apply { setPadding(0, dp(2f), 0, 0) },
    )

    fun cardTitle(text: String) = label(text, 18f, textColor, bold = true).apply { setPadding(0, 0, 0, dp(4f)) }

    fun body(text: String, color: Int = muted) = label(text, 14f, color).apply {
        setLineSpacing(0f, 1.2f)
        setPadding(0, dp(2f), 0, dp(6f))
    }

    fun label(text: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(context).apply {
        this.text = text
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(sizeSp))
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    /** Fold arrow of a section; the direction, not a colour, tells open from closed. */
    fun chevron() = label("", 18f, muted).apply { setPadding(dp(10f), 0, 0, 0) }

    fun setChevron(view: TextView, open: Boolean) {
        view.text = if (open) "▴" else "▾"
    }

    fun spacer(heightDp: Float) = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(1, dp(heightDp))
    }

    fun primaryButton(text: String, onClick: () -> Unit) = button(text, look.hi, onClick)

    fun secondaryButton(text: String, onClick: () -> Unit) = button(text, look.lo, onClick)

    private fun button(text: String, fill: Int, onClick: () -> Unit) = TextView(context).apply {
        this.text = text
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(15f))
        minHeight = dp(48f)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        gravity = Gravity.CENTER
        setPadding(dp(16f), dp(14f), dp(16f), dp(14f))
        background = ripple(glass(fill, 99f))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(10f) }
    }

    /** Round "−" / "+" button for the minute steppers; [description] is read out by TalkBack. */
    fun roundButton(text: String, description: String, onClick: () -> Unit) = TextView(context).apply {
        this.text = text
        contentDescription = description
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(20f))
        gravity = Gravity.CENTER
        background = ripple(glass(look.lo, 24f))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(dp(48f), dp(48f))
    }

    /** Small label like "Aktiv" or "Heute aufgehoben". */
    fun pill(text: String, fill: Int, color: Int) = label(text, 12f, color, bold = true).apply {
        background = glass(fill, 99f)
        setPadding(dp(10f), dp(4f), dp(10f), dp(4f))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8f) }
    }

    /** Toggle between a few options; [onSelect] receives the chosen index. The chosen one is a lighter capsule and bold. */
    fun segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit): LinearLayout {
        val bar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            background = glass(track, 99f)
            setPadding(dp(4f), dp(4f), dp(4f), dp(4f))
        }
        val items = options.map { option ->
            label(option, 14f, textColor, bold = true).apply {
                gravity = Gravity.CENTER
                setPadding(dp(4f), dp(10f), dp(4f), dp(10f))
                minHeight = dp(48f)
                isClickable = true
                isFocusable = true
                contentDescription = option
            }
        }
        fun paint(index: Int) = items.forEachIndexed { i, item ->
            item.background = if (i == index) glass(look.hi, 99f) else null
            item.setTextColor(if (i == index) textColor else muted)
            item.typeface = if (i == index) Typeface.create("sans-serif-medium", Typeface.BOLD) else Typeface.DEFAULT
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
        thumbTintList = ColorStateList(states, intArrayOf(accent, muted))
        trackTintList = ColorStateList(states, intArrayOf(Look.argb(0.45f, accent), track))
    }

    fun input(hint: String) = EditText(context).apply {
        this.hint = hint
        setHintTextColor(muted)
        setTextColor(textColor)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(16f))
        minHeight = dp(48f)
        background = glass(track, 14f)
        setPadding(dp(14f), dp(12f), dp(14f), dp(12f))
        inputType = InputType.TYPE_CLASS_TEXT
    }

    fun progress(fraction: Float, color: Int = accent) = ProgressBarView(context, fraction, color, danger, track).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8f)).apply {
            topMargin = dp(6f)
            bottomMargin = dp(12f)
        }
    }

    /** Bars with a label underneath and the value on top, e.g. minutes per weekday. */
    fun barChart(labels: List<String>, values: List<Int>, highlight: Int) =
        BarChartView(context, labels, values, highlight, accent, look.barSoft, muted, textColor, sp(12f)).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(150f * textScale)).apply {
                topMargin = dp(8f)
                bottomMargin = dp(8f)
            }
        }

    /** Plain rounded fill for small things such as the challenge box. */
    fun rounded(color: Int, radiusDp: Float): Drawable = glass(color, radiusDp)

    private fun ripple(content: Drawable) =
        RippleDrawable(ColorStateList.valueOf(Look.argb(0.2f, textColor)), content, null)
}

/** Rounded progress bar; a full bar takes [fullColor] (in Tinted Dark that is black again, so its length says it). */
class ProgressBarView(
    context: Context,
    private val fraction: Float,
    private val color: Int,
    private val fullColor: Int,
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
        paint.color = if (f >= 1f) fullColor else color
        canvas.drawRoundRect(rect, r, r, paint)
    }
}

/** Simple bar chart; the bar at [highlight] (today) is drawn in the strong colour. */
class BarChartView(
    context: Context,
    private val labels: List<String>,
    private val values: List<Int>,
    private val highlight: Int,
    private val strong: Int,
    private val soft: Int,
    private val labelColor: Int,
    private val valueColor: Int,
    textSp: Float,
) : View(context) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, textSp, resources.displayMetrics)
    }
    private val rect = RectF()

    override fun onDraw(canvas: Canvas) {
        if (values.isEmpty()) return
        val line = text.textSize * 1.4f
        val top = line
        val bottom = height - line
        val slot = width.toFloat() / values.size
        val barWidth = slot * 0.55f
        val max = values.max().coerceAtLeast(1)
        val radius = barWidth / 4f
        values.forEachIndexed { i, value ->
            val centre = slot * i + slot / 2f
            val barHeight = ((bottom - top) * value / max).coerceAtLeast(radius * 2f)
            rect.set(centre - barWidth / 2f, bottom - barHeight, centre + barWidth / 2f, bottom)
            paint.color = if (i == highlight) strong else soft
            canvas.drawRoundRect(rect, radius, radius, paint)
            text.color = valueColor
            canvas.drawText(value.toString(), centre, rect.top - line * 0.3f, text)
            text.color = labelColor
            canvas.drawText(labels[i], centre, height - line * 0.25f, text)
        }
    }
}
