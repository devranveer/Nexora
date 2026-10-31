
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse


def scrape_website(url: str) -> dict:
    """Extract readable text from a public HTML webpage."""

    parsed_url = urlparse(url)

    if parsed_url.scheme not in ("http", "https"):
        raise ValueError("Only HTTP and HTTPS URLs are supported.")

    if not parsed_url.hostname:
        raise ValueError("Please provide a valid URL.")

    # Basic protection against local/private network URLs.
    hostname = parsed_url.hostname.lower()
    if hostname in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("Local URLs are not allowed.")

    response = requests.get(
        url,
        headers={
            "User-Agent": "NexoraBot/1.0 (webpage text extraction)"
        },
        timeout=15,
        allow_redirects=False,
        stream=True,
    )

    try:
        if response.status_code in (301, 302, 303, 307, 308):
            raise ValueError("Redirected URLs are not supported yet.")

        response.raise_for_status()

        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type.lower():
            raise ValueError("This URL does not return an HTML webpage.")

        # Limit downloaded content to approximately 1 MB.
        chunks = []
        total_size = 0

        for chunk in response.iter_content(chunk_size=8192):
            total_size += len(chunk)
            if total_size > 1_000_000:
                raise ValueError("Webpage is too large to process.")
            chunks.append(chunk)

        html = b"".join(chunks)
    finally:
        response.close()

    soup = BeautifulSoup(html, "html.parser")

    title = soup.title.get_text(" ", strip=True) if soup.title else ""

    # Remove elements that usually contain no useful page content.
    for element in soup([
        "script", "style", "nav", "footer",
        "header", "noscript", "svg"
    ]):
        element.decompose()

    text = soup.get_text(" ", strip=True)
    text = " ".join(text.split())

    if not text:
        raise ValueError("No readable text found on this webpage.")

    return {
        "source_url": url,
        "title": title,
        "text": text[:20000],
    }
