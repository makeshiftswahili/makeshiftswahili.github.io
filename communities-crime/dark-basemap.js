(() => {
  const TILE_URL = "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png";
  const ATTRIBUTION_HTML = '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  const ATTRIBUTION_TEXT = "© Stadia Maps © OpenMapTiles © OpenStreetMap";
  const THEMATIC_OPACITY = 0.82;
  const RACE_PALETTE = {
    white: "#0072B2",
    latino: "#E69F00",
    black: "#009E73",
    asian: "#CC79A7",
    none: "#9E9E9E"
  };

  window.CC_BASEMAP = {
    tileUrl: TILE_URL,
    attributionHtml: ATTRIBUTION_HTML,
    attributionText: ATTRIBUTION_TEXT,
    thematicOpacity: THEMATIC_OPACITY
  };
  window.CC_RACE_PALETTE = { ...RACE_PALETTE };

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

  function installCrossPlatformZoom(map) {
    if (!map?.getCanvas || map.__ccCrossPlatformZoom) return;
    map.__ccCrossPlatformZoom = true;

    try { map.scrollZoom.disable(); } catch {}

    const canvas = map.getCanvas();
    const clampZoom = zoom => {
      const min = typeof map.getMinZoom === "function" ? map.getMinZoom() : 0;
      const max = typeof map.getMaxZoom === "function" ? map.getMaxZoom() : 22;
      return Math.max(min, Math.min(max, zoom));
    };

    canvas.addEventListener("wheel", event => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const raw = Number(event.deltaY) || 0;
      if (!raw) return;
      const amount = Math.max(0.045, Math.min(0.22, Math.abs(raw) * 0.004));
      map.jumpTo({ zoom: clampZoom(map.getZoom() + (raw < 0 ? amount : -amount)) });
    }, { passive: false, capture: true });

    let gestureStartZoom = null;
    canvas.addEventListener("gesturestart", event => {
      event.preventDefault();
      gestureStartZoom = map.getZoom();
    }, { passive: false });
    canvas.addEventListener("gesturechange", event => {
      if (gestureStartZoom === null) return;
      event.preventDefault();
      const scale = Number(event.scale) || 1;
      map.jumpTo({ zoom: clampZoom(gestureStartZoom + Math.log2(Math.max(scale, 0.01))) });
    }, { passive: false });
    canvas.addEventListener("gestureend", event => {
      event.preventDefault();
      gestureStartZoom = null;
    }, { passive: false });
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
        installCrossPlatformZoom(this);
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

  function installMapHelpText() {
    const help = '<strong>Map controls:</strong> Use the + and − buttons to zoom. For finer control, hold <strong>Ctrl</strong> (Windows/Linux) or <strong>⌘ Command</strong> (macOS) while scrolling. On a trackpad, you can also <strong>pinch to zoom</strong>. Drag the map to reposition it.';
    document.querySelectorAll(".map-instructions p").forEach(paragraph => {
      const text = paragraph.textContent || "";
      if (/Ctrl/i.test(text) && /zoom/i.test(text)) paragraph.innerHTML = help;
    });
  }

  function installSegregationPalette() {
    if (!/\/communities-crime\/segregation\//.test(window.location.pathname)) return;
    try {
      if (typeof raceColors !== "undefined") Object.assign(raceColors, RACE_PALETTE);
      if (typeof raceLabels !== "undefined") {
        Object.assign(raceLabels, {
          white: "White",
          latino: "Latino",
          black: "Black",
          asian: "Asian",
          none: "No population/data"
        });
      }
    } catch (error) {
      console.error("Could not apply the segregation accessibility palette", error);
    }
  }

  function installProjectPasswordCompatibility() {
    const passwordInput = document.getElementById("lsuId");
    if (!passwordInput || window.__ccProjectPasswordInstalled) return;
    window.__ccProjectPasswordInstalled = true;

    let rememberedPassword = "";
    const MASK = "********";
    const LSU_ID_BLANK = "____________________________";

    passwordInput.type = "password";
    passwordInput.inputMode = "text";
    passwordInput.autocomplete = "current-password";
    passwordInput.placeholder = "Project password";

    document.querySelectorAll("label").forEach(label => {
      if (label.htmlFor === "lsuId" || label.contains(passwordInput)) {
        const span = label.querySelector("span");
        if (span && /LSU ID/i.test(span.textContent || "")) span.textContent = "Project Password";
        else if (label.htmlFor === "lsuId" && /LSU ID/i.test(label.textContent || "")) label.textContent = "Project Password";
      }
    });

    const lookupMessage = document.getElementById("lookupMessage");
    const loadButton = document.getElementById("loadButton");
    const actualPassword = () => passwordInput.value === MASK && rememberedPassword
      ? rememberedPassword
      : passwordInput.value.trim();

    const validatePassword = event => {
      const value = actualPassword();
      if (value.length >= 8) return true;
      if (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (lookupMessage) lookupMessage.textContent = "Enter your project password (at least 8 characters).";
      passwordInput.focus();
      return false;
    };

    loadButton?.addEventListener("click", validatePassword, true);
    passwordInput.addEventListener("keydown", event => {
      if (event.key === "Enter") validatePassword(event);
    }, true);
    passwordInput.addEventListener("input", () => {
      if (passwordInput.value !== MASK) rememberedPassword = passwordInput.value.trim();
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url || "";
      let nextInit = init;
      let moduleLookup = false;

      if (typeof init?.body === "string" && /supabase\.co\/functions\/v1\//.test(url)) {
        try {
          const body = JSON.parse(init.body);

          if (url.includes("/neighborhood-selection") && body?.action === "moduleLookup") {
            const candidate = body.projectPassword || body.lsuId || actualPassword();
            if (candidate && candidate !== MASK) rememberedPassword = String(candidate).trim();
            body.projectPassword = rememberedPassword || actualPassword();
            delete body.lsuId;
            nextInit = { ...init, body: JSON.stringify(body) };
            moduleLookup = true;
          } else if (url.includes("assignment-doc") && Object.prototype.hasOwnProperty.call(body, "lsuId")) {
            body.lsuId = LSU_ID_BLANK;
            nextInit = { ...init, body: JSON.stringify(body) };
          }
        } catch {}
      }

      const response = await originalFetch(input, nextInit);
      if (moduleLookup && response.ok && rememberedPassword) {
        passwordInput.value = MASK;
        passwordInput.dataset.projectLoaded = "true";
      }
      return response;
    };
  }

  function installPageEnhancements() {
    installMapHelpText();
    installSegregationPalette();
    installProjectPasswordCompatibility();
  }

  patchMapLibre();
  patchLeaflet();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPageEnhancements, { once: true });
  } else {
    installPageEnhancements();
  }
})();
