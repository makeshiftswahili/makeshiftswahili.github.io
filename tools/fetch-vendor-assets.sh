#!/usr/bin/env bash
set -euo pipefail

# Pinned browser-runtime dependencies for the Communities & Crime site.
# Run from the repository root.

mkdir -p \
  vendor/leaflet/images \
  vendor/esri-leaflet \
  vendor/turf \
  vendor/maplibre \
  vendor/jspdf

fetch() {
  local url="$1"
  local out="$2"
  echo "Fetching $url -> $out"
  curl --fail --location --retry 3 --retry-delay 1 --silent --show-error "$url" --output "$out"
}

# Leaflet 1.9.4. Keep leaflet.css beside images/ so Leaflet's relative image
# URLs and default marker-icon discovery continue to work without patching CSS.
fetch "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" "vendor/leaflet/leaflet.js"
fetch "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" "vendor/leaflet/leaflet.css"
fetch "https://unpkg.com/leaflet@1.9.4/dist/images/layers.png" "vendor/leaflet/images/layers.png"
fetch "https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png" "vendor/leaflet/images/layers-2x.png"
fetch "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" "vendor/leaflet/images/marker-icon.png"
fetch "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png" "vendor/leaflet/images/marker-icon-2x.png"
fetch "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png" "vendor/leaflet/images/marker-shadow.png"

# Esri Leaflet 3.0.19 production bundle.
fetch "https://unpkg.com/esri-leaflet@3.0.19/dist/esri-leaflet.js" "vendor/esri-leaflet/esri-leaflet.js"

# Turf 7.2.0 browser bundle.
fetch "https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js" "vendor/turf/turf.min.js"

# These two additional runtime CDNs were found in the same course site during
# the audit, so they are vendored as well rather than leaving another timed-
# exercise dependency on a public CDN.
fetch "https://unpkg.com/maplibre-gl@5.7.1/dist/maplibre-gl.js" "vendor/maplibre/maplibre-gl.js"
fetch "https://unpkg.com/maplibre-gl@5.7.1/dist/maplibre-gl.css" "vendor/maplibre/maplibre-gl.css"
fetch "https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js" "vendor/jspdf/jspdf.umd.min.js"

# License copies are useful in a vendored tree. Do not make the runtime update
# fail solely because a package changes the location of its license file.
fetch_optional() {
  local url="$1"
  local out="$2"
  if ! curl --fail --location --retry 2 --silent --show-error "$url" --output "$out"; then
    rm -f "$out"
    echo "Warning: could not fetch optional license: $url" >&2
  fi
}

fetch_optional "https://unpkg.com/leaflet@1.9.4/LICENSE" "vendor/leaflet/LICENSE"
fetch_optional "https://unpkg.com/esri-leaflet@3.0.19/LICENSE" "vendor/esri-leaflet/LICENSE"
fetch_optional "https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/LICENSE" "vendor/turf/LICENSE"
fetch_optional "https://unpkg.com/maplibre-gl@5.7.1/LICENSE.txt" "vendor/maplibre/LICENSE.txt"
fetch_optional "https://unpkg.com/jspdf@2.5.2/LICENSE" "vendor/jspdf/LICENSE"

cat > vendor/README.md <<'EOF'
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
EOF

# Record hashes so future accidental changes to vendored files are obvious.
find vendor -type f ! -name SHA256SUMS.txt -print0 \
  | sort -z \
  | xargs -0 sha256sum > vendor/SHA256SUMS.txt

echo "Vendored runtime assets are ready."
