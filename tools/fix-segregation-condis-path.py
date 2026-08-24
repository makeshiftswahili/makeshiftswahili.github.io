from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app = ROOT / "communities-crime" / "segregation" / "app.js"
index = ROOT / "communities-crime" / "segregation" / "index.html"

text = app.read_text(encoding="utf-8")
old = 'fetch("../../SEG_condis.geojson",{cache:"force-cache"})'
new = 'fetch(`${DATA_BASE}SEG_condis.geojson`,{cache:"force-cache"})'
if old not in text:
    raise RuntimeError("Expected concentrated-disadvantage fetch path not found")
app.write_text(text.replace(old, new, 1), encoding="utf-8")

html = index.read_text(encoding="utf-8")
import re
html, n = re.subn(r'(src="app\.js\?v=)[^"]+(" )?', lambda m: m.group(1) + '20260824-segfix1' + (m.group(2) or ''), html, count=1)
if n != 1:
    # Handle the normal tag without a trailing space before >.
    html, n = re.subn(r'(src="app\.js\?v=)[^"]+(")', r'\g<1>20260824-segfix1\2', html, count=1)
if n != 1:
    raise RuntimeError("Could not bump segregation app cache token")
index.write_text(html, encoding="utf-8")

print("Repointed segregation disadvantage data to communities-crime/data and bumped app cache token.")
