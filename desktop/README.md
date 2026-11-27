# Doomscroll Blocker für Windows

Desktop-Variante der Android-App: sitzt im Tray, zählt nur Instagram Reels, YouTube Shorts und TikTok im Browser und sperrt sie beim Tageslimit. Limits, Zähler und Verlauf sind getrennt von der Handy-App, es gibt keinen Abgleich. Sicherung per JSON-Datei wie am Handy (nur die eigene Desktop-Sicherung wird angenommen).

## Starten

```
cd desktop
npm install
npm start
```

Beim ersten Start zeigt sich das aufgeklappte Fenster gleich auf dem Reiter „Erweiterung“ (geführte Einrichtung), danach sitzt die App im Tray (Klick öffnet das kleine Panel, siehe „Panel am Tray“; solange sich noch nie eine Erweiterung verbunden hat, beginnt das aufgeklappte Fenster wieder bei der Einrichtung, und im Tray-Menü gibt es „Erweiterung einrichten …“). Der Start mit Windows ist standardmäßig an (`--hidden`, also ohne Fenster); Ausschalten braucht 20 abgetippte Zeichen. Achtung: Mit `npm start` trägt sich der Autostart auf den Entwicklungsordner ein; die installierte Fassung (siehe „Installer bauen“) trägt ihre eigene Exe ein.

Zum Beenden: Tray-Menü „Beenden …“ oder Reiter „Mehr“, dann 20 Zeichen abtippen. Das Fenster schließen lässt die App im Tray weiterlaufen.

## Panel am Tray

Ein Linksklick auf das Tray-Symbol öffnet ein kleines Panel (360 × 480 px, rahmenlos) direkt am Symbol; ein zweiter Klick schließt es wieder.

- Inhalt: Kopfzeile mit Logo, Status („Erweiterung“: verbunden, fehlt, nicht eingerichtet, Browser aus; „Private Fenster“: geschützt, nicht geschützt, unbekannt), Verbrauch heute je App mit dem Gesamtlimit, Schnellschalter und „Mehr“. Die Schalter: „Meldungen“ (schaltet Restzeit, Vorwarnung und „Erweiterung fehlt“ zusammen; einzeln unter „Mehr“, „Hinweise“), „Mit Windows starten“ (Einschalten sofort, Ausschalten nur mit den 20 abgetippten Zeichen), dazu „Sperre aufheben …“ (Satz abtippen) und „Erweiterung einrichten“.
- „Mehr“ klappt dasselbe Fenster zu den vollen Reitern (Heute, Limits, Erweiterung, Mehr) auf, es wächst von der Taskleiste weg (520 × 760 px, kleiner, wenn der Bildschirm es nicht hergibt). „Weniger“ klappt wieder ein. Die Animation folgt der Einstellung „Animationen“ (Reiter „Mehr“); steht sie auf „Wie Windows“, entfällt sie bei „reduzierter Bewegung“ in Windows.
- Das kleine Panel schließt bei Fokusverlust und mit Esc; das aufgeklappte Fenster bleibt offen, bis man es mit ✕ oder Esc schließt (es hat keinen Systemrahmen, die Kopfleiste zieht es). Das Fenster lässt sich nicht in der Größe ziehen. `thickFrame` ist aus, weil `setBounds` sonst bei rahmenlosen Fenstern die Zeichenfläche um den unsichtbaren Rand vergrößert; dafür fehlen Systemschatten und -rand, ein feiner eigener Rand ersetzt ihn.
- Rechtsklick zeigt das Menü: „Öffnen“ (aufgeklapptes Fenster), „Erweiterung einrichten …“, „Beenden …“. Ein zweiter Start der App und der erste Start nach der Installation öffnen ebenfalls das aufgeklappte Fenster.
- Position: `src/core/flyout.js` (reine Funktionen, getestet in `test/flyout.test.js`) rechnet aus `tray.getBounds()` und dem Bildschirm (Arbeitsbereich) die Lage aus. Die Taskleiste wird daran erkannt, dass der Arbeitsbereich kleiner ist als der Bildschirm (unten, oben, links, rechts); bei ausgeblendeter Taskleiste zählt der nächste Bildschirmrand. Das Panel ist auf das Symbol zentriert, bleibt 8 px vom Rand weg und im Arbeitsbereich. Ist die Tray-Position unbrauchbar (Symbol im Überlauf), sitzt es unten rechts. Ein Tray-Klick, der das Panel gerade durch den Fokusverlust geschlossen hat, öffnet es nicht gleich wieder.

