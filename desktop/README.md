# Doomscroll Blocker für Windows

Desktop-Variante der Android-App: sitzt im Tray, zählt nur Instagram Reels, YouTube Shorts und TikTok im Browser und sperrt sie beim Tageslimit. Limits, Zähler und Verlauf sind getrennt von der Handy-App, es gibt keinen Abgleich. Sicherung per JSON-Datei wie am Handy (nur die eigene Desktop-Sicherung wird angenommen).

## Starten

```
cd desktop
npm install
npm start
```

Beim ersten Start zeigt sich das Fenster, danach sitzt die App im Tray (Klick öffnet das Fenster). Der Start mit Windows ist standardmäßig an (`--hidden`, also ohne Fenster); Ausschalten braucht 20 abgetippte Zeichen. Achtung: Mit `npm start` trägt sich der Autostart auf den Entwicklungsordner ein; die installierte Fassung (siehe „Installer bauen“) trägt ihre eigene Exe ein.

Zum Beenden: Tray-Menü „Beenden …“ oder Reiter „Mehr“, dann 20 Zeichen abtippen. Das Fenster schließen lässt die App im Tray weiterlaufen.

## Installer bauen

```
cd desktop
npm install
npm run dist
```

Ergebnis: `desktop/dist/Doomscroll-Desktop-Setup-<version>.exe` (NSIS, Windows x64, Installation pro Benutzer, Zielordner wählbar) und der entpackte Stand `desktop/dist/win-unpacked/`. Die Erweiterung liegt im installierten Stand unter `resources/extension` (als `extraResources`, weil Browser nicht aus `asar` laden); der Reiter „Erweiterung“ zeigt diesen Pfad zum Laden an. Der Installer ist nicht signiert (kein Zertifikat), Windows SmartScreen warnt deshalb beim ersten Start. Selbsttest des gebauten Stands: `DOOMSCROLL_SMOKE_DIR=<ordner>` setzen und `dist/win-unpacked/"Doomscroll Desktop.exe" --smoke` starten.

## Browser-Erweiterung

`extension/` ist eine Manifest-V3-Erweiterung für Chrome, Edge, Brave und Firefox (ab 121). Sie meldet alle 2 Sekunden die Adressen der aktiven Tabs an die App und leitet Tabs, die die App sperrt, auf „Genug für heute!“ bzw. „Diese Seite ist gesperrt“ um. Gezählt und entschieden wird nur in der App. Die Sperrseite kommt vom lokalen Server der App (`http://127.0.0.1:47615/blocked`) und nicht aus der Erweiterung, weil Chrome Erweiterungsseiten nicht in private Tabs lädt, solange die Erweiterung `incognito: "spanning"` hat.

- Chrome, Edge, Brave: Erweiterungen, Entwicklermodus, „Entpackte Erweiterung laden“, Ordner `desktop/extension` (installiert: der Pfad aus dem Reiter „Erweiterung“). Chrome zeigt eine Warnung zu `background.scripts`: Das Manifest enthält absichtlich `service_worker` (Chrome) und `scripts` (Firefox) in einer Datei.
- Firefox: `about:debugging`, „Dieser Firefox“, „Temporäres Add-on laden“, `desktop/extension/manifest.json` (bleibt bis zum Neustart des Browsers; eine dauerhafte Installation braucht eine signierte Fassung).
- Danach im Reiter „Erweiterung“ der App den Kopplungscode kopieren und in den Einstellungen der Erweiterung einfügen.

### Private Fenster

Das Manifest setzt `incognito: "spanning"`. Der Browser verlangt trotzdem, dass der User die Erweiterung einmal selbst für private Fenster erlaubt (Chrome: „In Inkognito zulassen“, Edge: „In InPrivate zulassen“, Firefox: „In privaten Fenstern ausführen“). Die Erweiterung meldet per `isAllowedIncognitoAccess()`, ob das erlaubt ist, und die App zeigt „Private Fenster nicht erlaubt“, solange es fehlt. Meldet sich bei laufendem Browser gar keine Erweiterung, zeigt die App „Meldet sich nicht“ und schickt (abschaltbar) eine Windows-Meldung.

