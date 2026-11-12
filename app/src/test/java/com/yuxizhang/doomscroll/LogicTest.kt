package com.yuxizhang.doomscroll

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.json.JSONObject
import org.junit.Test

/** Version comparison: the update check and the "what's new" popup depend on it. */
class UpdaterTest {

    @Test
    fun comparesNumberByNumber() {
        assertTrue(Updater.isNewer("1.10", "1.9"))
        assertFalse(Updater.isNewer("1.9", "1.10"))
        assertTrue(Updater.isNewer("2.0", "1.99"))
    }

    @Test
    fun sameVersionIsNotNewer() {
        assertFalse(Updater.isNewer("1.28", "1.28"))
        assertFalse(Updater.isNewer("1.28.0", "1.28"))
    }

    @Test
    fun differentLengthsAndGarbage() {
        assertTrue(Updater.isNewer("1.28.1", "1.28"))
        assertFalse(Updater.isNewer("1.28", "1.28.1"))
        // Unreadable parts count as 0 instead of crashing the check.
        assertFalse(Updater.isNewer("abc", "1.0"))
        assertTrue(Updater.isNewer("1.1", "x"))
    }
}

/** Quiet hours run past midnight; this is the part of the time logic that needs no clock. */
class QuietWindowTest {

    @Test
    fun windowWithinOneDay() {
        assertTrue(Store.inWindow(9 * 60, 8 * 60, 17 * 60))
        assertTrue(Store.inWindow(8 * 60, 8 * 60, 17 * 60))
        assertFalse(Store.inWindow(17 * 60, 8 * 60, 17 * 60))
        assertFalse(Store.inWindow(7 * 60, 8 * 60, 17 * 60))
    }

    @Test
    fun windowPastMidnight() {
        val start = 22 * 60
        val end = 7 * 60
        assertTrue(Store.inWindow(23 * 60 + 59, start, end))
        assertTrue(Store.inWindow(0, start, end))
        assertTrue(Store.inWindow(6 * 60 + 59, start, end))
        assertFalse(Store.inWindow(7 * 60, start, end))
        assertFalse(Store.inWindow(12 * 60, start, end))
        assertTrue(Store.inWindow(22 * 60, start, end))
    }

    @Test
    fun emptyWindowNeverBlocks() {
        assertFalse(Store.inWindow(0, 600, 600))
        assertFalse(Store.inWindow(600, 600, 600))
    }
}

class CleanWordTest {

    @Test
    fun trimsAndLowercases() {
        assertEquals("deepfake", Store.cleanWord("  DeepFake "))
    }

    @Test
    fun tooShortWordsAreRejected() {
        assertNull(Store.cleanWord("a"))
        assertNull(Store.cleanWord("   "))
        assertEquals("ab", Store.cleanWord("AB"))
    }
}

class AdultFilterTest {

    @Test
    fun knownSitesAndWordsAreBlocked() {
        assertTrue(AdultFilter.isPorn("https://www.pornhub.com/view_video"))
        assertTrue(AdultFilter.isPorn("Hentai Anime"))
        assertTrue(AdultFilter.isPorn("https://beeg.com/"))
        assertTrue(AdultFilter.isPorn("https://de.beeg.com/abc"))
    }

    @Test
    fun harmlessPagesStayOpen() {
        assertFalse(AdultFilter.isPorn("https://www.wikipedia.org/wiki/Sexualkunde"))
        assertFalse(AdultFilter.isPorn("https://example.com/xxxl-sale"))
        assertFalse(AdultFilter.isPorn("Milford Sound Neuseeland"))
        assertFalse(AdultFilter.isPorn("https://notbeeg.com/"))
    }

    @Test
    fun wholeWordsOnly() {
        assertTrue(AdultFilter.isPorn("best xxx site"))
        assertTrue(AdultFilter.isPorn("milf videos"))
    }

    @Test
    fun ownWordsAreMatchedLikeKeywords() {
        assertFalse(AdultFilter.isPorn("deepfake tutorial"))
        assertTrue(AdultFilter.isPorn("Deepfake tutorial", setOf("deepfake")))
    }
}

class TargetAppTest {

