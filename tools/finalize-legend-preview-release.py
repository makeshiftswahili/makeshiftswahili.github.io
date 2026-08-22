from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "communities-crime"
OLD = "Use <strong>Legend preview</strong> to show approximately where the legend will sit in the Word figure."
NEW = "Use <strong>Legend preview</strong> to show the legend at the same size and position it will occupy in the Word figure."

changed = 0
for path in ROOT.rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    if OLD in text:
        path.write_text(text.replace(OLD, NEW), encoding="utf-8")
        changed += 1

print(f"Updated legend-preview help text in {changed} HTML file(s).")