Erzwingen ohne Zutun des Users geht nur mit Administratorrechten per Browser-Richtlinie. Das richtet die App nicht ein, sie erklärt es nur im Reiter „Erweiterung“.

### Warum HTTP mit Token und nicht Native Messaging

Native Messaging braucht je Browser einen Registry-Eintrag, eine ausführbare Host-Datei und feste Erweiterungs-IDs (Chrome: Schlüssel im Manifest). Der lokale Server braucht nur einen festen Port und ein Token, das der User einmal einträgt. Geschützt ist er so:

- lauscht nur auf `127.0.0.1:47615`, der Host-Header wird geprüft (gegen DNS-Rebinding)
- `Origin` muss fehlen oder `chrome-extension://` bzw. `moz-extension://` sein, Webseiten werden mit 403 abgewiesen
- Bearer-Token aus 32 Zufallsbytes (steht in der Datendatei der App, nicht im Repo), Vergleich in konstanter Zeit
- kleine Anfragen, strenge Prüfung von Inhalt und Adressen (nur http/https), keine Adressen im Log

Grenze: Ein anderes Programm, das den Code kennt oder die Datendatei lesen darf, kann Meldungen schicken. Das ist bei Native Messaging nicht grundsätzlich anders, solange es ohne Administratorrechte läuft.

## Was wann zählt

- Instagram: `/reels` und `/reel/…` (auch `/name/reel/…`), YouTube: `/shorts/…`, TikTok: die ganze Seite. Alles andere bleibt nutzbar.
- Gezählt wird nur, solange das Browserfenster mit dem Reels/Shorts-Tab den Fokus hat und die Windows-Sitzung entsperrt ist (wie am Handy, wo nur die App im Vordergrund zählt). Ohne Fokus, bei gesperrter Sitzung (`lock-screen`) und im Ruhezustand (`suspend`) zählt nichts. Gesperrt wird trotzdem in jedem Fenster, ein Fensterwechsel umgeht das Limit also nicht. Mehrere Tabs oder Browser zählen die Zeit nur einmal. Bricht die Meldung länger als 6 Sekunden ab, zählt die Lücke nicht. Die Erweiterung braucht dafür keine zusätzliche Berechtigung: `windows.getAll()` liefert `focused` ohne die Berechtigung `windows`.
- Ein bloß ausgeschalteter Monitor ohne Sitzungssperre löst unter Windows kein Ereignis aus; dann zählt nur, was den Fokus hat.
- Porno-Blocker: Liste aus `AdultFilter.kt`, gilt für jede Adresse inklusive Suchbegriffen, immer an, eigene Wörter nur ergänzbar.

## Aufbau

- `main.js`: Tray, Fenster, lokaler Server, Hintergrundprüfungen, Update-Suche. `preload.js`: schmale Brücke zur Oberfläche.
- `src/core/`: reine Logik ohne Electron (`tracker`, `store`, `adult-filter`, `targets`, `unlock`, `backup`, `version`, `extension-status`).
- `src/server.js`, `src/persist.js`, `src/updater.js`, `src/smoke.js` (Selbsttest `electron . --smoke` mit `DOOMSCROLL_SMOKE_DIR`).
- `src/ui/`: Oberfläche nach `C:\Claude\design\DESIGN.md` (Glas aus, einfach, voll; Hell, Dunkel; Animationen und Schriftgröße einstellbar).
- `extension/`: die Browser-Erweiterung. `test/`: `npm test` (`node --test`).

## Updates und Release

Die App sucht beim Start und alle 6 Stunden auf GitHub nach Releases mit dem Tag `desktop-vX.Y.Z` und einer `.exe` (die Android-Releases im selben Repo werden übersprungen). „Update laden“ sucht vorher noch einmal neu und öffnet den Download im Browser. Der Installer lässt sich lokal bauen (siehe oben), ein Release gibt es noch nicht.

Wichtig fürs spätere Release: Die Handy-App fragt `/releases/latest` ab. Ein Desktop-Release darf deshalb nie als „latest“ markiert werden (`gh release create desktop-vX.Y.Z --latest=false`), sonst findet die Handy-App kein APK mehr und meldet einen Fehler. Alternative wäre ein eigenes Repo.
