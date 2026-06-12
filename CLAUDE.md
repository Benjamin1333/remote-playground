# CLAUDE.md

Anleitung für Claude Code (und andere Mitwirkende) für dieses Repository.

## Projekt

**MTG Collections** – ein Tracker für Magic-the-Gathering-Sammlungen
(Schwerpunkt: TMNT-Sets). Nutzer fügen Kartenlisten ein (Arena/Moxfield-Format,
Set-Listen, einfache Namenslisten), die App löst sie über die Scryfall-API auf
und zeigt sie mit Preisen, Filtern, Favoriten, Collection-Vergleich und
Live-Teilen an. UI-Sprache ist Deutsch, Code-Kommentare ebenfalls.

## Aufbau

| Pfad | Zweck |
|---|---|
| `index.html` | Die komplette App: CSS, Komponenten-Templates und Logik in einer Datei |
| `scripts/build_prices.py` | Erzeugt `prices.json` aus dem Cardmarket Price Guide (für TMT) |
| `.github/workflows/deploy-pages.yml` | Deployt täglich auf GitHub Pages und baut dabei `prices.json` frisch |

Es gibt **keinen Build-Step, kein npm, kein Framework** – das ist eine bewusste
Entscheidung, keine Nachlässigkeit (siehe Technologie-Entscheidungen).

## Architektur

- **Native Custom Elements, Light DOM.** Jede UI-Sektion ist eine Komponente
  (`<mtg-collection-bar>`, `<mtg-filter-controls>`, `<mtg-card>` …). Die
  Layout-Komponenten rendern reines Markup über `defineTemplate()` und behalten
  ihre IDs/Klassen, damit CSS und Controller unverändert greifen. Kein Shadow
  DOM – das globale Stylesheet soll gelten.
- **`<mtg-card>`** ist die einzige Komponente mit Verhalten: eigenes Rendering,
  Favoriten-Toggle, `refreshPrice()`, `setFiltered()`, `setOrder()`,
  `updateQtyBadge()`. Der Controller steuert Sichtbarkeit/Reihenfolge über
  CSS (`order`, `.filtered-out`), damit `<img>`-Elemente nie neu erzeugt werden.
- **Controller-IIFE** am Ende von `index.html`: Zustand, Scryfall-Aufrufe,
  Collection-Verwaltung, Filter. Komponenten werden vor dem Controller
  registriert (synchrones Upgrade), daher findet `getElementById` alles.

### Datenmodell

- Collections in `localStorage` (`mtg-collections-v1`):
  `entries: [{ id, qty, foil? }]` – **jede Print-Variante ist ein eigener
  Eintrag** (Foil getrennt von Normal, wie bei Moxfield/Archidekt).
- Anzeige-Schlüssel `uid = scryfallId + (foil ? ":f" : "")` – gilt für
  `cardEls`, Favoriten und Live-Share. Nicht-Foil nutzt die nackte ID, damit
  alte Favoriten gültig bleiben.
- Karten-Cache `mtg-card-cache-v3` mit getrennten Preisen `priceEur`/`priceFoil`;
  `finalizePrice()` bestimmt je Exemplar den wirksamen Preis (Foil-Exemplare →
  Foil-Preis, Fallback auf die jeweils andere Variante).
- Zähllogik: Anzeigen (Dropdown, Statusleiste) zählen **physische Karten**
  (Summe `qty`), nicht verschiedene Drucke.
- Der Toggle „Prints bündeln“ (`mtg-group-v1`) gruppiert Kacheln gleichen
  Kartennamens **rein visuell** (Sammel-Badge `7× · 2 Prints`); Daten und
  Wertberechnung bleiben je Print getrennt.

### Externe Dienste

- **Scryfall** (`/cards/collection`, Fuzzy-Suche) – Karten-Auflösung; Batches à
  75, Foil/Normal desselben Drucks teilen sich einen Identifier.
- **Cardmarket-Preise** über `prices.json` (vom Workflow erzeugt, `low`/`lowFoil`/`trend`).
- **kvdb.io** – Live-Teilen von Collections (Bucket-Keys nur lokal gespeichert).

## CSS-Konventionen

- **Design-Tokens in `:root`**: Farben (`--bg`, `--panel`, `--accent`, `--gold`,
  `--border` …) sowie `--radius` (8px, Standard für Bedienelemente) und
  `--btn-pad`. Neue Controls nutzen diese Tokens, keine hartkodierten Werte.
- **Eine Button-Basisklasse `.btn`** mit Modifikatoren:
  - `.btn.primary` – Hauptaktion (grüner Rand)
  - `.btn.active` – gewählter Zustand (Akzentfarbe, z. B. Ansicht-Buttons)
  - `.btn.gold.active` – gewählter Zustand in Gold (Favoriten-Filter)
  - JS toggelt nur die Klasse `active`; die Farbvariante kommt von der
    statischen Klasse (`gold`).
  - Neue Buttons bekommen `.btn` – keine neuen Button-Klassen mit kopierten
    Eigenschaften anlegen.

## Technologie-Entscheidungen

- **Kein Framework (React/Vue/…):** Die App ist klein genug, dass manuelles
  Rendering beherrschbar ist; Custom Elements liefern die Komponentenstruktur
  ohne Build-Step. Eine Framework-Migration wurde erwogen und verworfen.
- **Kein Tailwind (Stand 2026-06):** Ohne Compiler bliebe nur das Play CDN –
  von Tailwind selbst nicht für Produktion empfohlen (Laufzeit-Generierung,
  FOUC, CDN-Abhängigkeit bei jedem Aufruf). Die Probleme, die Tailwind löst,
  sind hier bereits anders gelöst: Design-Tokens in `:root`, semantische
  komponentenbezogene Klassen, `.btn`-Basisklasse gegen Stil-Drift. Utility-
  Ketten in den `defineTemplate`-Strings würden die Templates unleserlicher
  machen. **Neu bewerten, falls je ein Build-Step eingeführt wird.**
- **Kein Shadow DOM:** globales Stylesheet + Light DOM ist hier einfacher und
  performanter; Kapselung ist über Klassen-Namespaces ausreichend.

## Entwickeln & Testen

- Lokal ausliefern: `http-server -p 8123` (o. ä.) im Repo-Root; `prices.json`
  fehlt lokal → App fällt auf Scryfall-Preise zurück (gewollt).
- Syntax-Check des Inline-Scripts: Script-Block extrahieren und `node --check`.
- E2E-Smoke-Test: Playwright/Chromium headless gegen den lokalen Server, dabei
  `https://api.scryfall.com/cards/collection` mit Fixture-Karten mocken
  (deterministisch, unabhängig von der Netzwerk-Policy). Kritische Pfade:
  Collection anlegen (inkl. `*F*`-Foil-Zeile), Filter/Suche/Sortierung,
  Favoriten, „Prints bündeln“, Persistenz nach Reload, keine Konsolen-Fehler.
- Beim Ändern von Zähl-/Preislogik immer mit einer Liste testen, die Foil-
  Duplikate enthält (`1 Name (SET) 123 *F*` + Normal-Zeile desselben Drucks).

## Konventionen

- Alles bleibt in `index.html`; UI-Texte und Kommentare auf Deutsch.
- IDs der Bedienelemente nicht umbenennen (Controller + Tests hängen daran).
- `localStorage`-Schemata nur mit Versions-Bump ändern (`…-v3` → `…-v4`) und
  alte Keys aufräumen; Collections-Format möglichst abwärtskompatibel halten
  (alte Einträge ohne `foil` gelten als Normal).
