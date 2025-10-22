from __future__ import annotations

import concurrent.futures
import json
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


INPUT_FILE = Path("active_urls.txt")
OUTPUT_DIR = Path("results")
WITH_QUOTE_FILE = OUTPUT_DIR / "urls_with_request_quote.txt"
WITHOUT_QUOTE_FILE = OUTPUT_DIR / "urls_without_request_quote.txt"
FAILED_FILE = OUTPUT_DIR / "urls_failed.txt"
COOKIES_FILE = Path("cookies.json")

MAX_WORKERS = 24
REQUEST_TIMEOUT = 30  # seconds
RETRY_ATTEMPTS = 4
RETRY_BACKOFF_SECONDS = 5  # seconds
CONSOLE_UPDATE_INTERVAL = 10  # seconds between progress prints
FAILURE_MESSAGE_MAX_LEN = 500


def load_urls(source: Path) -> list[str]:
    if not source.exists():
        raise FileNotFoundError(f"Input file not found: {source}")

    with source.open("r", encoding="utf-8") as handle:
        urls = [line.strip() for line in handle if line.strip()]
    return urls


def load_existing_urls(source: Path) -> set[str]:
    if not source.exists():
        return set()
    with source.open("r", encoding="utf-8") as handle:
        return {line.strip() for line in handle if line.strip()}


def has_request_quote_button(html: str) -> bool:
    lowered = html.lower()
    return "request a quote" in lowered and "js-addtoquote-button" in lowered


SAFE_PATH_CHARS = "/:@&=+$,;~()*'!.-_%"
SAFE_QUERY_CHARS = "/:@&=+$,;~()*'!.-_%"
COOKIE_HEADER: str = ""


def normalize_url(url: str) -> str:
    """Percent-encode non-ASCII characters while preserving existing escapes."""
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(parts.path, safe=SAFE_PATH_CHARS)
    query = urllib.parse.quote(parts.query, safe=SAFE_QUERY_CHARS)
    fragment = urllib.parse.quote(parts.fragment, safe=SAFE_QUERY_CHARS)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, fragment))


def fetch_html(url: str, timeout: int = REQUEST_TIMEOUT) -> str:
    # Spoof a browser-like user agent to reduce blocking by target sites.
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            )
        },
    )
    if COOKIE_HEADER:
        request.add_header("Cookie", COOKIE_HEADER)

    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw_bytes = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
        return raw_bytes.decode(charset, errors="replace")


@dataclass
class ResultRecorder:
    with_quote_file: Path
    without_quote_file: Path
    failed_file: Path
    with_quote_seen: set[str]
    without_quote_seen: set[str]
    failed_seen: set[str]

    def __post_init__(self) -> None:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._with_handle = self.with_quote_file.open("a", encoding="utf-8")
        self._without_handle = self.without_quote_file.open("a", encoding="utf-8")
        self._failed_handle = self.failed_file.open("a", encoding="utf-8")

    def close(self) -> None:
        self._with_handle.close()
        self._without_handle.close()
        self._failed_handle.close()

    def record_with_quote(self, url: str) -> None:
        with self._lock:
            if url in self.with_quote_seen:
                return
            self._with_handle.write(f"{url}\n")
            self._with_handle.flush()
            self.with_quote_seen.add(url)

    def record_without_quote(self, url: str) -> None:
        with self._lock:
            if url in self.without_quote_seen:
                return
            self._without_handle.write(f"{url}\n")
            self._without_handle.flush()
            self.without_quote_seen.add(url)

    def record_failure(self, url: str, message: str) -> None:
        trimmed = (message[: FAILURE_MESSAGE_MAX_LEN]).replace("\n", " ").strip()
        line = f"{url}\t{trimmed}"
        with self._lock:
            if line in self.failed_seen:
                return
            self._failed_handle.write(f"{line}\n")
            self._failed_handle.flush()
            self.failed_seen.add(line)


def summarize_counts(counts: Counter, total_completed: int, total_pending: int) -> str:
    with_count = counts.get("with", 0)
    without_count = counts.get("without", 0)
    failed_count = counts.get("failed", 0)
    return (
        f"Processed {total_completed}/{total_pending} | "
        f"with button: {with_count} | "
        f"without button: {without_count} | "
        f"failed: {failed_count}"
    )

def load_cookie_header(path: Path) -> str:
    if not path.exists():
        return ""

    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raw = path.read_text(encoding="latin-1")

    raw = raw.strip()
    if not raw:
        return ""

    # Try JSON format (e.g. Selenium's driver.get_cookies()).
    if raw.startswith("["):
        try:
            data = json.loads(raw)
            parts = []
            for entry in data:
                name = entry.get("name")
                value = entry.get("value")
                if not name or value is None:
                    continue
                parts.append(f"{name}={value}")
            return "; ".join(parts)
        except json.JSONDecodeError:
            pass

    # Try Netscape cookie file or simple key=value lines.
    parts: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "\t" in line:
            fields = line.split("\t")
            if len(fields) >= 7:
                name = fields[5].strip()
                value = fields[6].strip()
                if name:
                    parts.append(f"{name}={value}")
            continue
        if "=" in line:
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip()
            if name:
                parts.append(f"{name}={value}")

    return "; ".join(parts)