## Installer bauen

```
cd desktop
npm install
npm run dist
```

Ergebnis: `desktop/dist/Doomscroll-Desktop-Setup-<version>.exe` (NSIS, Windows x64, Installation pro Benutzer, Zielordner wählbar) und der entpackte Stand `desktop/dist/win-unpacked/`. Erweiterung und Kopplungs-Host liegen im installierten Stand unter `resources/extension` und `resources/native-host` (als `extraResources`, weil Browser nicht aus `asar` laden); der Reiter „Erweiterung“ kennt den Pfad und bietet „Ordner öffnen“ und „Pfad kopieren“ an. Im Entwicklungsstand ist es `desktop/extension`. Es gibt eine Startmenü-, aber keine Desktop-Verknüpfung. Beim Deinstallieren entfernt `installer/installer.nsh` den Autostart-Eintrag (Name wie die AppUserModelID in `main.js`) und die fünf Native-Messaging-Einträge der App (bei einem Update bleibt alles stehen); die Daten in `%APPDATA%\doomscroll-desktop` bleiben bewusst erhalten, damit Deinstallieren und Neuinstallieren das Tageslimit nicht zurücksetzt. Eine laufende App beendet der Installer beim Update und Deinstallieren selbst. Der Installer ist nicht signiert (kein Zertifikat), Windows SmartScreen warnt deshalb beim ersten Start. Selbsttest des gebauten Stands: `DOOMSCROLL_SMOKE_DIR=<ordner>` setzen und `dist/win-unpacked/"Doomscroll Desktop.exe" --smoke` starten.

## Browser-Erweiterung

`extension/` ist eine Manifest-V3-Erweiterung für Chrome, Edge, Brave und Firefox (ab 121). Sie meldet alle 2 Sekunden die Adressen der aktiven Tabs an die App und leitet Tabs, die die App sperrt, auf „Genug für heute!“ bzw. „Diese Seite ist gesperrt“ um. Gezählt und entschieden wird nur in der App. Die Sperrseite kommt vom lokalen Server der App (`http://127.0.0.1:47615/blocked`) und nicht aus der Erweiterung, weil Chrome Erweiterungsseiten nicht in private Tabs lädt, solange die Erweiterung `incognito: "spanning"` hat.

### Einrichtung (Reiter „Erweiterung“ in der App)

Die App erkennt installierte Browser (Chrome, Edge, Brave, Firefox; Standardpfade, dann Registry „App Paths“) und führt durch die Schritte für den gewählten Browser:

1. „<Browser> öffnen und Erweiterungsseite zeigen“ startet den Browser mit `chrome://extensions`, `edge://extensions`, `brave://extensions` bzw. `about:debugging#/runtime/this-firefox`.
2. Chrome, Edge, Brave: Entwicklermodus einschalten, „Entpackte Erweiterung laden“, den Ordner wählen. Der Reiter zeigt den richtigen Pfad (im installierten Stand `<Installationsordner>\resources\extension`, im Entwicklungsstand `desktop/extension`) mit „Ordner öffnen“ und „Pfad kopieren“. Chrome zeigt eine Warnung zu `background.scripts`: Das Manifest enthält absichtlich `service_worker` (Chrome) und `scripts` (Firefox) in einer Datei.
3. Private Fenster erlauben: „Detailseite der Erweiterung öffnen“ springt auf `chrome://extensions/?id=<ID>` (Edge, Brave entsprechend); dort „In Inkognito zulassen“ bzw. „In InPrivate zulassen“ einschalten. Firefox hat keine solche Adresse: `about:addons`, „In privaten Fenstern ausführen“ auf „Erlauben“.
4. Der Status je Browser zeigt live „Erweiterung verbunden“, „Erweiterung fehlt“ (Browser läuft, Erweiterung meldet sich nicht), „Browser nicht gestartet“ und „Private Fenster nicht erlaubt“. Chrome und Brave lassen sich für die Erweiterung nicht immer unterscheiden (Label „Chrome oder Brave“); die Oberfläche weist darauf hin.

Firefox: Mit „Temporäres Add-on laden“ bleibt die Erweiterung nur bis zum Neustart von Firefox. Eine dauerhafte Installation braucht eine von Mozilla signierte Fassung; die gibt es noch nicht.

