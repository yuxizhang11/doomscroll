# Testliste

Pro Release ein Abschnitt. Vor dem Merge auf einem echten Android-Handy abhaken, neueste Version oben.
Immer mitprüfen: App startet, Blocker läuft nach Neustart weiter, Update über die alte Version behält die Einstellungen.

## Desktop 0.1.0 (Windows, noch ohne Release)

Auf einem echten Windows-PC mit `cd desktop && npm start`; `npm test` läuft vorher grün.

- [ ] Fünf Minuten Shorts am Stück ansehen, ohne den Tab zu wechseln: Heute zeigt etwa 5 min (der Browser legt den Hintergrundprozess der Erweiterung nicht zu früh schlafen; Chrome und Firefox).
- [ ] Reel im Browser offen lassen und in ein anderes Programm wechseln: Heute zählt nicht weiter. Zurück zum Browser: es zählt wieder.
- [ ] Windows sperren (Win+L), nach einer Minute entsperren: die Minute fehlt in Heute. Dasselbe mit Standby/Ruhezustand.
- [ ] Limit erreicht, Browserfenster ohne Fokus: Der Tab ist trotzdem gesperrt, sobald er sichtbar ist.
- [ ] Dasselbe in einem privaten Fenster: Die Sperrseite erscheint dort ebenfalls.
- [ ] Tray-Symbol erscheint, Klick öffnet das Fenster, Schließen lässt die App im Tray.
- [ ] Erweiterung in Chrome, Edge oder Brave laden, Kopplungscode einfügen: Reiter „Erweiterung“ zeigt „Verbunden“.
- [ ] Dasselbe in Firefox (temporäres Add-on).
- [ ] instagram.com/reels, youtube.com/shorts und tiktok.com zählen die Zeit; Feed, normale YouTube-Videos und Suche zählen nicht.
- [ ] Limit auf 1 Minute: nach Ablauf erscheint „Genug für heute!“ im Tab, „Zur Startseite“ führt auf die normale Seite.
- [ ] Sperre aufheben: Satz abtippen, Einfügen (Strg+V, Rechtsklick) geht nicht, danach zählt nichts mehr bis Mitternacht.
- [ ] Limit erhöhen verlangt den Satz, Verkleinern nicht.
- [ ] Porno-Wort im Adressfeld oder in einer Suche: Tab wird auf „Diese Seite ist gesperrt“ umgeleitet, auch im privaten Fenster.
- [ ] Private Fenster: ohne Erlaubnis zeigt die App „Private Fenster nicht erlaubt“, nach „In Inkognito zulassen“ verschwindet es.
- [ ] Erweiterung entfernen, Browser offen lassen: nach etwa 90 Sekunden kommt die Meldung „Erweiterung fehlt“, im Reiter steht „Meldet sich nicht“.
- [ ] Beenden im Tray verlangt 20 Zeichen; Autostart ausschalten ebenfalls.
- [ ] Neustart von Windows: App startet im Tray ohne Fenster (Autostart).
- [ ] Datensicherung exportieren, in frischer Installation importieren; Sicherung der Handy-App wird abgelehnt.
- [ ] Zeitumstellung oder Mitternacht: Zähler beginnen neu, gestern steht in „Letzte 7 Tage“.
- [ ] Glas „Aus“, „Einfach“, „Voll“, Hell und Dunkel, Schriftgröße „Riesig“: alles lesbar, nichts überlappt.

Installer (`cd desktop && npm run dist`, unsigniert):

- [ ] `Doomscroll-Desktop-Setup-0.1.0.exe` startet (SmartScreen: „Weitere Informationen“, „Trotzdem ausführen“), lässt den Zielordner wählen und installiert ohne Administratorrechte.
- [ ] Nach der Installation startet „Doomscroll Desktop“ mit Tray-Symbol und Fenster; Startmenü-Verknüpfung vorhanden (eine Desktop-Verknüpfung gibt es absichtlich nicht).
- [ ] Autostart: In Windows (Task-Manager, Autostart-Apps) steht „Doomscroll Desktop“ mit dem Installationsordner, nicht mit dem Entwicklungsordner; nach Neustart startet die App ohne Fenster im Tray.
- [ ] Reiter „Erweiterung“ zeigt einen Pfad unter dem Installationsordner (`…\resources\extension`); dieser Ordner lässt sich in Chrome, Edge und Brave als „Entpackte Erweiterung“ laden, `manifest.json` in Firefox als temporäres Add-on.
- [ ] Installieren über eine ältere Fassung behält Limits und Verlauf.
- [ ] Deinstallieren (Windows-Einstellungen, Apps) entfernt Programmordner und Verknüpfungen; der Autostart-Eintrag verschwindet ebenfalls (Task-Manager, Autostart-Apps). Limits und Verlauf bleiben in `%APPDATA%\doomscroll-desktop` erhalten, damit Deinstallieren das Limit nicht zurücksetzt.

## 1.28

- [ ] Porno-Blocker: Schalter steht auf „an“ und lässt sich nicht antippen, kein Code-Feld, kein „Heute aufheben“.
- [ ] Porno-Wort im Browser suchen: Seite wird gesperrt.
- [ ] Eigenes Wort hinzufügen funktioniert, einen „Entfernen“-Knopf gibt es nicht mehr.
- [ ] Update über die alte Version: Blocker bleibt an, Einstellungen bleiben erhalten.
- [ ] Update-Hinweis: Installation lädt die neueste Version.

## 1.27

