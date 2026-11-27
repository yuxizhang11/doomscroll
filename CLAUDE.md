# Doomscroll Blocker

Android-App (Kotlin, reine Framework-Views, kein AndroidX, kein Compose). Zählt Reels, Shorts und TikTok über einen Accessibility Service und sperrt bei Tageslimit. Details für Nutzer stehen in `README.md`. Dazu eine Windows-Variante in `desktop/` (Electron, eigene Limits, kein Abgleich mit dem Handy).

## Repo-Karte

- `app/src/main/java/com/yuxizhang/doomscroll/`
  - `BlockerService.kt`: Accessibility Service, zählt die Zeit, sperrt, zeigt die Hinweise (Einstieg der App-Logik).
  - `TargetApp.kt`: die beobachteten Apps und wie ihre Kurzvideo-Bildschirme erkannt werden (View-IDs, Tabs, Web-Adressen).
  - `AdultFilter.kt`: Porno-Blocker (Browserliste, Adresserkennung, Wortlisten). `Guard.kt`: Schutz vor Abschalten und Deinstallieren.
  - `Store.kt`: alle Einstellungen und Tageszähler in einer SharedPreferences-Datei, `SCHEMA` und Migrationen. `Backup.kt`: Export und Import als JSON.
  - `MainActivity.kt`: Einstellungen, Einführung, Heute-Anzeige. `UnlockActivity.kt`: Satz oder 20 Zeichen abtippen zum Lockern.
  - `Ui.kt`: kleines Design-System aus Framework-Views (Farben, Karten, Knöpfe). `AdminReceiver.kt`: Geräteadmin ohne Rechte.
  - `Updater.kt`, `UpdateJob.kt`: Update-Suche über die GitHub-Releases, Installation, Benachrichtigung. `Changelog.kt`: Änderungen in der App.
- `app/src/test/`: JVM-Unit-Tests der Logik (Versionsvergleich, Ruhezeit-Fenster, Porno-Filter, Erkennung per Adresse, Backup-Lesen, Changelog).
- `app/src/main/res/xml/accessibility_config.xml`: Paketliste des Service, muss zu `TargetApp`, `AdultFilter.BROWSERS` und `Guard.PACKAGES` passen.
- `CHANGELOG.md` und `Changelog.kt` müssen gleich bleiben, `TESTLISTE.md` hat pro Release einen Abschnitt.
- `.github/workflows/build.yml` (Build, Lint, Release bei Push auf `main`), `smoke.yml` und `.github/smoke.sh` (Start auf dem Emulator).
- `desktop/`: Windows-Variante (Electron, Tray) mit eigener Versionierung (`desktop/package.json`, `desktop/CHANGELOG.md`), getrennt von der Android-App. Details in `desktop/README.md`.
  - `main.js`: Tray, Fenster, Server, Hintergrundprüfungen. `src/core/`: reine Logik (`tracker.js` zählt und sperrt wie `BlockerService.kt`, `store.js` wie `Store.kt`, `adult-filter.js` wie `AdultFilter.kt`, `unlock.js` wie `UnlockActivity.kt`, `backup.js`). Die Porno-Liste muss zu `AdultFilter.kt` passen.
  - `src/server.js`: lokaler Server (nur 127.0.0.1, Token). `src/ui/`: Oberfläche. `src/smoke.js`: Selbsttest `electron . --smoke`.
  - `extension/`: Browser-Erweiterung (Chrome, Edge, Brave, Firefox), meldet Tab-Adressen an den Server und leitet gesperrte Tabs um. Port und Meldungsformat müssen zu `src/server.js` passen.
  - `test/`: `cd desktop && npm test` (`node --test`).

## Bauen und Testen

- Unit-Tests: `./gradlew testDebugUnitTest` (reine JVM, Logik ohne Gerät).
- Alles wie in der CI: `./gradlew --no-daemon testDebugUnitTest assembleDebug assembleRelease lint`. Unter Windows braucht das ein JDK 17 oder neuer in `JAVA_HOME` (JDK 21 geht, das mitgelieferte JDK von Android Studio hing in einer Session), eine `local.properties` mit `sdk.dir` und den Aufruf als `.\gradlew.bat` (ohne `.\` findet `cmd` die Datei hier nicht).
- Ist das GitHub-Actions-Kontingent aufgebraucht, läuft derselbe Build lokal. `release-lokal.sh` kennt diese App nicht.

## Release

- Desktop: Releases tragen den Tag `desktop-vX.Y.Z` und müssen mit `--latest=false` angelegt werden, weil `Updater.kt` der Handy-App `/releases/latest` abfragt. Lokaler Installer-Build mit `cd desktop && npm run dist` (electron-builder, NSIS, unsigniert); noch keine CI und kein Release für `desktop/`.

- Version steht in `app/build.gradle.kts` (`versionName`, `versionCode`), Release-Notes sind der Abschnitt in `CHANGELOG.md`, dazu `Changelog.kt` und `TESTLISTE.md`.
- Releases laufen nach den Regeln in `C:\Claude\CLAUDE.md` (erst Rückfrage, dann bauen). Die APK wird mit dem festen Schlüssel signiert, sonst lässt sie sich nicht über die installierte App installieren.