Hat sich noch nie eine Erweiterung verbunden, öffnet sich das Fenster beim ersten Start (und später beim Öffnen aus dem Tray) auf diesem Reiter. Autostart-Starts mit `--hidden` zeigen kein Fenster.

### Automatische Kopplung (Native Messaging)

Die Erweiterung holt Kopplungscode und Port selbst bei der App, ohne dass jemand etwas kopiert:

- Die App schreibt bei jedem Start (nur Änderungen) in `%APPDATA%\doomscroll-desktop\native-host\` die Startdatei `host.cmd`, die Host-Manifeste `host-chromium.json` (`allowed_origins`: genau die feste Erweiterungs-ID) und `host-firefox.json` (`allowed_extensions`: genau `doomscroll-blocker@doomscroll.local`) und die Kopplungsdatei `pairing.json` (Code und Port). Dazu trägt sie unter HKCU (kein Administrator nötig) `...\NativeMessagingHosts\de.doomscroll.desktop` für Chrome, Edge, Brave, Chromium und Firefox ein.
- Der Host `native-host/host.js` läuft über `host.cmd` als `ELECTRON_RUN_AS_NODE` mit der Exe der App (kein separates Node nötig, kein Fenster). Er versteht nur `{"type":"pair"}`, antwortet mit Code und Port aus `pairing.json` und beendet sich, wenn der Browser die Leitung schließt. Er liest sonst nichts, schreibt nichts, öffnet kein Netz und startet nichts. Nachrichten über 1 KB und alles andere werden abgelehnt.
- Die Erweiterung hat dafür eine feste ID (`key` im Manifest; die ID leitet `src/core/native-messaging.js` ab, ein Test prüft sie) und die Berechtigung `nativeMessaging`. Port und Code übernimmt sie nur, wenn die Antwort streng stimmt (64 Hex-Zeichen, Port 1024 bis 65535). `host_permissions` ist `http://127.0.0.1/*` (jeder Port, nur Loopback), weil die App über `DOOMSCROLL_PORT` einen anderen Port haben kann.
- Lehnt die App den Code ab (z. B. weil sie ein neues Token bekam), holt die Erweiterung ihn neu, höchstens alle 30 Sekunden.
- Als Rückfall bleibt der Kopplungscode von Hand (Reiter „Erweiterung“, „Kopplung von Hand“, in die Optionen der Erweiterung einfügen). Er gilt für den Standardport 47615.
- Testläufe mit `DOOMSCROLL_NO_AUTOSTART=1` lassen den Autostart-Eintrag in Ruhe (sonst überschreibt ein Lauf aus dem Projektordner den Eintrag der installierten App).

### Private Fenster

Das Manifest setzt `incognito: "spanning"`. Der Browser verlangt trotzdem, dass der User die Erweiterung einmal selbst für private Fenster erlaubt (siehe Einrichtung). Die Erweiterung meldet per `isAllowedIncognitoAccess()`, ob das erlaubt ist, und die App zeigt „Private Fenster nicht erlaubt“, solange es fehlt. Meldet sich bei laufendem Browser gar keine Erweiterung, zeigt die App „Erweiterung fehlt“ und schickt (abschaltbar) eine Windows-Meldung.

Erzwingen ohne Zutun des Users geht nur mit Administratorrechten per Browser-Richtlinie. Das richtet die App nicht ein, sie erklärt es nur im Reiter „Erweiterung“.

### Schutz des lokalen Servers

Die Daten laufen weiter über den lokalen HTTP-Server mit Token; Native Messaging liefert nur Code und Port. Geschützt ist er so:

- lauscht nur auf `127.0.0.1` (Standardport 47615), der Host-Header wird geprüft (gegen DNS-Rebinding)
- `Origin` muss fehlen oder `chrome-extension://` bzw. `moz-extension://` sein, Webseiten werden mit 403 abgewiesen
- Bearer-Token aus 32 Zufallsbytes (steht in der Datendatei der App und in `pairing.json`, nicht im Repo), Vergleich in konstanter Zeit
- kleine Anfragen, strenge Prüfung von Inhalt und Adressen (nur http/https), keine Adressen im Log

Grenze: Ein anderes Programm, das den Code kennt oder die Datendatei lesen darf, kann Meldungen schicken. Es kann außerdem selbst einen Host unter dem Namen eintragen oder den Host starten; ohne Administratorrechte ist das nicht zu verhindern, es gilt dieselbe Grenze wie für die Datendatei.

