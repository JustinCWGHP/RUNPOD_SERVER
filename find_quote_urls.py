from __future__ import annotations

import itertools
from pathlib import Path

import urllib.request
import urllib.parse


def fetch(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    safe_path = "/:@&=+$,;~()*'!.-_%"
    safe_query = "/:@&=+$,;~()*'!.-_%"
    normalized = urllib.parse.urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            urllib.parse.quote(parts.path, safe=safe_path),
            urllib.parse.quote(parts.query, safe=safe_query),
            urllib.parse.quote(parts.fragment, safe=safe_query),
        )
    )

    request = urllib.request.Request(
        normalized,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        },
    )
    with urllib.request.urlopen(request, timeout=30) as resp:
        data = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        return data.decode(charset, errors="replace")


def main() -> None:
    urls = [line.strip() for line in Path("active_urls.txt").read_text(encoding="utf-8").splitlines() if line.strip()]
    limit = 2000
    for index, url in enumerate(itertools.islice(urls, limit), start=1):
        try:
            html = fetch(url)
        except Exception as exc:
            print(f"error at #{index} {url}: {exc}")
            continue

        lowered = html.lower()
        if (
            "request a quote" in lowered
            or "request&nbsp;a&nbsp;quote" in lowered
            or "request&#160;a&#160;quote" in lowered
            or "js-addtoquote-button" in lowered
        ):
            print("found", url)
            break
        if index % 50 == 0:
            print(f"processed {index} without match")
    else:
        print(f"None found in first {limit}")


if __name__ == "__main__":
    main()