- [ ] Limit erreicht, YouTube aus einem Short heraus schließen und neu öffnen (startet im Short): Sperre erscheint, YouTube öffnet sich auf der Startseite.
- [ ] Dasselbe mit Instagram und einem Reel: Instagram öffnet sich auf dem Feed.
- [ ] Short-Link aus WhatsApp öffnen bei erreichtem Limit: YouTube-Startseite statt Homescreen.
- [ ] Short aus dem YouTube-Feed antippen bei erreichtem Limit: wie bisher zurück in den Feed, kein Neustart der App.
- [ ] youtube.com/shorts im Browser bei erreichtem Limit: wie bisher zurück bzw. Homescreen, YouTube-App öffnet sich nicht.
- [ ] TikTok bei erreichtem Limit: weiterhin Homescreen.

## 1.26

- [ ] Limits: zwischen den Apps ist eine Trennlinie, in hellem und dunklem Modus sichtbar.
- [ ] Das ✕ steht direkt neben dem App-Namen, ist kleiner, lässt sich aber gut treffen; Entfernen funktioniert wie vorher.
- [ ] Große Schriftgröße (200 %): Name und ✕ bleiben in einer Zeile ohne Überlappung.

## 1.25

- [ ] Porno-Blocker → Eigene Wörter: Hinweistext nennt kein Beispielwort mehr.

## 1.24

- [ ] Porno-Blocker → Eigene Wörter: „deepfake“ hinzufügen, erscheint in der Liste.
- [ ] Im Browser „deepfake“ (auch „DeepFake videos“) suchen: Feld wird geleert, Sperre erscheint.
- [ ] Seite mit „deepfake“ in der Adresse öffnen: Seite wird gesperrt.
- [ ] „deepfake“ in WhatsApp oder Notizen tippen: nichts passiert.
- [ ] Ein Zeichen hinzufügen: Meldung „Mindestens 2 Zeichen“, nichts gespeichert.
- [ ] Entfernen: 20 Zeichen müssen abgetippt werden, danach ist das Wort weg; Abbrechen lässt es stehen.
- [ ] Export/Import: Wörter sind nach Import da; Import entfernt keine vorhandenen Wörter.
- [ ] Vorinstallierter Browser „Internet“ (Xiaomi/Huawei/Oppo, falls vorhanden) und Google-App-Suche: „porn“ wird gesperrt.

## 1.23

- [ ] Instagram: Reel öffnen, sofort zurück und direkt ein anderes Reel antippen (unter 1 s): Restzeit erscheint.
- [ ] YouTube: Short öffnen, sofort zurück und direkt ein anderes Short antippen: Restzeit erscheint.
- [ ] Reel per Runterwischen schließen und gleich ein neues öffnen: Restzeit erscheint.
- [ ] Innerhalb der Reels-/Shorts-Ansicht zum nächsten Video wischen (auch schnell, mehrmals): keine Restzeit.
- [ ] Zeit wird weiter richtig gezählt (Verlauf), Sperre und Vorwarnung kommen wie bisher.
- [ ] Akku: 10 Minuten Reels schauen, kein auffälliger Mehrverbrauch und kein Ruckeln.

## 1.22

- [ ] Update von 1.21: alle Einstellungen und der Verlauf sind noch da.
- [ ] Datensicherung → Exportieren: Datei wird gespeichert, „Gesichert“ erscheint.
- [ ] Limit verkleinern, dann Sicherung importieren: Satz muss abgetippt werden, danach gilt das alte Limit.
- [ ] Limit vergrößern, dann Sicherung importieren: kein Satz nötig, „Gespeichert“ erscheint.
- [ ] Porno-Blocker aus, Sicherung mit „an“ importieren: er ist wieder an. Umgekehrt bleibt er an.
- [ ] Verlauf (Letzte 7 Tage) nach Import auf neuem Handy sichtbar.
- [ ] Fremde Datei (z. B. Foto) importieren: Meldung, nichts ändert sich.
- [ ] Offline: Export und Import klappen ohne Internet.

## 1.21

- [ ] Hinweise: alle vier Schalter stehen nach dem Update auf an.
- [ ] „Restzeit beim Öffnen“ aus: Shorts/Reels öffnen zeigt keine Restzeit, Sperre und Vorwarnung kommen weiter.
- [ ] „Update-Benachrichtigung“ aus: bei neuer Version keine Meldung auf dem Handy.
- [ ] „Update-Popup“ aus: beim Öffnen der App kein Popup, der Bereich Updates zeigt die neue Version trotzdem.
- [ ] „Was ist neu“ aus: nach dem nächsten Update kein Popup.
- [ ] Schalter bleiben nach Neustart des Handys erhalten.

## 1.20

- [ ] Darstellung → „Groß“ und „Sehr groß“: alle Texte, Knöpfe und Hinweise (Restzeit, „Genug für heute!“) werden größer, nichts wird abgeschnitten.
- [ ] Darstellung bleibt nach App-Neustart erhalten.
- [ ] Hell- und Dunkelmodus: Knöpfe, „AN“/„AUS“ und alle Texte gut lesbar.
- [ ] −/+ und ✕ lassen sich leicht treffen; TalkBack liest z. B. „Tageslimit Instagram: 5 Minuten mehr“ vor.
- [ ] Eingeklappte Bereiche öffnen sich beim Antippen der ganzen Kopfzeile.

## 1.19

- [ ] Shorts öffnen: Restzeit erscheint sofort.
- [ ] Shorts schließen und gleich wieder öffnen, mehrmals: Restzeit erscheint jedes Mal.
- [ ] Reels öffnen: Restzeit erscheint, normale Instagram-Ansichten zeigen nichts.
- [ ] Limit erreicht: „Genug für heute! ✋“ erscheint, die App verlässt Shorts/Reels.
- [ ] Update von 1.18: Popup „Was ist neu“ zeigt 1.19.
