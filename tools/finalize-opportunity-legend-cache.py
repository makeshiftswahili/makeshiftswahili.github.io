from pathlib import Path

path = Path(__file__).resolve().parents[1] / "communities-crime" / "opportunity" / "document.js"
text = path.read_text(encoding="utf-8")
old = '../legend-preview.js?v=20260821-9'
new = '../legend-preview.js?v=20260821-11'
if old not in text:
    raise RuntimeError("Expected Opportunity legend-preview cache token not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Updated Opportunity dynamic legend-preview cache token.")
