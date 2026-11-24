#!/usr/bin/env python3
"""Builds the site: index.html (the page) plus assets/app-<build>.js (all the app code).

The code lives in its own file so phones can keep a ready-to-run copy of it between visits (code written
inside the page is read again from scratch every time). Each build gets a new file name, so a page can
never be paired with code from another version. The last few builds' files are kept for pages that are
still open or still cached somewhere.
"""
from pathlib import Path
import time
root = Path(__file__).parent
page = (root / "src/page.html").read_text()
config = (root / "firebase-config.js").read_text().replace("export const", "const")
rules = (root / "firestore.rules").read_text().strip()
assert "`" not in rules and "${" not in rules, "firestore.rules can't contain ` or ${"
app = (root / "src/money-engine.js").read_text() + "\n" + (root / "src/quiz.js").read_text() + "\n" + (root / "src/partners.js").read_text().replace("/*RULES*/", rules) + "\n" + (root / "src/clients.js").read_text() + "\n" + (root / "src/push.js").read_text() + "\n" + (root / "src/app.js").read_text()
build_id = time.strftime("%Y%m%d%H%M%S")
name = f"assets/app-{build_id}.js"
assets = root / "assets"; assets.mkdir(exist_ok=True)
(root / name).write_text(config + "\n" + f'const BUILD_ID = "{build_id}";\n' + app)
# keep the 4 newest builds' code, remove older ones
for old in sorted(assets.glob("app-*.js"))[:-4]: old.unlink()
page = page.replace("__BUILD_ID__", build_id)
tag = '<script type="module">\n/*APP*/\n</script>'
assert page.count(tag) == 1, "src/page.html must contain the app script placeholder once"
page = page.replace(tag, f'<script type="module" src="{name}"></script>')
# start downloading the code while the page is still being read
fb = '<link rel="modulepreload" href="https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js">'
assert page.count(fb) == 1
page = page.replace(fb, f'<link rel="modulepreload" href="{name}">\n' + fb)
(root / "index.html").write_text(page)
print("built index.html and " + name)