def collect_cookies_with_browser(start_url: str = "https://www.crlaurence.ca/") -> None:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError as exc:
        print(
            "Selenium is not installed. Install it with 'pip install selenium' and rerun, "
            "or provide cookies manually."
        )
        print(f"Error details: {exc}")
        return

    options = Options()
    options.add_argument("--start-maximized")

    try:
        driver = webdriver.Chrome(options=options)
    except Exception as exc:
        print(
            "Unable to launch Chrome WebDriver. Ensure chromedriver is installed and in PATH, "
            "or set the appropriate webdriver manager."
        )
        print(f"Error details: {exc}")
        return

    try:
        print(f"Launching browser for manual login at {start_url} ...")
        driver.get(start_url)
        print(
            "Log in using the browser window. Once you are fully authenticated, "
            "return here and press Enter to continue."
        )
        input("Press Enter after logging in and the target pages are accessible...")

        cookies = driver.get_cookies()
        if not cookies:
            print("No cookies captured. The session may not be authenticated.")
        else:
            COOKIES_FILE.write_text(json.dumps(cookies, indent=2), encoding="utf-8")
            print(f"Captured {len(cookies)} cookies and saved to {COOKIES_FILE}.")
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def main() -> None:
    global COOKIE_HEADER

    COOKIE_HEADER = load_cookie_header(COOKIES_FILE)
    if COOKIE_HEADER:
        print(f"Loaded cookies from {COOKIES_FILE}. Authenticated requests enabled.")
    else:
        if COOKIES_FILE.exists():
            print(f"Cookies file {COOKIES_FILE} is empty or unrecognized.")
        else:
            print("No cookies file found.")

        print("Attempting to capture cookies via Selenium...")
        collect_cookies_with_browser()
        COOKIE_HEADER = load_cookie_header(COOKIES_FILE)
        if COOKIE_HEADER:
            print(f"Loaded cookies from {COOKIES_FILE} after Selenium login. Authenticated requests enabled.")
        else:
            print(
                "Unable to load cookies. Proceeding without cookies (unauthenticated session). "
                "Expect quote buttons to remain hidden."
            )

    all_urls = load_urls(INPUT_FILE)
    unique_urls: list[str] = []
    seen_urls: set[str] = set()
    for url in all_urls:
        if url not in seen_urls:
            seen_urls.add(url)
            unique_urls.append(url)

    with_quote_seen = load_existing_urls(WITH_QUOTE_FILE)
    without_quote_seen = load_existing_urls(WITHOUT_QUOTE_FILE)

    already_processed = with_quote_seen | without_quote_seen
    remaining = [url for url in unique_urls if url not in already_processed]

    print(
        f"Total URLs: {len(unique_urls)} | Already processed: {len(already_processed)} | "
        f"Remaining: {len(remaining)}"
    )

    if not remaining:
        print("Everything is up to date. Nothing new to process.")
        return

    recorder = ResultRecorder(
        with_quote_file=WITH_QUOTE_FILE,
        without_quote_file=WITHOUT_QUOTE_FILE,
        failed_file=FAILED_FILE,
        with_quote_seen=with_quote_seen,
        without_quote_seen=without_quote_seen,
        failed_seen=load_existing_urls(FAILED_FILE),
    )

    counts: Counter[str] = Counter()
    total_new = len(remaining)
    last_log_time = 0.0

    def worker(url: str) -> tuple[str, Optional[str]]:
        try:
            normalized_url = normalize_url(url)
        except Exception as exc:
            recorder.record_failure(url, f"URL normalization failed: {exc}")
            return "failed", f"URL normalization failed: {exc}"

        html: Optional[str] = None
        last_error: Optional[Exception] = None

        try:
            for attempt in range(1, RETRY_ATTEMPTS + 1):
                try:
                    html = fetch_html(normalized_url)
                    break
                except (
                    urllib.error.URLError,
                    urllib.error.HTTPError,
                    ValueError,
                    TimeoutError,
                    socket.timeout,
                    ssl.SSLError,
                ) as exc:
                    last_error = exc
                    if attempt == RETRY_ATTEMPTS:
                        raise
                    wait_time = RETRY_BACKOFF_SECONDS * attempt
                    time.sleep(wait_time)
        except Exception as exc:
            message = str(last_error or exc)
            recorder.record_failure(url, message)
            return "failed", message

        if html is None:
            recorder.record_failure(url, "Unknown error: empty response")
            return "failed", "Unknown error: empty response"

        if has_request_quote_button(html):
            recorder.record_with_quote(url)
            return "with", None

        recorder.record_without_quote(url)
        return "without", None

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_url = {executor.submit(worker, url): url for url in remaining}
            processed_count = 0

            for future in concurrent.futures.as_completed(future_to_url):
                status, _ = future.result()
                counts[status] += 1
                processed_count += 1

                now = time.monotonic()
                if now - last_log_time >= CONSOLE_UPDATE_INTERVAL or processed_count == total_new:
                    print(summarize_counts(counts, processed_count, total_new))
                    last_log_time = now
    finally:
        recorder.close()

    print("Done.")


if __name__ == "__main__":
    main()
