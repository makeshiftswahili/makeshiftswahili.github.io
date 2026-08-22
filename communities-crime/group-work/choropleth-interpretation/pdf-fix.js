// PDF export helper: inline the SVG styles that otherwise live in the page stylesheet.
svgToPng = function(svg) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", "background:#ececec");
    clone.querySelectorAll("polygon").forEach(poly => {
      poly.setAttribute("stroke", "#ffffff");
      poly.setAttribute("stroke-width", "1.5");
    });
    const outer = clone.querySelector("rect.outer");
    if (outer) {
      outer.setAttribute("fill", "none");
      outer.setAttribute("stroke", "#111111");
      outer.setAttribute("stroke-width", "2.4");
    }
    clone.querySelectorAll("text").forEach(text => {
      text.setAttribute("fill", "#333333");
      text.setAttribute("font-size", "9");
      text.setAttribute("font-family", "Arial, sans-serif");
    });

    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const viewBox = (clone.getAttribute("viewBox") || "0 0 560 400").split(/\s+/).map(Number);
      const ratio = viewBox[3] / viewBox[2];
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = Math.round(1200 * ratio);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render a map for the PDF."));
    };
    img.src = url;
  });
};

// Group identity uses full names rather than LSU IDs.
(() => {
  if (window.__ccGroupNamesMode) return;
  window.__ccGroupNamesMode = true;

  const replaceCopy = value => String(value || "")
    .replace(/Group LSU IDs/g, "Group members")
    .replace(/LSU IDs/g, "full names")
    .replace(/LSU ID/g, "full name")
    .replace(/group member IDs/gi, "group members")
    .replace(/Edit IDs/g, "Edit names")
    .replace(/IDs updated/g, "Names updated")
    .replace(/Saving full names/g, "Saving names");

  function patchNode(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const next = replaceCopy(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    const element = root.nodeType === Node.ELEMENT_NODE ? root : null;
    if (element?.matches?.("input")) {
      if (/LSU ID/i.test(element.placeholder || "")) element.placeholder = "Full name";
      element.inputMode = "text";
      element.maxLength = 120;
      element.autocomplete = "off";
    }

    root.querySelectorAll?.("input").forEach(input => {
      if (/LSU ID/i.test(input.placeholder || "")) input.placeholder = "Full name";
      input.inputMode = "text";
      input.maxLength = 120;
      input.autocomplete = "off";
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const next = replaceCopy(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  patchNode(document.body);
  new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(patchNode));
    mutations.forEach(mutation => {
      if (mutation.type === "characterData") patchNode(mutation.target);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    let nextInit = init;
    if (url.includes("/functions/v1/choropleth-group") && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body);
        if (body.action === "start" || body.action === "updateMembers") {
          const selector = body.action === "updateMembers" ? "#memberEditFields input" : "#idFields input";
          const names = [...document.querySelectorAll(selector)].map(input => input.value.trim().replace(/\s+/g, " ")).filter(Boolean);
          if (names.length) body.lsuIds = names;
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch {}
    }
    return originalFetch(input, nextInit);
  };

  const JsPdf = window.jspdf?.jsPDF;
  if (JsPdf?.prototype && !JsPdf.prototype.__ccGroupNamesPatched) {
    const originalText = JsPdf.prototype.text;
    JsPdf.prototype.text = function(text, ...args) {
      const patch = value => typeof value === "string"
        ? value.replace(/^LSU IDs:/, "Group members:").replace(/LSU IDs/g, "Group members")
        : value;
      const next = Array.isArray(text) ? text.map(patch) : patch(text);
      return originalText.call(this, next, ...args);
    };
    JsPdf.prototype.__ccGroupNamesPatched = true;
  }
})();
