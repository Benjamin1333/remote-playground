// @ts-check
const { test, expect } = require("@playwright/test");

/* End-to-End-Smoke-Test für MTG Collections.
 *
 * Läuft pro Browser-Projekt (Chromium + WebKit) einmal durch. Scryfall und
 * die Kartenbilder werden gemockt, damit der Test deterministisch und
 * unabhängig von der Netzwerk-Policy ist. Der Ablauf ist bewusst sequenziell:
 * der Reload-Schritt prüft Persistenz aus den vorherigen Schritten.
 *
 * Für nicht-kritische Prüfungen nutzen wir `expect.soft`, damit ein einzelner
 * Fehler nicht den Rest abbricht – wie beim früheren „alle Checks zählen“-Skript. */

function scryCard(id, name, set, num, colors, rarity, eur, eurFoil) {
  return {
    id, name, set, collector_number: String(num), colors, rarity,
    type_line: "Instant", oracle_text: "Test oracle text for " + name,
    image_uris: { small: "https://img.test/" + id + "-s.jpg", normal: "https://img.test/" + id + ".jpg" },
    scryfall_uri: "https://scryfall.com/card/" + set + "/" + num,
    cardmarket_id: 1000 + num,
    purchase_uris: { cardmarket: "https://cardmarket.com/x" },
    prices: { eur: eur, eur_foil: eurFoil },
  };
}
const BOLT = scryCard("id-bolt", "Lightning Bolt", "lea", 161, ["R"], "common", "2.50", null);
const CSPELL = scryCard("id-cspell", "Counterspell", "lea", 54, ["U"], "common", "8.00", "12.00");

// 1x1-GIF als Platzhalter für jedes angeforderte Kartenbild
const PIXEL_GIF = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

test.beforeEach(async ({ page }) => {
  await page.route("https://api.scryfall.com/cards/collection", route =>
    route.fulfill({ json: { data: [BOLT, CSPELL], not_found: [] } }));
  await page.route("https://img.test/**", route =>
    route.fulfill({ contentType: "image/gif", body: PIXEL_GIF }));
});

