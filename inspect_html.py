import json
import urllib.request
from pathlib import Path

URL = "https://www.crlaurence.ca/All-Products/Door-%26-Window-Hardware/Signs%2C-Decals%2C-%26-Indicators/CRL-Stegbar-Style-Glass-Safety-Decal/p/010331"
OUT = Path("sample_page.html")

req = urllib.request.Request(
    URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
)

with urllib.request.urlopen(req, timeout=30) as resp:
    html = resp.read().decode(resp.headers.get_content_charset() or "utf-8", "replace")

OUT.write_text(html, encoding="utf-8")
print(f"Wrote {OUT} ({len(html)} chars)")
