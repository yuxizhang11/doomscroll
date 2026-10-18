# Doomscroll Blocker

Android-App, die Instagram Reels, YouTube Shorts und TikTok auf ein Tageslimit begrenzt.

## So funktioniert's

- Die App läuft als Bedienungshilfe (Accessibility Service). Android weckt sie nur bei Bildschirmänderungen in Instagram, YouTube und TikTok, sonst schläft sie. Kein Dauer-Dienst, keine Benachrichtigung, kein Internet.
- Gezählt wird nur die Zeit, in der Reels oder Shorts wirklich offen sind. Der Rest von Instagram und YouTube (Feed, Chats, Suche, normale Videos) zählt nicht und bleibt nutzbar.
- Ist das Limit erreicht, erscheint **„Genug für heute!“** und die App geht aus Reels/Shorts zurück. Bei TikTok geht es zum Startbildschirm, weil TikTok fast nur aus dem Feed besteht.
- Limit wahlweise gemeinsam für alle Apps oder pro App. Um Mitternacht wird alles zurückgesetzt.
- Sperre aufheben: in der Blocker-App einen vorgegebenen Satz mit mindestens 15 Wörtern abtippen (Einfügen ist gesperrt). Gilt nur für heute, pro App oder für alle. Auch ein Lockern der Limits braucht den Satz.
- **Porno-Blocker:** In Chrome, Firefox, Samsung Internet, Brave, Edge, Opera, DuckDuckGo, Vivaldi und Kiwi liest die App nur die Adresszeile. Steht dort eine pornografische Seite oder Suche, geht es zurück und „Diese Seite ist gesperrt“ erscheint. Andere Seiten bleiben offen. Für heute aufheben oder ausschalten geht nur, indem man 20 zufällige Zeichen abtippt. Die Liste steht in [`AdultFilter.kt`](app/src/main/java/com/yuxizhang/doomscroll/AdultFilter.kt).
- App deinstallieren = Blocker weg.

## Installieren

**Mit Android Studio:** Projekt öffnen, Handy per USB (USB-Debugging an) verbinden, ▶ Run.

**Fertige APK:** Unter [Releases](../../releases/latest) die Datei `doomscroll-blocker-vX.Y.apk` aufs Handy laden und öffnen. Jeder Stand auf `main` landet dort automatisch; ein neues Release entsteht, wenn `versionName` in `app/build.gradle.kts` erhöht wird.

Danach:
1. App öffnen und auf **Bedienungshilfen öffnen** tippen.
2. „Doomscroll Blocker“ einschalten.
3. Falls Android die Option ausgraut („Eingeschränkte Einstellung“): *Einstellungen → Apps → Doomscroll Blocker → ⋮ → Eingeschränkte Einstellungen zulassen*, dann Schritt 2 wiederholen.
4. Manche Hersteller (Xiaomi, Huawei, Samsung) beenden Hintergrund-Apps aggressiv. Falls der Blocker nach einiger Zeit aus ist: Akku-Optimierung für die App auf „Nicht optimiert“ stellen.

## Wenn die Erkennung nach einem App-Update nicht mehr klappt

Instagram und YouTube benennen ihre internen Ansichten ab und zu um. Die erkannten IDs stehen in
[`TargetApp.kt`](app/src/main/java/com/yuxizhang/doomscroll/TargetApp.kt). Mit dem *Layout Inspector*
oder `adb shell uiautomator dump` lässt sich die aktuelle ID des Reels/Shorts-Players finden und dort ergänzen.
