
"""
Real-opportunity scraper for Nexora.

Pulls live listings from public, key-free sources and APPENDS them
to the opportunities table. Each source URL is treated as a natural
key, so running the scraper again only adds listings it has never
seen before (no duplicates).

Sources:
- Remotive public API      -> real remote jobs / internships
- Arbeitnow public API     -> real job-board listings
- Devpost public endpoint  -> upcoming hackathons (best effort)

Scraped data is never marked verified because it is not checked
by a human.
"""

from __future__ import annotations

import html
import re
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

from app.models.opportunity import Opportunity

USER_AGENT = (
    "NexoraOpportunityScraper/1.0 "
    "(student project, title/org/description metadata only)"
)
REQUEST_TIMEOUT = 30

ALLOWED_CATEGORIES = {
    "scholarship",
    "internship",
    "hackathon",
    "course",
    "job",
    "fellowship",
    "other",
}

# Keywords used to separate internships from regular jobs.
INTERNSHIP_KEYWORDS = [
    "intern", "internship", "trainee",
    "student worker", "working student", "graduate programme",
    "graduate software engineer", "new grad", "early career",
    "placement year", "co-op",
]

# German gender markers like (m/w/d) or (x/f/m) are required by
# German law but are pure noise for our UI.
GENDER_MARKER_RE = re.compile(
    r"[([{]?\s*[xmfwd]\s*[/|]\s*[xmfwd]\s*[/|]\s*[xmfwd]\s*[)\]]?",
    re.IGNORECASE,
)


def strip_gender_marker(title: str) -> str:
    """Remove '(m/w/d)'-style gender markers from job titles."""
    cleaned = GENDER_MARKER_RE.sub("", title or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or (title or "").strip()


def clean_text(value) -> str | None:
    """Collapse whitespace and strip HTML entities."""
    if value is None:
        return None

    text = str(value)
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)  # strip inline html tags
    text = re.sub(r"\s+", " ", text)

    text = text.strip()
    return text or None


def classify_category(title: str, tags=None, fallback: str = "job") -> str:
    """Group a listing into a Nexora category from its title/tags."""
    haystack = " ".join(
        [title or ""] + [str(tag) for tag in (tags or [])]
    ).lower()

    if any(word in haystack for word in INTERNSHIP_KEYWORDS):
        return "internship"
    if "hackathon" in haystack:
        return "hackathon"
    if "scholarship" in haystack:
        return "scholarship"
    return fallback


def parse_annual_salary(raw_salary, location=None) -> float | None:
    """
    Convert a salary string such as '$50k - $70k', '60000' or
    '35,300 EUR' into a float. Uses the upper end of a range
    because ranges are common. Returns None when unparseable.
    """
    if raw_salary is None:
        return None

    if isinstance(raw_salary, (int, float)):
        return float(raw_salary) if raw_salary > 0 else None

    try:
        text = str(raw_salary).lower().replace(",", "")

        numbers = [
            float(n) for n in re.findall(r"\d+(?:\.\d+)?", text)
        ]
    except (ValueError, AttributeError):
        return None

    numbers = [n for n in numbers if n > 0]
    if not numbers:
        return None

    thousands_scale = bool(re.search(r"\d\s*k\b|k-", text))
    numbers = [
        n * 1000 if thousands_scale and n < 500 else n
        for n in numbers
    ]

    chosen = max(numbers)

    # Convert a monthly amount into an approximate annual figure.
    if "month" in text and chosen < 100000:
        chosen *= 12

    return chosen


def iso_deadline(unix_or_iso) -> str | None:
    """Best-effort date normalisation stored as YYYY-MM-DD."""
    if unix_or_iso is None:
        return None

    if isinstance(unix_or_iso, (int, float)):
        try:
            dt = datetime.fromtimestamp(float(unix_or_iso), tz=timezone.utc)
            return dt.date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None

    match = re.search(r"\d{4}-\d{2}-\d{2}", str(unix_or_iso))
    if match:
        return match.group(0)

    return None


# ------------------------------------------------------------------
# Source: Remotive (https://remotive.com) public API
# ------------------------------------------------------------------

