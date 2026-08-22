# Vendored browser runtime libraries

These files are pinned local copies used by the Communities & Crime course site so timed classroom activities do not depend on public JavaScript/CSS CDNs.

| Library | Version | Local path |
|---|---:|---|
| Leaflet | 1.9.4 | `vendor/leaflet/` |
| Esri Leaflet | 3.0.19 | `vendor/esri-leaflet/` |
| Turf | 7.2.0 | `vendor/turf/` |
| MapLibre GL JS | 5.7.1 | `vendor/maplibre/` |
| jsPDF | 2.5.2 | `vendor/jspdf/` |

Leaflet's `images/` directory intentionally remains adjacent to `leaflet.css`. Moving or flattening those files can break the CSS layer-control images and Leaflet's default marker icon path detection.

To refresh the pinned copies, edit the versions/URLs in `tools/fetch-vendor-assets.sh`, run the script from the repository root, then update the matching local URLs in `tools/vendorize-communities-crime.py` if versions change.
