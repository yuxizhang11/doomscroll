package com.yuxizhang.doomscroll

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
    fun monoSurvivesTheBackupRoundTrip() {
        for (on in listOf(true, false)) {
            val text = """{"app":"com.yuxizhang.doomscroll","schema":${Store.SCHEMA},"values":{"mono":"${Store.monoValue(on)}"}}"""
            val raw = Backup.read(text).getOrThrow().optString(Store.KEY_MONO)
            assertEquals(on, Store.parseMono(raw))
        }
    }

    @Test
    fun olderBackupsWithoutMonoLeaveTheModeAlone() {
        val values = Backup.read("""{"app":"com.yuxizhang.doomscroll","values":{"global_limit":20}}""").getOrThrow()
        assertNull(Store.parseMono(values.optString(Store.KEY_MONO)))
    }
}

class MonoTest {

    @Test
    fun onlyAnAndAusAreKnown() {
        assertEquals(true, Store.parseMono("an"))
        assertEquals(false, Store.parseMono("aus"))
        assertNull(Store.parseMono(null))
        assertNull(Store.parseMono(""))
        assertNull(Store.parseMono("true"))
    }

    @Test
    fun monoValueRoundTrips() {
        assertEquals("an", Store.monoValue(true))
        assertEquals("aus", Store.monoValue(false))
    }

    @Test
    fun tokenPairsReachTheContrastOfDesignMd() {
        val bg = MonoTokens.BG
        assertTrue(contrast(MonoTokens.TEXT, bg) >= 4.5)
        assertTrue(contrast(MonoTokens.MUTED, MonoTokens.SURFACE) >= 4.5)
        assertTrue(contrast(MonoTokens.GLYPH, MonoTokens.DISC) >= 4.5)
        assertTrue(contrast(MonoTokens.DISC, MonoTokens.DISC_OFF) >= 4.5)
        assertTrue(contrast(MonoTokens.DISC, MonoTokens.TRACK) >= 4.5)
        assertTrue(contrast(MonoTokens.MUTED, MonoTokens.TRACK) >= 4.5)
        assertTrue(contrast(MonoTokens.DISC, bg) >= 3.0)
    }

    private fun luminance(argb: Int): Double {
        fun channel(shift: Int): Double {
            val c = ((argb shr shift) and 0xFF) / 255.0
            return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }

    private fun contrast(a: Int, b: Int): Double {
        val (hi, lo) = luminance(a).let { x -> luminance(b).let { y -> maxOf(x, y) to minOf(x, y) } }
        return (hi + 0.05) / (lo + 0.05)
    }
}
