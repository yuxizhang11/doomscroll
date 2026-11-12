package com.yuxizhang.doomscroll

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.net.Uri
import android.view.View
import java.io.File

/**
 * A glass surface: translucent or opaque [fill], a 1 px edge that fades from bright (top left) to
 * faint (bottom right) and a bright inner line along the top (DESIGN.md 6, "Lichtkante").
 * Framework views cannot blur what lies behind them, so this is the clear-glass look without the
 * blur; the fallback with opaque fills uses the same drawable.
 */
class GlassDrawable(
    private val fill: Int,
    private val radiusPx: Float,
    private val edge: Int,
    private val highlight: Int,
    private val strokePx: Float,
) : Drawable() {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val inner = RectF()
    private val line = RectF()
    private var radius = 0f
    private var edgeShader: Shader? = null
    private var lineShader: Shader? = null

    // Shaders and rectangles are built when the size changes, not on every frame.
    override fun onBoundsChange(bounds: android.graphics.Rect) {
        rect.set(bounds)
        radius = minOf(radiusPx, rect.height() / 2f, rect.width() / 2f)
        val half = strokePx / 2f
        inner.set(rect.left + half, rect.top + half, rect.right - half, rect.bottom - half)
        line.set(inner.left + strokePx, inner.top + strokePx, inner.right - strokePx, inner.bottom)
        edgeShader = LinearGradient(
            rect.left, rect.top, rect.right, rect.bottom, edge, Look.argb(Look.alphaOf(edge) * 0.35f, edge), Shader.TileMode.CLAMP,
        )
        // The bright line along the top fades out within one corner radius.
        lineShader = LinearGradient(0f, rect.top, 0f, rect.top + radius + strokePx * 2, highlight, highlight and 0xFFFFFF, Shader.TileMode.CLAMP)
    }

    override fun draw(canvas: Canvas) {
        val half = strokePx / 2f
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = fill
        canvas.drawRoundRect(rect, radius, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = strokePx
        paint.shader = edgeShader
        canvas.drawRoundRect(inner, (radius - half).coerceAtLeast(0f), (radius - half).coerceAtLeast(0f), paint)
        paint.shader = lineShader
        canvas.save()
        canvas.clipRect(rect.left, rect.top, rect.right, rect.top + radius + strokePx * 2)
        canvas.drawRoundRect(line, (radius - strokePx).coerceAtLeast(0f), (radius - strokePx).coerceAtLeast(0f), paint)
        canvas.restore()
        paint.shader = null
    }

    override fun getOutline(outline: Outline) {
        outline.setRoundRect(bounds, minOf(radiusPx, bounds.height() / 2f, bounds.width() / 2f))
        // A translucent surface casts no shadow, it would show through the glass.
        outline.setAlpha(if (Look.alphaOf(fill) >= 0.99f) 1f else 0f)
    }

    override fun setAlpha(alpha: Int) {}

    override fun setColorFilter(colorFilter: ColorFilter?) {}

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

/** The ground behind the glass: gradient or solid colour or picture, plus the soft colour spots. Drawn once, never animated. */
class BackgroundView(context: Context, private val look: Look, private val picture: Bitmap?) : View(context) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val src = android.graphics.Rect()
    private val dst = android.graphics.Rect()

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (look.isImage && picture != null) {
            // Centre crop.
            val scale = maxOf(w / picture.width, h / picture.height)
            val sw = (w / scale).toInt()
            val sh = (h / scale).toInt()
            src.set((picture.width - sw) / 2, (picture.height - sh) / 2, (picture.width + sw) / 2, (picture.height + sh) / 2)
            dst.set(0, 0, width, height)
            canvas.drawBitmap(picture, src, dst, null)
            canvas.drawColor(Look.argb(look.scrim, 0x000000))
        } else if (look.stops.first() == look.stops.last()) {
            canvas.drawColor(look.stops.first())
        } else {
            paint.shader = LinearGradient(
                w * 0.3f, 0f, w * 0.7f, h, look.stops, floatArrayOf(0f, 0.6f, 1f), Shader.TileMode.CLAMP,
            )
            canvas.drawRect(0f, 0f, w, h, paint)
        }
        for (blob in look.blobs) {
            val cx = blob.x * w
            val cy = blob.y * h
            val r = blob.radius * w
            paint.shader = RadialGradient(
                cx, cy, r, intArrayOf(Look.argb(blob.alpha, blob.rgb), Look.argb(blob.alpha * 0.4f, blob.rgb), blob.rgb and 0xFFFFFF),
                floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP,
            )
            canvas.drawCircle(cx, cy, r, paint)
        }
        paint.shader = null
    }
}

/** The picture the user chose as ground, one per glass style, kept as a downscaled copy in the app's own folder. */
object BackdropImage {

    private const val MAX_SIDE = 1280
    private val cache = HashMap<String, Pair<Long, Bitmap>>()

    fun file(context: Context, style: GlassStyle) = File(context.filesDir, "hintergrund_${style.key}.jpg")

    /** Copies the picture at [uri] into the app; false when it cannot be read as a picture. */
    fun save(context: Context, style: GlassStyle, uri: Uri): Boolean = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, options) }!!
        file(context, style).outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        cache.remove(file(context, style).path)
        true
    }.getOrDefault(false)

    fun remove(context: Context, style: GlassStyle) {
        file(context, style).delete()
        cache.remove(file(context, style).path)
    }

    /** The saved picture, or null when there is none or it cannot be read (the ground then falls back to the standard). */
    fun load(context: Context, style: GlassStyle): Bitmap? {
        val f = file(context, style)
        if (!f.exists()) return null
        cache[f.path]?.takeIf { it.first == f.lastModified() }?.let { return it.second }
        val bitmap = runCatching { BitmapFactory.decodeFile(f.path) }.getOrNull() ?: return null
        cache[f.path] = f.lastModified() to bitmap
        return bitmap
    }
}
