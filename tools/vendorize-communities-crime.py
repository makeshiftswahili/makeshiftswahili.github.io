#!/usr/bin/env python3
"""Replace Communities & Crime runtime-library CDN URLs with local vendor URLs.

Adobe Fonts/Typekit is intentionally not touched. External map-tile services are
also outside the scope of this helper.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path("communities-crime")

REPLACEMENTS = {
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css": "/vendor/leaflet/leaflet.css?v=1.9.4",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js": "/vendor/leaflet/leaflet.js?v=1.9.4",
    "https://unpkg.com/esri-leaflet@3.0.19/dist/esri-leaflet.js": "/vendor/esri-leaflet/esri-leaflet.js?v=3.0.19",
    "https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js": "/vendor/turf/turf.min.js?v=7.2.0",
    "https://unpkg.com/maplibre-gl@5.7.1/dist/maplibre-gl.css": "/vendor/maplibre/maplibre-gl.css?v=5.7.1",
    "https://unpkg.com/maplibre-gl@5.7.1/dist/maplibre-gl.js": "/vendor/maplibre/maplibre-gl.js?v=5.7.1",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js": "/vendor/jspdf/jspdf.umd.min.js?v=2.5.2",
}

FORBIDDEN_RUNTIME_CDNS = (
    "unpkg.com",
    "cdn.jsdelivr.net",
    "cdnjs.cloudflare.com",
)


def main() -> int:
    if not ROOT.exists():
        raise SystemExit(f"Missing {ROOT}")

    changed: list[Path] = []
    counts = {source: 0 for source in REPLACEMENTS}

    for html in sorted(ROOT.rglob("*.html")):
        original = html.read_text(encoding="utf-8")
        updated = original
        for source, local in REPLACEMENTS.items():
            n = updated.count(source)
            if n:
                counts[source] += n
                updated = updated.replace(source, local)
        if updated != original:
            html.write_text(updated, encoding="utf-8")
            changed.append(html)

    leftovers: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".html", ".js", ".css"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for host in FORBIDDEN_RUNTIME_CDNS:
            if host in text:
                leftovers.append(f"{path}: still contains {host}")

    print(f"Vendorized runtime references in {len(changed)} HTML file(s).")
    for source, count in counts.items():
        if count:
            print(f"  {count:>2} × {source}")

    if leftovers:
        print("Unexpected runtime CDN references remain:")
        for item in leftovers:
            print(f"  {item}")
        return 1

    print("No unpkg, jsDelivr, or cdnjs runtime references remain under communities-crime/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
