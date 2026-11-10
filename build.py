#!/usr/bin/env python3
"""Builds index.html: puts the app code and Firebase settings inside the page, so the site loads as one file."""
from pathlib import Path
root = Path(__file__).parent
page = (root / "src/page.html").read_text()
config = (root / "firebase-config.js").read_text().replace("export const", "const")
app = (root / "src/money-engine.js").read_text() + "\n" + (root / "src/partners.js").read_text() + "\n" + (root / "src/clients.js").read_text() + "\n" + (root / "src/app.js").read_text()
import time
build_id = time.strftime("%Y%m%d%H%M%S")
page = page.replace("__BUILD_ID__", build_id)
(root / "index.html").write_text(page.replace("/*APP*/", config + "\n" + f'const BUILD_ID = "{build_id}";\n' + app))
print("built index.html")