    @Test
    fun addressesMapToTheirApp() {
        assertEquals(TargetApp.YOUTUBE, TargetApp.fromAddress("https://m.youtube.com/shorts/abc"))
        assertEquals(TargetApp.INSTAGRAM, TargetApp.fromAddress("instagram.com/reel/xyz"))
        assertEquals(TargetApp.TIKTOK, TargetApp.fromAddress("https://www.tiktok.com/@a/video/1"))
        assertEquals(TargetApp.FACEBOOK, TargetApp.fromAddress("https://facebook.com/reel/1"))
    }

    @Test
    fun normalPagesAreNotShortVideos() {
        assertNull(TargetApp.fromAddress("https://www.youtube.com/watch?v=abc"))
        assertNull(TargetApp.fromAddress("https://www.instagram.com/someone/"))
    }

    @Test
    fun packagesMapToTheirApp() {
        assertEquals(TargetApp.TIKTOK, TargetApp.fromPackage("com.ss.android.ugc.trill"))
        assertNull(TargetApp.fromPackage("com.android.chrome"))
        assertNull(TargetApp.fromPackage(null))
    }
}

class UnlockTextTest {

    @Test
    fun normalizeIgnoresCasePunctuationAndSpaces() {
        assertEquals(
            "ich entscheide mich bewusst",
            UnlockActivity.normalize("  Ich entscheide, mich   BEWUSST! "),
        )
    }

    @Test
    fun everyWordStillCounts() {
        val a = UnlockActivity.normalize("Ich schaue weiter.")
        val b = UnlockActivity.normalize("Ich schaue nicht weiter.")
        assertTrue(a != b)
    }
}

/** The version list in the app has to stay newest first, or "what's new" shows the wrong entries. */
class ChangelogTest {

    @Test
    fun entriesAreStrictlyDescending() {
        val versions = Changelog.entries.map { it.first }
        versions.zipWithNext().forEach { (newer, older) ->
            assertTrue("$newer should come before $older", Updater.isNewer(newer, older))
        }
    }

    @Test
    fun sinceReturnsEverythingBetween() {
        val shown = Changelog.since("1.26", "1.28").map { it.first }
        assertEquals(listOf("1.28", "1.27"), shown)
    }

    @Test
    fun unknownPreviousVersionShowsOnlyTheCurrentOne() {
        assertEquals(listOf("1.28"), Changelog.since(null, "1.28").map { it.first })
    }

    @Test
    fun nothingNewWhenVersionsMatch() {
        assertTrue(Changelog.since("1.28", "1.28").isEmpty())
    }
}

class BackupTest {

    @Test
    fun rejectsTextThatIsNoJson() {
        val result = Backup.read("hallo")
        assertTrue(result.isFailure)
        assertEquals("Das ist keine Sicherungsdatei.", result.exceptionOrNull()?.message)
    }

    @Test
    fun rejectsOtherApps() {
        val result = Backup.read("""{"app":"de.andere","schema":1,"values":{}}""")
        assertEquals("Das ist keine Sicherung von Doomscroll Blocker.", result.exceptionOrNull()?.message)
    }

    @Test
    fun rejectsNewerSchema() {
        val result = Backup.read("""{"app":"com.yuxizhang.doomscroll","schema":${Store.SCHEMA + 1},"values":{}}""")
        assertTrue(result.isFailure)
    }

    @Test
    fun readsOlderAndCurrentSchema() {
        val old = Backup.read("""{"app":"com.yuxizhang.doomscroll","values":{"global_limit":20}}""")
        assertEquals(20, old.getOrThrow().getInt("global_limit"))
        val current = Backup.read("""{"app":"com.yuxizhang.doomscroll","schema":${Store.SCHEMA},"values":{}}""")
        assertEquals(0, current.getOrThrow().length())
    }

    @Test
    fun missingValuesGiveAnEmptyBackup() {
        assertEquals(0, Backup.read("""{"app":"com.yuxizhang.doomscroll","schema":1}""").getOrThrow().length())
    }


    @Test
    fun designSettingsSurviveTheBackupRoundTrip() {
        val backdrop = Backdrop(kind = Backdrop.GRADIENT, gradient = "warm", blobs = false)
        val values = JSONObject()
            .put(Store.KEY_THEME, "dunkel")
            .put(Store.KEY_GLASS, "voll")
            .put(Store.KEY_STYLE, "tintedDark")
            .put(Store.backdropKey(GlassStyle.TINTED_DARK), backdrop.toJson())
        val text = JSONObject().put("app", "com.yuxizhang.doomscroll").put("schema", Store.SCHEMA).put("values", values).toString()
        val restored = Store.designFromBackup(Backup.read(text).getOrThrow())
        assertEquals("dunkel", restored[Store.KEY_THEME])
        assertEquals("voll", restored[Store.KEY_GLASS])
        assertEquals("tintedDark", restored[Store.KEY_STYLE])
        assertEquals(backdrop, Backdrop.fromJson(restored[Store.backdropKey(GlassStyle.TINTED_DARK)]))
        assertNull(restored[Store.backdropKey(GlassStyle.KLAR)])
    }