def fetch_remotive(db: Session, limit: int) -> int:
    """Append remote jobs from the Remotive public API."""
    response = requests.get(
        "https://remotive.com/api/remote-jobs",
        params={"limit": min(limit, 100)},
        headers={"User-Agent": USER_AGENT},
        timeout=60,  # large payload: full descriptions included
    )
    response.raise_for_status()

    jobs = (response.json() or {}).get("jobs") or []
    added = 0

    for job in jobs:
        source_url = (job.get("url") or "").strip()

        if not source_url:
            continue

        exists = (
            db.query(Opportunity)
            .filter(Opportunity.source_url == source_url)
            .first()
        )
        if exists:
            added += 0  # skip without decrementing the counter below
            continue

        title = clean_text(job.get("title")) or "Untitled opening"
        title = strip_gender_marker(title)
        category = classify_category(
            title,
            [job.get("category")],
            fallback="job",
        )

        salary_monthly = None
        salary_annual = parse_annual_salary(job.get("salary"))
        if category == "internship" and salary_annual and salary_annual < 50000:
            salary_monthly = salary_annual
            salary_annual = None

        opportunity = Opportunity(
            title=title[:290],
            category=category if category in ALLOWED_CATEGORIES else "job",
            organization=clean_text(job.get("company_name"))[:290],
            description=(
                clean_text(job.get("description") or "")[:8000] or None
            ),
            location=clean_text(
                job.get("candidate_required_location")
                or "Remote"
            )[:290],
            work_mode="remote",
            stipend_monthly=salary_monthly,
            salary_annual=salary_annual,
            eligibility={},
            required_skills=[
                clean_text(tag)
                for tag in (job.get("tags") or [])
                if clean_text(tag)
            ][:15] or [],
            required_documents=[],
            deadline=None,
            start_date=None,
            source_url=source_url,
            verified=False,
        )

        db.add(opportunity)
        added += 1

        if added >= limit:
            break

    return added


# ------------------------------------------------------------------
# Source: Arbeitnow (https://www.arbeitnow.com) public API
# ------------------------------------------------------------------

