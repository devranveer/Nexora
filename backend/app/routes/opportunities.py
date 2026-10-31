from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import get_db
from app.models.opportunity import Opportunity

router = APIRouter(
    prefix="/opportunities",
    tags=["Opportunities"],
)

ALLOWED_CATEGORIES = {
    "scholarship",
    "internship",
    "hackathon",
    "course",
    "job",
    "fellowship",
    "other",
}


# ---------------------------------------------------------------
# Request model used to APPEND a new opportunity
# ---------------------------------------------------------------

class OpportunityInput(BaseModel):
    title: str = Field(min_length=3, max_length=290)
    category: str = Field(min_length=3, max_length=50)
    organization: str | None = Field(default=None, max_length=290)
    description: str | None = Field(default=None, max_length=12000)
    location: str | None = Field(default=None, max_length=290)
    work_mode: str | None = Field(default=None, max_length=50)
    stipend_monthly: float | None = Field(default=None, ge=0)
    salary_annual: float | None = Field(default=None, ge=0)
    duration_months: int | None = Field(default=None, ge=0)
    deadline: str | None = Field(default=None, max_length=50)
    eligibility: dict | list | None = None
    required_skills: list[str] = Field(default_factory=list)
    required_documents: list[str] = Field(default_factory=list)
    eligible_degrees: list[str] = Field(default_factory=list)
    eligible_years: list[str] = Field(default_factory=list)
    source_url: str | None = Field(default=None, max_length=1000)


def to_record(item: Opportunity) -> dict:
    """Shared serializer so GET and POST responses stay consistent."""
    return {
        "id": item.id,
        "title": item.title,
        "category": item.category,
        "organization": item.organization,
        "description": item.description,
        "location": item.location,
        "work_mode": item.work_mode,
        "stipend_monthly": item.stipend_monthly,
        "salary_annual": item.salary_annual,
        "duration_months": item.duration_months,
        "deadline": item.deadline,
        "eligibility": item.eligibility,
        "required_documents": item.required_documents,
        "required_skills": item.required_skills,
        "eligible_degrees": item.eligible_degrees,
        "eligible_years": item.eligible_years,
        "source_url": item.source_url,
        "verified": item.verified,
        "created_at": (
            item.created_at.isoformat()
            if item.created_at
            else None
        ),
    }


@router.get("/")
def get_opportunities(
    category: str | None = None,
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(Opportunity)

        # Filter by category
        if category and category.strip():
            query = query.filter(
                Opportunity.category.ilike(category.strip())
            )

        # Search title, organization, or description
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Opportunity.title.ilike(term),
                    Opportunity.organization.ilike(term),
                    Opportunity.description.ilike(term),
                )
            )

        # Count matching records before pagination
        total = query.count()

        # Show newest records first
        records = (
            query
            .order_by(Opportunity.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "opportunities": [
                to_record(item) for item in records
            ],
        }

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve opportunities.",
        ) from exc


@router.post("/")
def append_opportunity(
    data: OpportunityInput,
    db: Session = Depends(get_db),
):
    """
    Append a new opportunity. Duplicates by source_url are rejected
    with 409 (with the existing id) so appending never duplicates.
    """
    try:
        category = data.category.strip().lower()

        if category not in ALLOWED_CATEGORIES:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Category must be one of: "
                    + ", ".join(sorted(ALLOWED_CATEGORIES))
                ),
            )

        source_url = (
            data.source_url.strip().rstrip("/")
            if data.source_url
            else None
        )

        if source_url:
            existing = (
                db.query(Opportunity)
                .filter(Opportunity.source_url == source_url)
                .first()
            )

            if existing:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": (
                            "This opportunity already exists. "
                            "Nothing was appended."
                        ),
                        "existing_id": existing.id,
                        "title": existing.title,
                    },
                )

        if data.stipend_monthly is None and data.salary_annual is None:
            pass  # both are optional for scholarships / hackathons

        opportunity = Opportunity(
            title=data.title.strip(),
            category=category,
            organization=data.organization,
            description=data.description,
            location=data.location,
            work_mode=data.work_mode.lower() if data.work_mode else None,
            stipend_monthly=data.stipend_monthly,
            salary_annual=data.salary_annual,
            duration_months=data.duration_months,
            deadline=data.deadline,
            eligibility=(
                data.eligibility
                if isinstance(data.eligibility, dict)
                else (
                    {"other_requirements": data.eligibility}
                    if isinstance(data.eligibility, list) and data.eligibility
                    else {}
                )
            ),
            required_documents=[
                doc.strip()
                for doc in (data.required_documents or [])
                if doc.strip()
            ],
            required_skills=[
                skill.strip()
                for skill in (data.required_skills or [])
                if skill.strip()
            ],
            eligible_degrees=data.eligible_degrees,
            eligible_years=data.eligible_years,
            source_url=source_url,
            verified=False,  # user-submitted, not verified
        )

        db.add(opportunity)
        db.commit()
        db.refresh(opportunity)

        return {
            "status": "appended",
            "id": opportunity.id,
            "opportunity": to_record(opportunity),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to append the opportunity.",
        ) from exc


@router.get("/{opportunity_id}")
def get_opportunity_detail(
    opportunity_id: int,
    db: Session = Depends(get_db),
):
    opportunity = (
        db.query(Opportunity)
        .filter(Opportunity.id == opportunity_id)
        .first()
    )

    if opportunity is None:
        raise HTTPException(
            status_code=404,
            detail="Opportunity not found",
        )

    return {
        "id": opportunity.id,
        "title": opportunity.title,
        "category": opportunity.category,
        "organization": opportunity.organization,
        "description": opportunity.description,
        "location": opportunity.location,
        "work_mode": opportunity.work_mode,
        "stipend_monthly": opportunity.stipend_monthly,
        "salary_annual": opportunity.salary_annual,
        "eligibility": opportunity.eligibility,
        "required_documents": opportunity.required_documents,
        "deadline": opportunity.deadline,
        "source_url": opportunity.source_url,
        "verified": opportunity.verified,
        "created_at": (
            opportunity.created_at.isoformat()
            if opportunity.created_at
            else None
        ),
    }