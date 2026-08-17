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
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 792;
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
