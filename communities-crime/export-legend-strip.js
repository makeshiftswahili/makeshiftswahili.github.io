(() => {
  function pixelRatioFor(canvas) {
    const cssWidth = canvas?.getBoundingClientRect?.().width || canvas?.clientWidth || 0;
    if (cssWidth > 0 && canvas?.width) return Math.max(1, canvas.width / cssWidth);
    return Math.max(1, window.devicePixelRatio || 1);
  }

  function drawSymbol(ctx, item, x, y, scale) {
    const type = item.type || "swatch";
    const color = item.color || "#777";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (type === "line") {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5 * scale, (item.width || 3) * scale);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 24 * scale, y);
      ctx.stroke();
    } else if (type === "zigzag") {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.4 * scale, 1.6 * scale);
      ctx.beginPath();
      const w = 26 * scale;
      const amp = 3 * scale;
      const step = 4 * scale;
      ctx.moveTo(x, y);
      for (let dx = step; dx <= w; dx += step) {
        ctx.lineTo(x + dx, y + (Math.round(dx / step) % 2 ? -amp : amp));
      }
      ctx.stroke();
    } else if (type === "dot") {
      ctx.beginPath();
      ctx.arc(x + 6 * scale, y, 5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = item.stroke || "#333";
      ctx.lineWidth = 1.2 * scale;
      ctx.stroke();
    } else {
      const sw = 14 * scale;
      const sh = 11 * scale;
      const sy = y - sh / 2;
      ctx.fillStyle = item.hatch ? "#fff" : color;
      ctx.fillRect(x, sy, sw, sh);
      if (item.hatch) {
        ctx.beginPath();
        ctx.rect(x, sy, sw, sh);
        ctx.clip();
        ctx.strokeStyle = item.hatchColor || "#111";
        ctx.lineWidth = 1.1 * scale;
        for (let off = -sh; off < sw + sh; off += 5 * scale) {
          ctx.beginPath();
          ctx.moveTo(x + off, sy + sh);
          ctx.lineTo(x + off + sh, sy);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = item.stroke || "#777";
      ctx.lineWidth = 0.8 * scale;
      ctx.strokeRect(x + 0.4 * scale, sy + 0.4 * scale, sw - 0.8 * scale, sh - 0.8 * scale);
    }
    ctx.restore();
  }

  function itemSymbolWidth(item, scale) {
    if (item.type === "line" || item.type === "zigzag") return 28 * scale;
    if (item.type === "dot") return 15 * scale;
    return 18 * scale;
  }

  function drawRow(ctx, row, y, width, scale, pad) {
    const label = row.label || "";
    let x = pad;
    ctx.textBaseline = "middle";

    if (label) {
      ctx.fillStyle = "#666";
      ctx.font = `600 ${9.5 * scale}px Arial, Helvetica, sans-serif`;
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 13 * scale;
    }

    const items = row.items || [];
    if (!items.length) return;

    const fontSize = row.fontSize || 9.5;
    ctx.font = `${fontSize * scale}px Arial, Helvetica, sans-serif`;
    const natural = items.map(item => itemSymbolWidth(item, scale) + 5 * scale + ctx.measureText(item.label || "").width + 13 * scale);
    const available = Math.max(1, width - pad - x);
    const total = natural.reduce((a, b) => a + b, 0);
    const compress = Math.min(1, available / Math.max(total, 1));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const slot = natural[i] * compress;
      const symbolW = itemSymbolWidth(item, scale);
      drawSymbol(ctx, item, x, y, scale);
      ctx.fillStyle = "#2d2d2d";
      ctx.font = `${Math.max(8, fontSize * compress) * scale}px Arial, Helvetica, sans-serif`;
      ctx.fillText(item.label || "", x + symbolW, y);
      x += slot;
    }
  }

  function compose(sourceCanvas, config = {}) {
    if (!sourceCanvas) throw new Error("Missing source map canvas.");
    const scale = Math.max(1, Number(config.pixelRatio) || pixelRatioFor(sourceCanvas));
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const hasNote = Boolean(config.note);
    const pad = 14 * scale;
    const top = 9 * scale;
    const titleH = 18 * scale;
    const rowH = 23 * scale;
    const noteH = hasNote ? 16 * scale : 0;
    const bottom = 8 * scale;
    const headerH = Math.ceil(top + titleH + rows.length * rowH + noteH + bottom);

    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height + headerH;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = config.background || "#f7f7f4";
    ctx.fillRect(0, 0, canvas.width, headerH);
    ctx.strokeStyle = "#c9c9c6";
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.moveTo(0, headerH - 0.5 * scale);
    ctx.lineTo(canvas.width, headerH - 0.5 * scale);
    ctx.stroke();

    ctx.fillStyle = "#1e1e1e";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${11.5 * scale}px Arial, Helvetica, sans-serif`;
    ctx.fillText(config.title || "", pad, top + 12 * scale);

    let y = top + titleH + 9 * scale;
    for (const row of rows) {
      drawRow(ctx, row, y, canvas.width, scale, pad);
      y += rowH;
    }

    if (hasNote) {
      ctx.fillStyle = "#666";
      ctx.font = `${8.5 * scale}px Arial, Helvetica, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(config.note, pad, headerH - bottom - 4 * scale);
    }

    ctx.drawImage(sourceCanvas, 0, headerH);
    return canvas;
  }

  window.CC_EXPORT_LEGEND = { compose };
})();