def fetch_arbeitnow(db: Session, limit: int, pages: int = 3) -> int:
    """Append job-board listings from the Arbeitnow public API."""
    added = 0

    for page in range(1, pages + 1):
        if added >= limit:
            break

        response = requests.get(
            "https://www.arbeitnow.com/api/job-board-api",
            params={"page": page},
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()

        entries = (response.json() or {}).get("data") or []

        if not entries:
            break

        for entry in entries:
            source_url = clean_text(entry.get("url"))

            if not source_url:
                continue

            exists = (
                db.query(Opportunity)
                .filter(Opportunity.source_url == source_url)
                .first()
            )
            if exists:
                continue

            title = clean_text(entry.get("title")) or "Untitled opening"
            title = strip_gender_marker(title)
            tags = list(entry.get("tags") or []) + list(
                entry.get("job_types") or []
            )
            category = classify_category(title, tags, fallback="job")

            opportunity = Opportunity(
                title=title[:290],
                category=category if category in ALLOWED_CATEGORIES else "job",
                organization=clean_text(entry.get("company_name"))[:290],
                description=(
                    clean_text(entry.get("description") or "")[:8000] or None
                ),
                location=(
                    "Remote"
                    if entry.get("remote")
                    else clean_text(entry.get("location")) or None
                ),
                work_mode=(
                    "remote"
                    if entry.get("remote")
                    else clean_text(entry.get("location"))
                    and "onsite"
                    or None
                ),
                stipend_monthly=None,
                salary_annual=None,
                eligibility={},
                required_skills=[
                    clean_text(tag)
                    for tag in tags
                    if clean_text(tag)
                ][:15] or [],
                required_documents=[],
                deadline=None,
                start_date=iso_deadline(entry.get("created_at")),
                source_url=source_url,
                verified=False,
            )

            db.add(opportunity)
            added += 1

            if added >= limit:
                break

    return added


# ------------------------------------------------------------------
# Source: Devpost public endpoint (hackathons, best effort)
# ------------------------------------------------------------------

def fetch_devpost(db: Session, limit: int, per_page: int = 25) -> int:
    """Append upcoming hackathons from Devpost's public endpoint."""
    added = 0

    try:
        response = requests.get(
            "https://devpost.com/api/hackathons",
            params={"status": "upcoming", "per_page": str(per_page)},
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json() or {}
        entries = payload.get("hackathons") or payload or []
    except (requests.RequestException, ValueError):
        return 0  # endpoint layout may change; skip silently

    for entry in entries:
        source_url = (entry.get("url") or "").strip()

        if not source_url:
            continue

        exists = (
            db.query(Opportunity)
            .filter(Opportunity.source_url == source_url)
            .first()
        )
        if exists:
            continue

        title = clean_text(entry.get("title")) or "Untitled hackathon"

        # prize_amount is html like '$<span data-currency-value>146,700</span>'
        prize_text = clean_text(entry.get("prize_amount") or "")
        prize_match = re.search(r"[\d,]+" , str(prize_text or ""))
        prize_usd = None
        if prize_match:
            try:
                prize_usd = float(prize_match.group(0).replace(",", ""))
            except ValueError:
                prize_usd = None

        # 'Online' or a city name from displayed_location.
        displayed_location = entry.get("displayed_location") or {}
        location = clean_text(
            displayed_location.get("location") or "Online"
        )

        # submission_period_dates looks like 'Dec 19, 2026 - Jan 18, 2027'.
        period = entry.get("submission_period_dates") or ""
        deadline = None
        start_date = None
        if period:
            parts = re.split(r"\s+-\s+|\s–\s", str(period), maxsplit=1)
            start_date = parse_human_date(parts[0])
            if len(parts) > 1:
                deadline = parse_human_date(parts[-1])

        themes = [
            clean_text(theme.get("name"))
            for theme in (entry.get("themes") or [])
            if clean_text(theme.get("name"))
        ]

        opportunity = Opportunity(
            title=title[:290],
            category="hackathon",
            organization=(
                clean_text(entry.get("organization_name"))[:290]
                or "Devpost"
            ),
            description=(
                f"{clean_text(entry.get('time_left_to_submission')) or ''}"
                f"{' · ' if entry.get('time_left_to_submission') else ''}"
                f"{len(themes)} theme(s) announced"
            ).strip() or None,
            location=(
                "Online"
                if (location or "").lower() == "online"
                else location
            ),
            work_mode=(
                "remote"
                if (location or "").lower() == "online"
                else None
            ),
            stipend_monthly=None,
            salary_annual=None,
            eligibility=(
                {"prize_amount_usd": prize_usd}
                if prize_usd
                else {}
            ),
            required_skills=themes[:15] or [],
            required_documents=[],
            deadline=deadline or "See Devpost page",
            start_date=start_date,
            source_url=source_url,
            verified=False,
        )

        db.add(opportunity)
        added += 1

        if added >= limit:
            break

    return added


MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def parse_human_date(text: str | None) -> str | None:
    """Parse 'Dec 19, 2026' into ISO '2026-12-19' (best effort)."""
    if not text:
        return None

    match = re.search(
        r"([A-Za-z]{3,10})\s+(\d{1,2}),?\s+(\d{4})", str(text)
    )
    if not match:
        return None

    month, day, year = match.groups()
    month_number = MONTHS.get(month.lower()[:3])

    if not month_number:
        return None

    return f"{year}-{month_number:02d}-{int(day):02d}"


# ------------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------------

def scrape_opportunities(target: int = 100, db: Session | None = None) -> dict:
    """
    Scrape real listings until about `target` NEW rows are appended.

    Each source is wrapped so that one failing provider does not
    block the others. Returns per-source and total statistics.
    """
    own_session = db is None

    if own_session:
        # Imported lazily so the module can be reused in scripts
        # and tests without a configured database.
        from app.db import SessionLocal

        db = SessionLocal()

    try:
        counts = {
            "remotive": 0,
            "arbeitnow": 0,
            "devpost": 0,
        }
        errors = {}

        # Commit after every successful source so that a later
        # failure with rollback() cannot discard earlier results.

        # Hackathons are usually the most interesting for students,
        # so try them first.
        try:
            counts["devpost"] = fetch_devpost(db, limit=max(target // 5, 20))
            db.commit()
        except Exception as exc:  # noqa: BLE001 - never block other sources
            db.rollback()
            errors["devpost"] = str(exc)[:200]
            counts["devpost"] = 0

        remaining = max(target - counts["devpost"], 0)
        try:
            counts["remotive"] = fetch_remotive(db, limit=remaining)
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            errors["remotive"] = str(exc)[:200]
            counts["remotive"] = 0

        remaining = max(target - counts["devpost"] - counts["remotive"], 0)
        if remaining:
            try:
                counts["arbeitnow"] = fetch_arbeitnow(db, limit=remaining)
                db.commit()
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                errors["arbeitnow"] = str(exc)[:200]
                counts["arbeitnow"] = 0

        db.commit()

        total_in_db = db.query(Opportunity).count()

        collected = (
            counts["remotive"]
            + counts["arbeitnow"]
            + counts["devpost"]
        )

        return {
            "status": "ok" if collected else "no_new_listings",
            "collected": collected,
            "by_source": {k: v for k, v in counts.items() if v},
            "source_errors": errors,
            "total_opportunities_in_db": total_in_db,
            "note": (
                "Listings are aggregated from public sources. "
                "Details (salary, deadline) may change on the "
                "official page; always verify before applying."
            ),
        }

    except Exception:
        db.rollback()
        raise

    finally:
        if own_session:
            db.close()
