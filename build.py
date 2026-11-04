#!/usr/bin/env python3
"""Builds index.html: puts the app code and Firebase settings inside the page, so the site loads as one file."""
from pathlib import Path
root = Path(__file__).parent
page = (root / "src/page.html").read_text()
config = (root / "firebase-config.js").read_text().replace("export const", "const")
app = (root / "src/app.js").read_text()
(root / "index.html").write_text(page.replace("/*APP*/", config + "\n" + app))
print("built index.html")
