package com.yuxizhang.doomscroll

/** What changed in each version, newest first. Keep in sync with CHANGELOG.md. */
object Changelog {

    val entries: List<Pair<String, List<String>>> = listOf(
        "1.16" to listOf(
            "Nach jedem Update zeigt die App kurz, was neu ist.",
            "Alle Änderungen stehen jetzt im Changelog.",
        ),
        "1.15" to listOf(
            "Absturz beim Öffnen behoben, der in 1.14 bei eingeschaltetem Blocker auftrat.",
        ),
        "1.14" to listOf(
            "Kürzeres Design: Einstellungen sind eingeklappt und öffnen sich beim Antippen.",
            "Benachrichtigung, sobald eine neue Version da ist, auch wenn die App geschlossen ist.",
            "Beim Öffnen eines Reels oder Shorts erscheint kurz die Restzeit.",
            "„Einführung wiederholen“ unter Limits.",
        ),
        "1.13" to listOf(
            "Videos in Instagram-Stories werden nicht mehr gesperrt.",
        ),
        "1.12" to listOf(
            "Updates direkt in der App suchen und mit einem Tipp installieren.",
        ),
        "1.11" to listOf(
            "Einführung beim ersten Start: Apps auswählen und Zeit festlegen.",
            "Nicht gewählte Apps werden ausgeblendet und lassen sich später ergänzen.",
            "Instagram: auch Reels, die aus dem Feed im Vollbild geöffnet werden, zählen.",
        ),
        "1.10" to listOf(
            "Instagram: nur noch Reels im Vollbild zählen, Reels im Feed nicht.",
        ),
        "1.9" to listOf(
            "Fehler- und Leistungsprüfung: Erkennung zuverlässiger, weniger Fehlalarme beim Porno-Blocker, richtige Meldung während der Ruhezeit.",
        ),
        "1.8" to listOf(
            "Vorwarnzeit einstellbar; bei kurzen Limits kommt keine Warnung.",
        ),
        "1.7" to listOf(
            "Mehr Browser und Reels-Quellen: Snapchat Spotlight, Facebook Reels, YouTube Shorts im Browser.",
            "Warnung kurz vor Ablauf des Limits.",
            "Ruhezeiten, in denen alles gesperrt ist.",
            "Statistik der letzten 7 Tage.",
        ),
        "1.6" to listOf(
            "Knopf, der die App-Einstellungen öffnet.",
        ),
        "1.5" to listOf(
            "Porno-Blocker sperrt schon beim Tippen und reagiert schneller.",
        ),
        "1.4" to listOf(
            "Porno-Blocker erkennt Firefox mit der neuen Adressleiste.",
        ),
        "1.3" to listOf(
            "Minuten-Limits lassen sich direkt eintippen.",
        ),
        "1.2" to listOf(
            "Schutz vor Abschalten und Deinstallieren, aufhebbar mit 20 Zeichen.",
            "Fester Signaturschlüssel, damit Updates über die alte Version installiert werden.",
        ),
        "1.1" to listOf(
            "Porno-Blocker für Browser.",
            "Neues Design.",
        ),
        "1.0" to listOf(
            "Erste Version: Tageslimit für Instagram Reels, YouTube Shorts und TikTok, gemeinsam oder pro App.",
            "Aufheben für heute nur mit einem langen Satz.",
        ),
    )

    /** Entries newer than [since], or only the current one when [since] is unknown. */
    fun since(since: String?, current: String): List<Pair<String, List<String>>> =
        if (since == null) entries.filter { it.first == current }
        else entries.filter { Updater.isNewer(it.first, since) && !Updater.isNewer(it.first, current) }
}
