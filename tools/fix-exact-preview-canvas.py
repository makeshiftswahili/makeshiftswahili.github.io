from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(rel, old, new):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected text not found in {rel}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Canvas pixels are not copied by cloneNode(). Convert dynamically rendered
# preview canvases to data-URL images before the shared preview helper clones
# them. This preserves the exact raster legend in the live preview.
patch(
    "communities-crime/political-economy/app.js",
    'canvas.style.width=`${canvas.width}px`;canvas.style.height=`${canvas.height}px`;return canvas}',
    'const img=document.createElement("img");img.src=canvas.toDataURL("image/png");img.alt="Export legend preview";img.style.cssText=`display:block;width:${canvas.width}px;height:${canvas.height}px;max-width:none;max-height:none`;return img}',
)

patch(
    "communities-crime/segregation/app.js",
    'canvas.style.width=`${canvas.width}px`;canvas.style.height=`${canvas.height}px`;return canvas}',
    'const img=document.createElement("img");img.src=canvas.toDataURL("image/png");img.alt="Export legend preview";img.style.cssText=`display:block;width:${canvas.width}px;height:${canvas.height}px;max-width:none;max-height:none`;return img}',
)

patch(
    "communities-crime/crime-analysis/app.js",
    'canvas.style.width=`${canvas.width*factor}px`;canvas.style.height=`${canvas.height*factor}px`;return canvas}',
    'const img=document.createElement("img");img.src=canvas.toDataURL("image/png");img.alt="Export legend preview";img.style.cssText=`display:block;width:${canvas.width*factor}px;height:${canvas.height*factor}px;max-width:none;max-height:none`;return img}',
)

patch(
    "communities-crime/opportunity/document.js",
    '''    canvas.style.width = `${canvas.width * factor}px`;\n    canvas.style.height = `${canvas.height * factor}px`;\n    return canvas;''',
    '''    const img = document.createElement("img");\n    img.src = canvas.toDataURL("image/png");\n    img.alt = "Export legend preview";\n    img.style.cssText = `display:block;width:${canvas.width * factor}px;height:${canvas.height * factor}px;max-width:none;max-height:none`;\n    return img;''',
)

patch(
    "communities-crime/legend-preview.js",
    'toggle.title = "Show or hide an approximate preview of the legend position in the Word figure.";',
    'toggle.title = "Show or hide a preview matching the legend footprint in the Word figure.";',
)

print("Converted exact legend preview canvases to clone-safe images.")
