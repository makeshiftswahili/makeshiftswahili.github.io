(() => {
  const TILE_URL = "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png";
  const ATTRIBUTION_HTML = '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  const ATTRIBUTION_TEXT = "© Stadia Maps © OpenMapTiles © OpenStreetMap";
  const THEMATIC_OPACITY = 0.82;

  window.CC_BASEMAP = {
    tileUrl: TILE_URL,
    attributionHtml: ATTRIBUTION_HTML,
    attributionText: ATTRIBUTION_TEXT,
    thematicOpacity: THEMATIC_OPACITY
  };

  function cloneStyle(style) {
    if (!style || typeof style !== "object" || Array.isArray(style)) return style;
    try {
      return typeof structuredClone === "function"
        ? structuredClone(style)
        : JSON.parse(JSON.stringify(style));
    } catch {
      return style;
    }
  }

  function patchMapLibre() {
    if (!window.maplibregl?.Map || window.maplibregl.__ccBasemapPatched) return;

    const OriginalMap = window.maplibregl.Map;

    function patchStyle(style) {
      const next = cloneStyle(style);
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        return { style: next, blankStyle: false };
      }

      next.sources = next.sources || {};
      next.layers = Array.isArray(next.layers) ? next.layers : [];

      if (next.sources.osm?.type === "raster") {
        next.sources.osm = {
          ...next.sources.osm,
          tiles: [TILE_URL],
          tileSize: 256,
          attribution: ATTRIBUTION_HTML
        };
        return { style: next, blankStyle: false };
      }

      const hasMappedSources = Object.keys(next.sources).length > 0;
      const hasOnlyBackground = next.layers.length === 0 || next.layers.every(layer => layer?.type === "background");
      const blankStyle = !hasMappedSources && hasOnlyBackground;

      if (blankStyle) {
        next.sources["cc-base"] = {
          type: "raster",
          tiles: [TILE_URL],
          tileSize: 256,
          attribution: ATTRIBUTION_HTML
        };

        const backgroundIndex = next.layers.findIndex(layer => layer?.type === "background");
        if (backgroundIndex >= 0) {
          next.layers[backgroundIndex] = {
            ...next.layers[backgroundIndex],
            paint: {
              ...(next.layers[backgroundIndex].paint || {}),
              "background-color": "#f4f4f2"
            }
          };
        } else {
          next.layers.unshift({
            id: "cc-background",
            type: "background",
            paint: { "background-color": "#f4f4f2" }
          });
        }

        const insertAt = Math.max(next.layers.findIndex(layer => layer?.type === "background") + 1, 0);
        next.layers.splice(insertAt, 0, {
          id: "cc-base",
          type: "raster",
          source: "cc-base"
        });
      }

      return { style: next, blankStyle };
    }

    class CourseBasemapMap extends OriginalMap {
      constructor(options = {}) {
        const patched = patchStyle(options.style);
        const nextOptions = { ...options, style: patched.style };
        if (patched.blankStyle && options.attributionControl === false) {
          nextOptions.attributionControl = true;
        }
        super(nextOptions);
      }

      addLayer(layer, beforeId) {
        let nextLayer = layer;
        if (
          layer?.type === "fill" &&
          (layer.id === "tract-fill" || layer.id === "thematic-fill") &&
          layer.paint?.["fill-opacity"] === 1
        ) {
          nextLayer = {
            ...layer,
            paint: { ...layer.paint, "fill-opacity": THEMATIC_OPACITY }
          };
        }
        return super.addLayer(nextLayer, beforeId);
      }

      setPaintProperty(layerId, name, value, options) {
        const nextValue = (
          name === "fill-opacity" &&
          value === 1 &&
          (layerId === "tract-fill" || layerId === "thematic-fill")
        ) ? THEMATIC_OPACITY : value;
        return super.setPaintProperty(layerId, name, nextValue, options);
      }
    }

    window.maplibregl.Map = CourseBasemapMap;
    window.maplibregl.__ccBasemapPatched = true;
  }

  function patchLeaflet() {
    if (!window.L?.tileLayer || window.L.__ccBasemapPatched) return;

    const originalTileLayer = window.L.tileLayer;
    const patchedTileLayer = function(url, options = {}) {
      if (typeof url === "string" && url.includes("tile.openstreetmap.org")) {
        return originalTileLayer.call(window.L, TILE_URL, {
          ...options,
          maxZoom: 20,
          attribution: ATTRIBUTION_HTML
        });
      }
      return originalTileLayer.call(window.L, url, options);
    };

    Object.keys(originalTileLayer).forEach(key => {
      try { patchedTileLayer[key] = originalTileLayer[key]; } catch {}
    });

    window.L.tileLayer = patchedTileLayer;
    window.L.__ccBasemapPatched = true;
  }

  patchMapLibre();
  patchLeaflet();
})();
