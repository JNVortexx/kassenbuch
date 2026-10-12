# Kassenbuch

Monatliches Haushaltsbuch als Progressive Web App — läuft im Browser, lässt sich
auf den Homescreen legen und funktioniert offline.

- **Monatsansicht** mit Übertrag aus dem Vormonat, Einnahmen, Ausgaben und Bestand
- **Eigene Kategorien** anlegen und entfernen (benutzte werden archiviert, damit alte
  Buchungen ihren Namen behalten)
- **Jahresverlauf** als Balken je Monat, mit Haken für abgeschlossene Monate
- **Sichern / Einlesen** als JSON-Datei
- **Erinnerung**: Hinweis in der App, sobald der Vormonat ab dem 5. noch offen ist,
  plus `erinnerung.ics` — eine monatliche Kalender-Serie für jeden 5. um 9 Uhr

## Daten

Alles liegt im `localStorage` des jeweiligen Geräts — kein Server, kein Konto.
Zwei Geräte führen damit zwei getrennte Bücher; zum Umziehen die Sicherung
exportieren und auf dem anderen Gerät einlesen.

## Lokal starten

```bash
python3 -m http.server 8787
```

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html` | Grundgerüst und die beiden Sheets |
| `app.css` | Erscheinungsbild, hell und dunkel |
| `app.js` | Daten, Rechnen, Bedienung |
| `sw.js` | Offline-Hülle (cached nur die App, nie die Daten) |
| `manifest.webmanifest` | Name, Icon, Standalone-Start |
| `erinnerung.ics` | Kalender-Serie für den Monatsabschluss |
