package com.yuxizhang.doomscroll

import org.json.JSONObject
import kotlin.math.pow

/*
 * The one design of the app is Liquid Glass (DESIGN.md 6). Dark mode, glass style, glass level
 * and background are only settings of it: they swap the tokens below, the views stay the same.
 */

/** A setting that is saved as a short text. */
interface Keyed {
    val key: String
}

/** The entry of [values] saved as [raw], or null when [raw] is unknown. */
fun <T> parseKey(values: Array<T>, raw: String?): T? where T : Keyed = values.firstOrNull { it.key == raw }

/** Light, dark, or whatever the phone says. */
enum class ThemeMode(override val key: String) : Keyed { SYSTEM("system"), HELL("hell"), DUNKEL("dunkel") }

/** Which surfaces are glass: none, only bars/buttons, or everything. */
enum class GlassLevel(override val key: String) : Keyed { AUS("aus"), EINFACH("einfach"), VOLL("voll") }

/** Look of the glass: clear with white text, or light tinted glass on a dark ground with black text. */
enum class GlassStyle(override val key: String) : Keyed { KLAR("klar"), TINTED_DARK("tintedDark") }

/** What lies behind the glass, saved once per [GlassStyle]. */
data class Backdrop(
    val kind: String = STANDARD,
    val gradient: String = Look.GRADIENTS.keys.first(),
    val color: Int = 0xFF1668B5.toInt(),
    val blobs: Boolean = true,
) {
    fun toJson(): String = JSONObject()
        .put("art", kind)
        .put("verlauf", gradient)
        .put("farbe", String.format("#%06X", color and 0xFFFFFF))
        .put("kleckse", blobs)
        .toString()

    companion object {
        const val STANDARD = "standard"
        const val GRADIENT = "verlauf"
        const val COLOR = "farbe"
        const val IMAGE = "bild"
        val KINDS = listOf(STANDARD, GRADIENT, COLOR, IMAGE)

        /** The saved backdrop, or null when [raw] is no backdrop. Unknown parts fall back to the default. */
        fun fromJson(raw: String?): Backdrop? {
            val json = runCatching { JSONObject(raw ?: return null) }.getOrNull() ?: return null
            val base = Backdrop()
            return Backdrop(
                kind = json.optString("art").takeIf { it in KINDS } ?: STANDARD,
                gradient = json.optString("verlauf").takeIf { it in Look.GRADIENTS } ?: base.gradient,
                color = parseColor(json.optString("farbe")) ?: base.color,
                blobs = json.optBoolean("kleckse", true),
            )
        }

        /** "#RRGGBB" (the # is optional) as opaque ARGB, or null. */
        fun parseColor(text: String?): Int? {
            val hex = text?.trim()?.removePrefix("#") ?: return null
            if (hex.length != 6 || !hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
            return 0xFF000000.toInt() or hex.toInt(16)
        }
    }
}

/** A soft coloured spot behind the glass; position and size are fractions of the width. */
class Blob(val rgb: Int, val alpha: Float, val x: Float, val y: Float, val radius: Float)

/**
 * All colours and flags for one combination of settings; nothing else in the app has a colour.
 * [reduced] is the fallback of DESIGN.md 6 (Android below 13, power saving): opaque surfaces
 * instead of glass. Text on glass is checked against the lightest and darkest spot behind it and
 * the surface gets denser until the contrast is at least 4.5:1 (DESIGN.md 3).
 */
class Look(
    val theme: ThemeMode,
    val style: GlassStyle,
    glass: GlassLevel,
    val backdrop: Backdrop,
    systemDark: Boolean,
    val reduced: Boolean,
) {
    val tinted = style == GlassStyle.TINTED_DARK

    /** Tinted Dark forces the dark theme while it is active; [theme] stays saved. */
    val dark = tinted || theme == ThemeMode.DUNKEL || (theme == ThemeMode.SYSTEM && systemDark)

    val level = if (reduced) GlassLevel.AUS else glass
    val cardsGlass = level == GlassLevel.VOLL
    val controlsGlass = level != GlassLevel.AUS

    // Ground
    private val template = GRADIENTS[backdrop.gradient] ?: GRADIENTS.getValue(GRADIENTS.keys.first())
    private val standard = when {
        tinted -> intArrayOf(0xFF070A10.toInt(), 0xFF0B1A2B.toInt(), 0xFF0A2A2A.toInt())
        dark -> intArrayOf(0xFF050D22.toInt(), 0xFF0B2F58.toInt(), 0xFF0A5A58.toInt())
        else -> GRADIENTS.getValue("blau").first.copyOf()
    }
    private val maxLuminance = if (tinted) 0.05 else 0.18

    /** Gradient stops, top to bottom; solid colours repeat one stop. */
    val stops: IntArray = when (backdrop.kind) {
        Backdrop.GRADIENT -> clampAll(template.first)
        Backdrop.COLOR -> clamp(backdrop.color).let { intArrayOf(it, it, it) }
        Backdrop.IMAGE -> standard
        else -> standard
    }
    val isImage = backdrop.kind == Backdrop.IMAGE

    /** Dark layer over a picture so that glass and text stay readable. */
    val scrim = if (isImage) (if (tinted) 0.60f else 0.40f) else 0f

    val blobs: List<Blob> = if (!backdrop.blobs || backdrop.kind == Backdrop.COLOR) emptyList() else if (tinted) {
        listOf(Blob(0xFFFF9A4A.toInt(), 0.42f, 0.88f, 0.14f, 0.45f), Blob(0xFF6F63FF.toInt(), 0.45f, 0.05f, 0.72f, 0.5f))
    } else {
        val a = if (dark) 0.4f else 0.7f
        listOf(
            Blob(0xFFFF9A4A.toInt(), a, 0.88f, 0.12f, 0.4f),
            Blob(0xFF6F63FF.toInt(), a, 0.06f, 0.5f, 0.5f),
            Blob(0xFF5EF0C4.toInt(), a, 0.85f, 0.88f, 0.45f),
        )
    }

    // Text and symbols
    val text = if (tinted) BLACK else WHITE
    val muted = if (tinted) 0xFF2C3139.toInt() else 0xFFC8D3E6.toInt()
    val accent = text
    val onAccent = if (tinted) WHITE else BLACK
    val success = if (tinted) text else 0xFFB8F5D0.toInt()
    val danger = if (tinted) text else 0xFFFFD0D0.toInt()
    val barSoft = if (tinted) 0xFF6B7280.toInt() else 0x8CFFFFFF.toInt()
    val edge = if (tinted) 0xB3FFFFFF.toInt() else 0x61FFFFFF
    val highlight = if (tinted) 0xE6FFFFFF.toInt() else 0x99FFFFFF.toInt()

    // Opaque surfaces: also what the glass stands on when it is switched off.
    val opaqueCard = if (tinted) 0xFFD9DCE1.toInt() else if (dark) 0xFF0C2640.toInt() else 0xFF17487F.toInt()
    private val texts = listOf(text, muted, success, danger)
    private val opaqueHi = if (tinted) 0xFFF6F8FA.toInt() else 0xFF000000.toInt() or DENSE_HI
    private val opaqueLo = if (tinted) 0xFFBEC3CB.toInt() else 0xFF000000.toInt() or DENSE_LO

    /** Spots of the ground that text on glass can end up on, lightest and darkest. */
    val backdropSamples: List<Int> = run {
        val lightest = stops.maxBy(::luminance)
        val spots = stops.toList() + blobs.map { blend(it.rgb, it.alpha, lightest) }
        if (isImage) listOf(BLACK, blend(WHITE, 1f - scrim, BLACK)) else spots
    }

    /** Fill of cards. */
    val card: Int = if (cardsGlass) ensure(if (tinted) argb(0.74f, 0xDEE2E8) else argb(0.16f, 0xFFFFFF), backdropSamples) else opaqueCard

    /** What a card lets through: the ground under glass, the opaque fill otherwise. */
    private val cardSamples = if (cardsGlass) backdropSamples.map { blend(card, it) } else listOf(opaqueCard)

    // Controls sit on the ground (header bar) or on cards.
    private val controlSamples = backdropSamples + cardSamples

    /** Track of bars and inputs. */
    val track: Int = if (tinted) 0xFFC3C8D0.toInt() else ensure(argb(0.18f, 0xFFFFFF), controlSamples, NAVY)

    // Main button, header bar and chosen capsule (which lies on the track) are the lightest step, then the second button
    // and small pills (which lie on the header), then the track. Dense Klar glass keeps that order in its colours.
    private val onTrack = controlSamples + controlSamples.map { blend(track, it) }

    /** Main button, header bar, selected capsule. */
    val hi: Int = if (controlsGlass) ensure(if (tinted) argb(0.88f, 0xF6F8FA) else argb(0.28f, 0xFFFFFF), onTrack, DENSE_HI) else opaqueHi

    private val onHi = controlSamples + controlSamples.map { blend(hi, it) }

    /** Second button and small pills. */
    val lo: Int = if (controlsGlass) ensure(if (tinted) argb(0.58f, 0xBEC3CB) else argb(0.16f, 0xFFFFFF), onHi, DENSE_LO) else opaqueLo

    /** Fill of the card that says the blocker is off: a grey step in Tinted Dark, never a colour there. */
    val warnCard = if (tinted) 0xFFC9CCD2.toInt() else if (dark) 0xFF4A1F2B.toInt() else 0xFF5C2431.toInt()

    /** Status bar and navigation bar colours: the ends of the ground. */
    val barTop = stops.first()
    val barBottom = stops.last()

    /** Every text colour with every colour that can lie behind it, for the contrast test. */
    fun textPairs(): List<Pair<Int, Int>> {
        val behind = cardSamples + warnCard +
            controlSamples.flatMap { s -> listOf(blend(hi, s), blend(lo, s), blend(track, s)) } +
            // Stacked: the status pill in the header, the chosen capsule on its track.
            controlSamples.flatMap { s -> listOf(blend(lo, blend(hi, s)), blend(hi, blend(track, s))) }
        return behind.flatMap { back -> texts.map { it to back } }
    }

    /** Makes [base] dense enough for [texts] on every sample; light text first thins a white fill, then switches to navy. */
    private fun ensure(base: Int, samples: List<Int>, dense: Int = NAVY): Int {
        fun ok(fill: Int) = samples.all { s -> texts.all { contrast(it, blend(fill, s)) >= MIN_CONTRAST } }
        if (ok(base)) return base
        val rgb = base and 0xFFFFFF
        if (tinted) {
            for (step in 1..50) argb((alphaOf(base) + step * 0.01f).coerceAtMost(1f), rgb).let { if (ok(it)) return it }
            return 0xFF000000.toInt() or rgb
        }
        var a = alphaOf(base)
        while (a > 0.04f) {
            a -= 0.02f
            argb(a, rgb).let { if (ok(it)) return it }
        }
        for (step in 10..20) argb(step * 0.05f, dense).let { if (ok(it)) return it }
        return 0xFF000000.toInt() or dense
    }

    private fun clamp(color: Int): Int {
        var c = color or 0xFF000000.toInt()
        while (luminance(c) > maxLuminance) c = blend(BLACK, 0.1f, c)
        return c
    }

    private fun clampAll(colors: IntArray) = IntArray(colors.size) { clamp(colors[it]) }

    companion object {
        const val MIN_CONTRAST = 4.5
        private const val WHITE = 0xFFFFFFFF.toInt()
        private const val BLACK = 0xFF000000.toInt()
        private const val NAVY = 0x0A1A33
        private const val DENSE_HI = 0x255387
        private const val DENSE_LO = 0x1B3D6B

        /** Ready-made backgrounds: three stops each (the first one is the standard of Klar · Hell). */
        val GRADIENTS: Map<String, Pair<IntArray, String>> = linkedMapOf(
            "blau" to (intArrayOf(0xFF0C2A63.toInt(), 0xFF1668B5.toInt(), 0xFF15A5A0.toInt()) to "Blau"),
            "violett" to (intArrayOf(0xFF1B1040.toInt(), 0xFF4B2A9A.toInt(), 0xFF8A4FD0.toInt()) to "Violett"),
            "graphit" to (intArrayOf(0xFF111418.toInt(), 0xFF2A2F38.toInt(), 0xFF454C58.toInt()) to "Graphit"),
            "warm" to (intArrayOf(0xFF3A0F1A.toInt(), 0xFFA2362D.toInt(), 0xFFD9822B.toInt()) to "Warm"),
        )

        fun alphaOf(argb: Int): Float = (argb ushr 24) / 255f

        fun argb(alpha: Float, rgb: Int): Int = ((alpha.coerceIn(0f, 1f) * 255f + 0.5f).toInt() shl 24) or (rgb and 0xFFFFFF)

        /** [top] (with its own alpha) laid over the opaque [back]. */
        fun blend(top: Int, back: Int): Int = blend(top, alphaOf(top), back)

        fun blend(top: Int, alpha: Float, back: Int): Int {
            fun ch(shift: Int) = (((top shr shift) and 0xFF) * alpha + ((back shr shift) and 0xFF) * (1f - alpha) + 0.5f).toInt()
            return 0xFF000000.toInt() or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
        }

        fun luminance(color: Int): Double {
            fun channel(shift: Int): Double {
                val c = ((color shr shift) and 0xFF) / 255.0
                return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
            }
            return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        }

        /** WCAG contrast of [fg] on the opaque [bg]; a translucent [fg] is first laid over [bg]. */
        fun contrast(fg: Int, bg: Int): Double {
            val a = luminance(blend(fg, bg))
            val b = luminance(bg)
            return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
        }
    }
}
