(() => {
  const DOC_URL = "https://rqdkfvvubiccaybubmbd.supabase.co/functions/v1/crime-analysis-assignment-doc";
  const MAP_KEYS = ["rate-1", "rate-2", "incident-1", "incident-2"];

  // Preserve WebGL pixels so the exact map framing can be captured for the Word document.
  const OriginalMap = maplibregl.Map;
  maplibregl.Map = class CrimeAnalysisExportMap extends OriginalMap {
    constructor(options) {
      super({
        ...options,
        canvasContextAttributes: {
          ...(options?.canvasContextAttributes || {}),
          preserveDrawingBuffer: true
        }
      });
    }
  };

  function dataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not encode an image."));
      reader.readAsDataURL(blob);
    });
  }

  async function figure(blob, width = 525) {
    const bitmap = await createImageBitmap(blob);
    const height = Math.round(width * bitmap.height / bitmap.width);
    bitmap.close();
    return { data: await dataUrl(blob), width, height };
  }

  async function logoData() {
    const response = await fetch("../4091logo_bw.png", { cache: "force-cache" });
    if (!response.ok) throw new Error("Could not load the course logo.");
    return dataUrl(await response.blob());
  }

  function safe(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "crime_analysis";
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function buildDocument() {
    const api = window.CC_CRIME_ANALYSIS;
    const button = document.getElementById("buildDocument");
    const status = document.getElementById("documentStatus");
    const id = document.getElementById("lsuId")?.value.trim() || "";
    if (!api || !button || !status || !api.isReady() || !api.getProject() || !api.getIncidentType()) return;

    button.dataset.building = "true";
    button.disabled = true;

    try {
      const captured = [];
      for (let i = 0; i < MAP_KEYS.length; i++) {
        status.textContent = `Capturing Figure ${i + 1} of 4…`;
        captured.push(await api.captureMap(MAP_KEYS[i], MAP_KEYS[i].startsWith("rate-")));
      }

      const figures = [];
      for (const blob of captured) figures.push(await figure(blob));
      status.textContent = "Building your Word assignment…";

      const response = await fetch(DOC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lsuId: id,
          project: api.getProject(),
          incidentType: api.getIncidentType(),
          logo: await logoData(),
          figures: {
            rateOne: figures[0],
            rateTwo: figures[1],
            incidentOne: figures[2],
            incidentTwo: figures[3]
          }
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not build the Word assignment.");
      }

      download(await response.blob(), `${safe(id)}_crime_analysis.docx`);
      status.textContent = "Word assignment downloaded. Delete all red/bracketed prompts before submitting.";
    } catch (error) {
      console.error(error);
      status.textContent = error instanceof Error ? error.message : "Could not build the Word assignment.";
    } finally {
      button.dataset.building = "false";
      api.updateDocumentState();
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buildDocument")?.addEventListener("click", buildDocument);
  });
})();
