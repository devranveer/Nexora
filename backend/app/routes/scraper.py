
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.opportunity_scraper import scrape_opportunities

router = APIRouter(
    prefix="/scraper",
    tags=["Scraper"],
)


@router.post("/run")
def run_scraper(
    target: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """
    Scrape real opportunities from public sources and append
    anything that is not already in the database.
    """
    try:
        result = scrape_opportunities(target=target, db=db)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Scraping failed while collecting listings.",
                "hint": "One or more public sources may be unreachable. "
                "Try again in a few minutes.",
            },
        ) from exc

    if result["collected"] == 0:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "No new listings were collected.",
                "by_source": result["by_source"],
                "hint": "Sources may be unreachable or every listing "
                "may already exist in the database.",
            },
        )

    return result


@router.get("/status")
def scraper_status(db: Session = Depends(get_db)):
    """Quick stats to show how much real data is loaded."""
    from app.models.opportunity import Opportunity

    rows = (
        db.query(Opportunity.category, func.count(Opportunity.id))
        .group_by(Opportunity.category)
        .all()
    )

    counts = {category: count for category, count in rows}

    return {
        "total": sum(counts.values()),
        "by_category": counts,
        "source": "Public APIs: Remotive, Arbeitnow, Devpost",
    }
