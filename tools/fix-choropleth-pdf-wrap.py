from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_FIX = ROOT / "communities-crime/group-work/choropleth-interpretation/pdf-fix.js"
INDEX = ROOT / "communities-crime/group-work/choropleth-interpretation/index.html"

marker = "__ccChoroplethPdfWrapFix"
patch = r'''

// Keep the exercise-1 answer key comfortably inside the PDF page.
// The original export placed each map/description pairing on one long line;
// some PDF viewers/renderers clipped the longest descriptions at the right edge.
(() => {
  if (window.__ccChoroplethPdfWrapFix || typeof window.addWrappedText !== "function") return;
  window.__ccChoroplethPdfWrapFix = true;

  const originalAddWrappedText = window.addWrappedText;

  window.addWrappedText = function(doc, text, x, y, width, fontSize = 10, bold = false) {
    const value = String(text || "");
    const match = value.match(/^Map ([A-D])\s*→\s*Description (\d+):\s*(.*)$/);
    if (!match) return originalAddWrappedText(doc, text, x, y, width, fontSize, bold);

    const pageWidth = doc.internal.pageSize.getWidth();
    const safeWidth = Math.min(width, pageWidth - x - 18, 165);
    const label = `Map ${match[1]} - Description ${match[2]}:`;
    const description = match[3];
    const lineStep = fontSize * 0.42;

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);

    doc.setFont("helvetica", "normal");
    const descriptionX = x + 4;
    const lines = doc.splitTextToSize(description, safeWidth - 4);
    doc.text(lines, descriptionX, y + lineStep + 1);

    return y + (1 + lines.length) * lineStep + 4;
  };
})();
'''

text = PDF_FIX.read_text(encoding="utf-8")
if marker not in text:
    PDF_FIX.write_text(text.rstrip() + patch, encoding="utf-8")

html = INDEX.read_text(encoding="utf-8")
old = 'pdf-fix.js?v=20260822-2'
new = 'pdf-fix.js?v=20260825-1'
if old in html:
    html = html.replace(old, new, 1)
elif new not in html:
    raise RuntimeError("Could not find expected pdf-fix.js cache token")
INDEX.write_text(html, encoding="utf-8")

print("Patched choropleth exercise-1 PDF wrapping and bumped the helper cache token.")
