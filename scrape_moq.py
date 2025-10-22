"""
Scrape minimum order quantities from CRL product pages listed in a CSV file.

The script normalizes CRL Canada URLs to CRL USA (.com) URLs, fetches the HTML,
and looks for text such as "Minimum Order Quantity : 1". Results are written to
a CSV file so the script can resume from where it left off if interrupted.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import os
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional
import re


DEFAULT_INPUT = Path("active_urls.csv")
DEFAULT_OUTPUT = Path("minimum_order_quantities.csv")
REQUEST_TIMEOUT = 30  # seconds
# Be polite to the remote server.
REQUEST_DELAY = 0.75  # seconds between requests


@dataclass
class ScrapeResult:
    url: str
    minimum_order_quantity: Optional[str]
    status: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch CRL product pages and record the Minimum Order Quantity "
            "for each URL."
        )
    )
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="CSV file containing URLs to scrape (default: active_urls.csv).",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="CSV file where results will be stored "
        "(default: minimum_order_quantities.csv).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=REQUEST_DELAY,
        help="Delay between requests in seconds (default: 0.75).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit the number of URLs processed (default: no limit).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=os.cpu_count() or 1,
        help=(
            "Number of concurrent workers to use (default: system logical CPU count)."
        ),
    )
    return parser.parse_args()


def load_urls(input_path: Path) -> Iterable[str]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    with input_path.open("r", encoding="utf-8", newline="") as infile:
        # Treat the file as CSV but handle single-column text gracefully.
        reader = csv.reader(infile)
        for row in reader:
            if not row:
                continue
            url = row[0].strip()
            if url:
                yield url


def ensure_ascii_url(url: str) -> str:
    """Percent-encode path/query components so the URL is ASCII safe."""
    parsed = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(parsed.path), safe="/%:@")
    query = urllib.parse.quote(urllib.parse.unquote(parsed.query), safe="=&;%:@,")
    fragment = urllib.parse.quote(urllib.parse.unquote(parsed.fragment), safe="")
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, path, query, fragment)
    )


def normalize_to_com(url: str) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    netloc = parsed.netloc.lower()
    if netloc.endswith(".ca"):
        netloc = netloc[:-3] + ".com"
    else:
        netloc = netloc.replace(".ca", ".com")

    # Preserve original casing except for the updated TLD.
    rebuilt = parsed._replace(netloc=netloc)
    normalized = urllib.parse.urlunparse(rebuilt)
    return ensure_ascii_url(normalized)


def replace_com_with_ca(url: str) -> str:
    parsed = urllib.parse.urlsplit(url.strip())
    netloc = parsed.netloc
    if not netloc:
        return url

    lower_netloc = netloc.lower()
    if lower_netloc.endswith(".com"):
        netloc = netloc[: -len(".com")] + ".ca"
    elif ".com" in lower_netloc:
        # Fallback to a simple replacement if .com appears elsewhere in the netloc.
        netloc = re.sub(r"\.com", ".ca", netloc, count=1, flags=re.IGNORECASE)
    else:
        return url

    rebuilt = parsed._replace(netloc=netloc)
    return ensure_ascii_url(urllib.parse.urlunsplit(rebuilt))


def fetch_html(url: str, timeout: int = REQUEST_TIMEOUT) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="ignore")


MOQ_REGEXES = [
    re.compile(r"Minimum\s+Order\s+Quantity\s*[:\-]\s*([0-9.,]+)", re.IGNORECASE),
    re.compile(r"Minimum\s+Order\s+Qty\s*[:\-]\s*([0-9.,]+)", re.IGNORECASE),
]


def extract_moq(html: str) -> Optional[str]:
    for pattern in MOQ_REGEXES:
        match = pattern.search(html)
        if match:
            return match.group(1).strip()
    return None


def load_existing_results(output_path: Path) -> Dict[str, ScrapeResult]:
    if not output_path.exists():
        return {}

    processed: Dict[str, ScrapeResult] = {}
    with output_path.open("r", encoding="utf-8", newline="") as outfile:
        reader = csv.DictReader(outfile)
        for row in reader:
            url = row.get("url", "").strip()
            if not url:
                continue
            processed_url = normalize_to_com(url)
            processed[processed_url] = ScrapeResult(
                url=url,
                minimum_order_quantity=row.get("minimum_order_quantity") or None,
                status=row.get("status", ""),
            )
    return processed


def scrape_urls(
    urls: Iterable[str],
    output_path: Path,
    delay: float,
    workers: int,
) -> None:
    processed = load_existing_results(output_path)

    urls_to_process: List[str] = []
    for raw_url in urls:
        normalized_url = normalize_to_com(raw_url)
        existing = processed.get(normalized_url)
        if existing and existing.status.lower().startswith("error"):
            print(
                f"[retry] Previous error for {normalized_url}: {existing.status}"
            )
        elif existing:
            print(f"[skip] Already processed: {normalized_url}")
            continue
        urls_to_process.append(normalized_url)

    if not urls_to_process:
        print("No new URLs to process.")
        return

    needs_header = not output_path.exists() or output_path.stat().st_size == 0

    # Open in append mode so we do not overwrite previous progress.
    with output_path.open("a", encoding="utf-8", newline="") as outfile:
        fieldnames = ["url", "minimum_order_quantity", "status"]
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)

        if needs_header:
            writer.writeheader()

        print(
            f"Processing {len(urls_to_process)} URL(s) with {workers} worker(s)."
        )

        def scrape_single(url: str) -> ScrapeResult:
            try:
                html = fetch_html(url)
                moq = extract_moq(html)
                status = "ok" if moq else "moq-not-found"
                result_url = url
            except Exception as exc:  # pylint: disable=broad-except
                fallback_url = replace_com_with_ca(url)
                if fallback_url != url:
                    try:
                        html = fetch_html(fallback_url)
                        moq = extract_moq(html)
                        if moq:
                            status = "ok (retried with .ca)"
                        else:
                            status = "moq-not-found (retried with .ca)"
                        result_url = fallback_url
                    except Exception as fallback_exc:  # pylint: disable=broad-except
                        moq = None
                        status = (
                            f"error: {exc}; fallback with .ca failed: {fallback_exc}"
                        )
                        result_url = url
                else:
                    moq = None
                    status = f"error: {exc}"
                    result_url = url
            if delay > 0:
                time.sleep(delay)
            return ScrapeResult(
                url=result_url, minimum_order_quantity=moq, status=status
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_url = {}
            for url in urls_to_process:
                print(f"[fetch] {url}")
                future = executor.submit(scrape_single, url)
                future_to_url[future] = url

            try:
                for future in concurrent.futures.as_completed(future_to_url):
                    url = future_to_url[future]
                    try:
                        result = future.result()
                    except Exception as exc:  # pylint: disable=broad-except
                        result = ScrapeResult(
                            url=url,
                            minimum_order_quantity=None,
                            status=f"error: {exc}",
                        )
                    writer.writerow(
                        {
                            "url": result.url,
                            "minimum_order_quantity": result.minimum_order_quantity
                            or "",
                            "status": result.status,
                        }
                    )
                    outfile.flush()
                    processed[normalize_to_com(result.url)] = result
                    print(f"[done] {result.url} -> {result.status}")
            except KeyboardInterrupt:
                print(
                    "\nInterrupted by user. Cancelling outstanding requests..."
                )
                for future in future_to_url:
                    future.cancel()
                executor.shutdown(cancel_futures=True)
                print("Progress saved to output file.")
                raise


def main() -> int:
    args = parse_args()

    input_path = args.input
    if not input_path.exists() and input_path.suffix.lower() == ".csv":
        fallback = input_path.with_suffix(".txt")
        if fallback.exists():
            print(f"Input file {input_path} not found. Using {fallback} instead.")
            input_path = fallback

    try:
        urls = list(load_urls(input_path))
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Failed to load URLs: {exc}", file=sys.stderr)
        return 1

    if args.limit is not None:
        if args.limit < 0:
            print("Limit must be non-negative.", file=sys.stderr)
            return 1
        if args.limit < len(urls):
            print(f"Limiting to first {args.limit} of {len(urls)} URLs.")
        urls = urls[: args.limit]

    if args.workers < 1:
        print("Workers must be at least 1.", file=sys.stderr)
        return 1

    if not urls:
        print("No URLs found in the input file.")
        return 0

    print(f"Loaded {len(urls)} URLs from {input_path}")
    print(f"Writing results to {args.output}")
    print(f"Using {args.workers} worker(s) and {args.sleep}s delay per worker.")
    try:
        scrape_urls(urls, args.output, args.sleep, args.workers)
    except KeyboardInterrupt:
        return 1
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
