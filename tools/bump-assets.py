#!/usr/bin/env python3
"""Apply one cache-busting release token to first-party JS/CSS references.

By default this updates HTML under communities-crime/. Vendor assets are left
alone because their URLs are versioned with the library version itself.

Examples:
    python tools/bump-assets.py 20260825-1
    python tools/bump-assets.py 20260825-2 --roots communities-crime spatial-analysis
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

TOKEN_RE = re.compile(r"^\d{8}-\d+$")
ATTR_RE = re.compile(
    r"(?P<prefix>\b(?:src|href)\s*=\s*['\"])(?P<url>[^'\"]+?\.(?:js|css)(?:\?[^'\"]*)?)(?P<suffix>['\"])",
    re.IGNORECASE,
)


def is_first_party(url: str) -> bool:
    lower = url.lower()
    if lower.startswith(("http://", "https://", "//", "data:", "mailto:", "#")):
        return False
    path = url.split("?", 1)[0].split("#", 1)[0]
    normalized = path.replace("\\", "/")
    if normalized.startswith("/vendor/") or "/vendor/" in normalized:
        return False
    return True


def bump_html(path: Path, token: str) -> bool:
    original = path.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        url = match.group("url")
        if not is_first_party(url):
            return match.group(0)
        base = url.split("?", 1)[0].split("#", 1)[0]
        return f"{match.group('prefix')}{base}?v={token}{match.group('suffix')}"

    updated = ATTR_RE.sub(replace, original)
    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("token", help="Release token such as 20260825-1")
    parser.add_argument(
        "--roots",
        nargs="+",
        default=["communities-crime"],
        help="Directories to scan recursively (default: communities-crime)",
    )
    args = parser.parse_args()

    if not TOKEN_RE.fullmatch(args.token):
        parser.error("token must use YYYYMMDD-N format, e.g. 20260825-1")

    changed: list[Path] = []
    for root_name in args.roots:
        root = Path(root_name)
        if not root.exists():
            print(f"Skipping missing root: {root}")
            continue
        for html in sorted(root.rglob("*.html")):
            if bump_html(html, args.token):
                changed.append(html)

    print(f"Updated {len(changed)} HTML file(s) to asset release {args.token}.")
    for path in changed:
        print(f"  {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