    @Test
    fun olderBackupsWithoutDesignLeaveTheSettingsAlone() {
        val values = Backup.read("""{"app":"com.yuxizhang.doomscroll","values":{"global_limit":20}}""").getOrThrow()
        assertTrue(Store.designFromBackup(values).isEmpty())
    }

    @Test
    fun brokenDesignEntriesAreSkipped() {
        val values = JSONObject().put(Store.KEY_THEME, "pink").put(Store.KEY_GLASS, "").put(Store.backdropKey(GlassStyle.KLAR), "kaputt")
        assertTrue(Store.designFromBackup(values).isEmpty())
    }
}

class DesignMigrationTest {

    @Test
    fun monoBecomesTheGlassStyle() {
        assertEquals(GlassStyle.TINTED_DARK, Store.legacyStyle("an"))
        assertEquals(GlassStyle.KLAR, Store.legacyStyle("aus"))
        assertNull(Store.legacyStyle(null))
        assertNull(Store.legacyStyle("vielleicht"))
    }

    @Test
    fun oldBackupWithMonoIsMigratedOnImport() {
        val on = Store.designFromBackup(JSONObject().put(Store.KEY_MONO, "an"))
        assertEquals("tintedDark", on[Store.KEY_STYLE])
        val off = Store.designFromBackup(JSONObject().put(Store.KEY_MONO, "aus"))
        assertEquals("klar", off[Store.KEY_STYLE])
    }

    @Test
    fun newStyleWinsOverOldMono() {
        val both = Store.designFromBackup(JSONObject().put(Store.KEY_MONO, "an").put(Store.KEY_STYLE, "klar"))
        assertEquals("klar", both[Store.KEY_STYLE])
    }

    @Test
    fun settingsParseOnlyKnownKeys() {
        assertEquals(ThemeMode.SYSTEM, parseKey(ThemeMode.entries.toTypedArray(), "system"))
        assertEquals(GlassLevel.EINFACH, parseKey(GlassLevel.entries.toTypedArray(), "einfach"))
        assertEquals(GlassStyle.TINTED_DARK, parseKey(GlassStyle.entries.toTypedArray(), "tintedDark"))
        assertNull(parseKey(GlassStyle.entries.toTypedArray(), "TintedDark"))
        assertNull(parseKey(GlassLevel.entries.toTypedArray(), null))
    }
}

class BackdropTest {

    @Test
    fun jsonRoundTrip() {
        val b = Backdrop(kind = Backdrop.COLOR, color = 0xFF336699.toInt(), blobs = false)
        assertEquals(b, Backdrop.fromJson(b.toJson()))
    }

    @Test
    fun garbageFallsBackStepByStep() {
        assertNull(Backdrop.fromJson(null))
        assertNull(Backdrop.fromJson("kein json"))
        val partly = Backdrop.fromJson("""{"art":"hologramm","verlauf":"gibtsnicht","farbe":"rot"}""")!!
        assertEquals(Backdrop(), partly)
    }

    @Test
    fun parsesColours() {
        assertEquals(0xFF1668B5.toInt(), Backdrop.parseColor("#1668b5"))
        assertEquals(0xFF1668B5.toInt(), Backdrop.parseColor(" 1668B5 "))
        assertNull(Backdrop.parseColor("#12345"))
        assertNull(Backdrop.parseColor("#12345G"))
        assertNull(Backdrop.parseColor(null))
    }
}

class LookTest {

