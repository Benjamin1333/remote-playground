#!/usr/bin/env python3
"""Erzeugt prices.json mit Cardmarket-Preisen für das TMNT-Set (TMT).

Quelle ist der offizielle, täglich aktualisierte Cardmarket Price Guide
(https://www.cardmarket.com/en/Magic/Data/Price-Guide). Die Zuordnung
Karte -> Cardmarket-Produkt kommt über die cardmarket_id von Scryfall.
"""
import datetime
import json
import sys
import urllib.request

SET_CODE = "tmt"
SCRYFALL_URL = (
    "https://api.scryfall.com/cards/search"
    "?order=set&unique=prints&include_extras=true&include_variations=true"
    f"&q=e%3A{SET_CODE}"
)
PRICE_GUIDE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json"
HEADERS = {"User-Agent": "tmnt-card-overview/1.0", "Accept": "application/json"}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "prices.json"

    cardmarket_ids = set()
    url = SCRYFALL_URL
    while url:
        page = get_json(url)
        for card in page["data"]:
            if card.get("cardmarket_id"):
                cardmarket_ids.add(card["cardmarket_id"])
        url = page.get("next_page") if page.get("has_more") else None

    guide = get_json(PRICE_GUIDE_URL)
    prices = {}
    for product in guide["priceGuides"]:
        if product["idProduct"] in cardmarket_ids:
            prices[str(product["idProduct"])] = {
                "low": product.get("low"),
                "trend": product.get("trend"),
                "lowFoil": product.get("low-foil"),
                "trendFoil": product.get("trend-foil"),
                "avg30": product.get("avg30"),
            }

    result = {
        "updatedAt": guide.get("createdAt")
        or datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "set": SET_CODE,
        "prices": prices,
    }
    with open(out_path, "w") as f:
        json.dump(result, f, separators=(",", ":"))
    print(
        f"{len(prices)} von {len(cardmarket_ids)} Produkten nach {out_path} "
        f"geschrieben (Price-Guide-Stand: {result['updatedAt']})"
    )
    if len(prices) < len(cardmarket_ids):
        missing = len(cardmarket_ids) - len(prices)
        print(f"Warnung: {missing} Produkte nicht im Price Guide gefunden", file=sys.stderr)


if __name__ == "__main__":
    main()