test("Smoke: Komponenten, Foil-Prints, Filter, Sheets, Detail, Persistenz", async ({ page }) => {
  // Konsolen-/Seitenfehler sammeln (404 für prices.json ist erwartet → gefiltert)
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("/");

  // 1) Komponenten wurden aufgerüstet und haben gerendert
  for (const tag of ["mtg-app-header", "mtg-collection-bar", "mtg-filter-controls",
                     "mtg-status-bar", "mtg-collection-modal", "mtg-compare-modal",
                     "mtg-filter-bar", "mtg-filter-sheet", "mtg-detail-panel",
                     "mtg-detail-sheet", "mtg-to-top"]) {
    const rendered = await page.$eval(tag, el => el.children.length > 0);
    expect.soft(rendered, "Komponente " + tag + " gerendert").toBeTruthy();
  }
  expect.soft(await page.isVisible("#empty-note"), "Empty-State sichtbar").toBeTruthy();
  expect.soft(await page.textContent("#empty-note"), "Empty-State verweist auf „+ Neu“").toContain("+ Neu");
  expect.soft(await page.$("#empty-cta"), "kein eigener CTA-Button mehr").toBeNull();
  expect.soft(await page.isVisible("#controls"), "Desktop: Filter-Sidebar sichtbar").toBeTruthy();
  expect.soft(await page.isHidden(".filter-bar"), "Desktop: Bottom-Filter-Leiste versteckt").toBeTruthy();
  expect.soft(await page.isHidden("#add-fab"), "Desktop: FAB versteckt").toBeTruthy();

  // 2) Collection mit Foil-Zeile anlegen: Foil wird eigener Eintrag
  await page.click("#col-new");
  await page.fill("#col-name", "Testsammlung");
  await page.fill("#col-list", "1 Lightning Bolt\n2 Counterspell\n1 Counterspell *F*");
  await page.click("#col-create");
  await page.waitForSelector("mtg-card", { timeout: 5000 });
  expect.soft(await page.isHidden("#modal-overlay"), "Modal schließt nach Erstellen").toBeTruthy();
  expect.soft(await page.locator("#grid > mtg-card").count(), "3 Kacheln (Foil separat)").toBe(3);

  const foilTile = page.locator("mtg-card", { hasText: "Counterspell" }).filter({ hasText: "Foil" });
  expect.soft(await foilTile.count(), "Foil-Kachel hat Foil-Tag").toBe(1);
  const foilPrice = await foilTile.locator(".price-line").textContent();
  expect.soft(foilPrice, "Foil-Kachel zeigt 12,00 € (Foil)").toMatch(/12,00\s*€\s*\(Foil\)/);

  const badges = page.locator(".qty-badge");
  expect.soft(await badges.count(), "Genau ein Mengen-Badge").toBe(1);
  expect.soft(await badges.first().textContent(), "Badge 2× auf Nicht-Foil-Counterspell").toBe("2×");
  expect.soft(await page.textContent("#status"), "Statusleiste: 4 Karten, Wert 30,50")
    .toMatch(/4 von 4 Karten · Wert: 30,50/);

  // 3) Detail-on-Demand (Desktop): Klick auf Kachel öffnet Master-Detail-Panel
  await page.locator("mtg-card", { hasText: "Lightning Bolt" }).locator(".img-link").click();
  expect.soft(await page.isVisible("#detail-panel"), "Detail-Panel öffnet bei Klick").toBeTruthy();
  const detailText = await page.textContent("#card-detail");
  expect.soft(detailText, "Detail zeigt Typzeile").toContain("Instant");
  expect.soft(detailText, "Detail zeigt Oracle-Text").toContain("Test oracle text for Lightning Bolt");
  expect.soft(await page.$eval("#card-detail .detail-links a", a => a.href), "Detail zeigt Scryfall-Link")
    .toContain("scryfall");
  await page.click("#detail-close");
  expect.soft(await page.isHidden("#detail-panel"), "Detail-Panel schließt über ✕").toBeTruthy();

  // 4) Favorit & Filter (Foil-Kachel hat eigenen Favoriten-Status)
  const boltFav = page.locator("mtg-card", { hasText: "Lightning Bolt" }).locator(".fav-btn");
  await boltFav.click();
  expect.soft(await boltFav.textContent(), "Favoriten-Stern aktiv").toBe("★");
  expect.soft(await page.isHidden("#detail-panel"), "Favoriten-Klick öffnet KEIN Detail").toBeTruthy();
  await page.click("#fav-filter");
  const cspellHidden = await page.locator("mtg-card", { hasText: "Counterspell" })
    .evaluateAll(els => els.every(el => el.classList.contains("filtered-out")));
  expect.soft(cspellHidden, "Favoriten-Filter blendet Counterspell-Prints aus").toBeTruthy();
  await page.click("#fav-filter");

  await page.fill("#search", "counter");
  await page.waitForTimeout(400); // Debounce der Suche
  expect.soft(await page.textContent("#status"), "Suche: 3 von 4 Karten").toMatch(/3 von 4 Karten/);
  await page.click("#reset");

  await page.click('.color-btn[data-color="U"]');
  expect.soft(await page.textContent("#status"), "Farbfilter U: 3 von 4 Karten").toMatch(/3 von 4 Karten/);
  await page.click("#reset");

  // 5) Sortierung: Foil (12 €) vor Nicht-Foil (8 €) vor Bolt (2,50 €)
  await page.selectOption("#sort", "price-desc");
  const orders = await page.$$eval("#grid > mtg-card", els =>
    els.map(el => [el.querySelector(".meta").textContent.includes("Foil") ? "foil"
      : el.querySelector(".name").textContent, Number(el.style.order)]));
  const byOrder = Object.fromEntries(orders);
  expect.soft(byOrder["foil"] < byOrder["Counterspell"], "Foil vor Counterspell").toBeTruthy();
  expect.soft(byOrder["Counterspell"] < byOrder["Lightning Bolt"], "Counterspell vor Bolt").toBeTruthy();
  await page.click("#reset");

  // 6) Prints bündeln: 2 sichtbare Kacheln, Sammel-Badge, Stückzahl bleibt
  await page.click("#group-toggle");
  expect.soft(await page.$eval("#group-toggle", el => el.classList.contains("active")), "Toggle aktiv").toBeTruthy();
  expect.soft(await page.locator("#grid > mtg-card:not(.filtered-out)").count(), "Gebündelt: 2 Kacheln").toBe(2);
  expect.soft(await badges.count(), "Ein Sammel-Badge").toBe(1);
  expect.soft(await badges.first().textContent(), "Sammel-Badge 3× · 2 Prints").toBe("3× · 2 Prints");
  expect.soft(await page.textContent("#status"), "Weiterhin 4 von 4 Karten").toMatch(/4 von 4 Karten/);

  // 7) Galerie + Reload: alles persistiert (Toggle bleibt an)
  await page.click("#view-gallery");
  await page.reload();
  await page.waitForSelector("mtg-card", { timeout: 5000 });
  expect.soft(await page.locator("#collection-select option:checked").textContent(), "Reload: Dropdown (4 Karten)")
    .toBe("Testsammlung (4 Karten)");
  expect.soft(await page.locator("#grid > mtg-card").count(), "Reload: 3 Kacheln aus Cache").toBe(3);
  expect.soft(await page.$eval("#grid", el => el.classList.contains("gallery")), "Reload: Galerie gemerkt").toBeTruthy();
  expect.soft(await page.$eval("#group-toggle", el => el.classList.contains("active")), "Reload: Bündeln gemerkt").toBeTruthy();
  expect.soft(await page.locator("#grid > mtg-card:not(.filtered-out)").count(), "Reload: 2 sichtbare Kacheln").toBe(2);
  expect.soft(await page.locator("mtg-card", { hasText: "Lightning Bolt" }).locator(".fav-btn").textContent(),
    "Reload: Favorit gemerkt").toBe("★");

  // 8) Toggle aus: wieder 3 Kacheln, Badge zurück auf 2×
  await page.click("#group-toggle");
  expect.soft(await page.locator("#grid > mtg-card:not(.filtered-out)").count(), "Entbündelt: 3 Kacheln").toBe(3);
  expect.soft(await page.locator(".qty-badge").count(), "Ein Badge").toBe(1);
  expect.soft(await page.locator(".qty-badge").first().textContent(), "Badge wieder 2×").toBe("2×");

  // 9) Mobil (375×812): Bottom-Bar → Sheet → Apply → Chips
  await page.setViewportSize({ width: 375, height: 812 });
  expect.soft(await page.isVisible(".filter-bar"), "Mobil: Bottom-Filter-Leiste sichtbar").toBeTruthy();
  expect.soft(await page.isHidden("#controls"), "Mobil: Sidebar versteckt").toBeTruthy();
  await page.click("#filter-toggle");
  expect.soft(await page.$eval("#filter-sheet", d => d.open), "Sheet öffnet als <dialog>").toBeTruthy();
  expect.soft(await page.$("#filter-sheet-body .filter-groups"), "Filter-Gruppen ins Sheet gewandert").not.toBeNull();

  // 9a) Regression: das Sheet darf in keiner Engine zur Schmal-Zeile kollabieren
  // (Safari-Bug: flex-basis 0% ließ den Body auf ~0 schrumpfen). toBeInViewport
  // wartet die Slide-up-Animation ab.
  await expect.soft(page.locator("#filter-sheet-apply"), "Apply-Footer sichtbar").toBeInViewport();
  await expect.soft(page.locator("#filter-sheet-body #search"), "Suchfeld im Sheet sichtbar").toBeVisible();
  const bodyHeight = await page.$eval("#filter-sheet-body", el => el.getBoundingClientRect().height);
  expect.soft(bodyHeight, "Sheet-Body nicht kollabiert (>200px)").toBeGreaterThan(200);

  await page.click('.color-btn[data-color="U"]');
  expect.soft((await page.textContent("#filter-sheet-apply")).trim(), "Apply zeigt Live-Zähler").toBe("Zeige 3 Karten");
  await page.click("#filter-sheet-apply");
  expect.soft(await page.$eval("#filter-sheet", d => !d.open), "Sheet schließt nach Apply").toBeTruthy();
  const chip = page.locator(".chip", { hasText: "Blau" });
  expect.soft(await chip.count(), "Aktiver Filter als Chip").toBe(1);
  expect.soft(await page.textContent("#status"), "Mobil-Status: 3 von 4").toMatch(/3 von 4 Karten/);
  expect.soft(await page.textContent("#filter-toggle-count"), "Leisten-Zähler 3 / 4").toContain("3 / 4");
  await chip.click();
  expect.soft(await page.textContent("#status"), "Chip entfernt Filter (4 von 4)").toMatch(/4 von 4 Karten/);
  expect.soft(await page.isHidden("mtg-filter-chips"), "Chips-Zeile versteckt ohne Filter").toBeTruthy();
  expect.soft(await page.$eval('.color-btn[data-color="U"]', el => !el.classList.contains("active")),
    "Farb-Button nicht mehr aktiv").toBeTruthy();

  // 9b) Mobiles Detail-Sheet: Tap auf Kachel
  await page.locator("mtg-card", { hasText: "Lightning Bolt" }).locator(".img-link").click();
  expect.soft(await page.$eval("#detail-sheet", d => d.open), "Mobil: Detail-Sheet öffnet").toBeTruthy();
  expect.soft(await page.textContent("#detail-sheet-title"), "Mobil: Sheet-Titel = Kartenname").toBe("Lightning Bolt");
  expect.soft(await page.textContent("#detail-sheet-body"), "Mobil: Oracle-Text im Sheet")
    .toContain("Test oracle text for Lightning Bolt");
  await page.click("#detail-sheet-close");
  expect.soft(await page.$eval("#detail-sheet", d => !d.open), "Mobil: Detail-Sheet schließt").toBeTruthy();

  // 9c) FAB (mobil): + öffnet „Karten hinzufügen“
  expect.soft(await page.isVisible("#add-fab"), "Mobil: FAB sichtbar").toBeTruthy();
  await page.click("#add-fab");
  expect.soft(await page.isVisible("#modal-overlay"), "FAB öffnet Modal").toBeTruthy();
  expect.soft(await page.textContent("#modal-title"), "Modal = Karten hinzufügen").toContain("Karten hinzufügen");
  await page.click("#col-cancel");
  await page.keyboard.press("Escape"); // darf nichts kaputt machen

  // Zurück auf Desktop: Filter-Gruppen wandern in die Sidebar
  await page.setViewportSize({ width: 1280, height: 720 });
  const movedBack = await page.waitForFunction(
    () => !!document.querySelector("#controls .filter-groups"), null, { timeout: 3000 }
  ).then(() => true).catch(() => false);
  expect.soft(movedBack, "Desktop: Gruppen wieder in der Sidebar").toBeTruthy();

  // 10) Mehr-Menü + Escape
  await page.click("#col-more");
  expect.soft(await page.isVisible("#more-menu"), "Mehr-Menü öffnet").toBeTruthy();
  await page.keyboard.press("Escape");
  expect.soft(await page.isHidden("#more-menu"), "Escape schließt Mehr-Menü").toBeTruthy();

  // 11) Keine echten JS-Fehler (fehlende prices.json/Ressourcen erwartet)
  const realErrors = errors.filter(e => !e.includes("prices.json") && !e.includes("Failed to load resource"));
  expect.soft(realErrors, "Keine JS-Fehler auf der Seite").toEqual([]);
});