    private fun allLooks(): List<Pair<String, Look>> {
        val backdrops = listOf(
            Backdrop(),
            Backdrop(kind = Backdrop.GRADIENT, gradient = "violett"),
            Backdrop(kind = Backdrop.GRADIENT, gradient = "warm"),
            Backdrop(kind = Backdrop.GRADIENT, gradient = "graphit", blobs = false),
            Backdrop(kind = Backdrop.COLOR, color = 0xFFFFFFFF.toInt()),
            Backdrop(kind = Backdrop.COLOR, color = 0xFFFFD700.toInt()),
            Backdrop(kind = Backdrop.IMAGE),
        )
        return buildList {
            for (theme in ThemeMode.entries) for (style in GlassStyle.entries) for (glass in GlassLevel.entries) {
                for (reduced in listOf(false, true)) for (systemDark in listOf(false, true)) for (b in backdrops) {
                    add("$theme/$style/$glass/reduced=$reduced/dark=$systemDark/${b.kind}${b.gradient}${b.color}" to
                        Look(theme, style, glass, b, systemDark, reduced))
                }
            }
        }
    }

    @Test
    fun textReachesFourAndAHalfOnEverySurfaceInEveryCombination() {
        for ((name, look) in allLooks()) {
            for ((text, back) in look.textPairs()) {
                val c = Look.contrast(text, back)
                assertTrue("$name: text %08X on %08X only %.2f".format(text, back, c), c >= Look.MIN_CONTRAST)
            }
        }
    }

    @Test
    fun denseKlarGlassKeepsTheStepsBetweenSurfaces() {
        val look = Look(ThemeMode.HELL, GlassStyle.KLAR, GlassLevel.VOLL, Backdrop(), false, false)
        assertTrue(Look.luminance(Look.blend(look.hi, 0xFF000000.toInt())) > Look.luminance(Look.blend(look.lo, 0xFF000000.toInt())))
        assertTrue(Look.luminance(Look.blend(look.lo, 0xFF000000.toInt())) > Look.luminance(Look.blend(look.track, 0xFF000000.toInt())))
    }

    @Test
    fun tintedDarkIsAlwaysDark() {
        for (theme in ThemeMode.entries) {
            val look = Look(theme, GlassStyle.TINTED_DARK, GlassLevel.VOLL, Backdrop(), systemDark = false, reduced = false)
            assertTrue(look.dark)
            assertEquals(0xFF000000.toInt(), look.text)
        }
    }

    @Test
    fun themeDecidesDarkOnlyInKlar() {
        fun dark(theme: ThemeMode, system: Boolean) = Look(theme, GlassStyle.KLAR, GlassLevel.EINFACH, Backdrop(), system, false).dark
        assertTrue(dark(ThemeMode.SYSTEM, true))
        assertTrue(!dark(ThemeMode.SYSTEM, false))
        assertTrue(dark(ThemeMode.DUNKEL, false))
        assertTrue(!dark(ThemeMode.HELL, true))
    }

    @Test
    fun levelsDecideWhichSurfacesAreGlass() {
        fun look(level: GlassLevel, reduced: Boolean = false) = Look(ThemeMode.HELL, GlassStyle.TINTED_DARK, level, Backdrop(), false, reduced)
        assertTrue(Look.alphaOf(look(GlassLevel.VOLL).card) < 1f)
        assertTrue(Look.alphaOf(look(GlassLevel.EINFACH).card) == 1f)
        assertTrue(Look.alphaOf(look(GlassLevel.EINFACH).hi) < 1f)
        assertTrue(Look.alphaOf(look(GlassLevel.AUS).hi) == 1f)
        // Fallback: glass is replaced by opaque surfaces whatever was chosen.
        assertTrue(Look.alphaOf(look(GlassLevel.VOLL, reduced = true).card) == 1f)
        assertEquals(0xFFD9DCE1.toInt(), look(GlassLevel.VOLL, reduced = true).card)
    }

    @Test
    fun tintedDarkClampsBrightBackgroundsToDark() {
        val white = Look(ThemeMode.SYSTEM, GlassStyle.TINTED_DARK, GlassLevel.VOLL, Backdrop(kind = Backdrop.COLOR, color = 0xFFFFFFFF.toInt()), false, false)
        assertTrue(Look.luminance(white.stops.first()) <= 0.05)
    }

    @Test
    fun colourBackgroundHasNoSpots() {
        val solid = Look(ThemeMode.SYSTEM, GlassStyle.KLAR, GlassLevel.VOLL, Backdrop(kind = Backdrop.COLOR), false, false)
        assertTrue(solid.blobs.isEmpty())
        val off = Look(ThemeMode.SYSTEM, GlassStyle.KLAR, GlassLevel.VOLL, Backdrop(blobs = false), false, false)
        assertTrue(off.blobs.isEmpty())
    }
}