## Was wann zählt

- Instagram: `/reels` und `/reel/…` (auch `/name/reel/…`), YouTube: `/shorts/…`, TikTok: die ganze Seite. Alles andere bleibt nutzbar.
- Gezählt wird nur, solange das Browserfenster mit dem Reels/Shorts-Tab den Fokus hat und die Windows-Sitzung entsperrt ist (wie am Handy, wo nur die App im Vordergrund zählt). Ohne Fokus, bei gesperrter Sitzung (`lock-screen`) und im Ruhezustand (`suspend`) zählt nichts. Gesperrt wird trotzdem in jedem Fenster, ein Fensterwechsel umgeht das Limit also nicht. Mehrere Tabs oder Browser zählen die Zeit nur einmal. Bricht die Meldung länger als 6 Sekunden ab, zählt die Lücke nicht. Die Erweiterung braucht dafür keine zusätzliche Berechtigung: `windows.getAll()` liefert `focused` ohne die Berechtigung `windows`.
- Ein bloß ausgeschalteter Monitor ohne Sitzungssperre löst unter Windows kein Ereignis aus; dann zählt nur, was den Fokus hat.
- Porno-Blocker: Liste aus `AdultFilter.kt`, gilt für jede Adresse inklusive Suchbegriffen, immer an, eigene Wörter nur ergänzbar.

## Aufbau

- `main.js`: Tray, Panel (klein und aufgeklappt), lokaler Server, Hintergrundprüfungen, Update-Suche, Start der Browser (nur aus fester Liste). `preload.js`: schmale Brücke zur Oberfläche.
- `src/core/`: reine Logik ohne Electron (`tracker`, `store`, `adult-filter`, `targets`, `unlock`, `backup`, `version`, `extension-status`, `browsers` für Erkennung und Status, `native-messaging` für Manifeste, Registry-Schlüssel und IDs, `flyout` für Lage und Größe des Panels).
- `assets/`: Logo der Handy-App (`logo.svg`, Quelle) und daraus erzeugt `icon.ico` (16 bis 256 px, für Exe und Installer), `icon.png`, `tray*.png` (16 px, dazu `@1.25x` bis `@3x`). `tools/make-icons.js` erzeugt sie samt `extension/icons/` neu: `npx electron tools/make-icons.js` (rendert mit dem Chromium von Electron, keine weitere Abhängigkeit). In der Glas-Stufe „voll“ zeigt die Kopfzeile `logo-glass.svg` (Glas-Fassung nach DESIGN.md 6c, gleiche Form; Symbole des Systems bleiben flach). Das Logo ist das Launcher-Icon der Handy-App (`app/src/main/res/drawable/ic_launcher_foreground.xml` auf dem Hintergrund `#D84343`). Ändert sich das Icon am Handy, `logo.svg` (und `logo-glass.svg`) anpassen und das Skript laufen lassen.
- `src/server.js`, `src/persist.js`, `src/updater.js`, `src/native-setup.js` (schreibt Manifeste und Registry), `src/smoke.js` (Selbsttest `electron . --smoke` mit `DOOMSCROLL_SMOKE_DIR`).
- `src/ui/`: Oberfläche nach `C:\Claude\design\DESIGN.md` (Glas aus, einfach, voll; Hell, Dunkel; Animationen und Schriftgröße einstellbar).
- `extension/`: die Browser-Erweiterung. `native-host/host.js`: der Kopplungs-Host. `test/`: `npm test` (`node --test`).

## Updates und Release

Die App sucht beim Start und alle 6 Stunden auf GitHub nach Releases mit dem Tag `desktop-vX.Y.Z` und einer `.exe` (die Android-Releases im selben Repo werden übersprungen). „Update laden“ sucht vorher noch einmal neu und öffnet den Download im Browser. Der Installer lässt sich lokal bauen (siehe oben), ein Release gibt es noch nicht.

Wichtig fürs spätere Release: Die Handy-App fragt `/releases/latest` ab. Ein Desktop-Release darf deshalb nie als „latest“ markiert werden (`gh release create desktop-vX.Y.Z --latest=false`), sonst findet die Handy-App kein APK mehr und meldet einen Fehler. Alternative wäre ein eigenes Repo.
