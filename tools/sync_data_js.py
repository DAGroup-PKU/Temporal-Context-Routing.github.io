#!/usr/bin/env python3
"""Write assets/data.js from assets/data.json so the page works via file://."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "assets" / "data.json"
dst = root / "assets" / "data.js"
text = src.read_text(encoding="utf-8")
dst.write_text("window.TCR_DATA = " + text.rstrip() + ";\n", encoding="utf-8")
print(f"wrote {dst.relative_to(root)}")
