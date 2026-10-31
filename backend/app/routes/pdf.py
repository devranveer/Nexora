
import re

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

import pymupdf as fitz  # PyMuPDF
from sqlalchemy import or_

from app.db import get_db
from app.models.opportunity import Opportunity
from app.services.gemma_service import analyze_opportunity

router = APIRouter(
    prefix="/ai",
    tags=["AI PDF"],
)

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


def validate_pdf_file(file: UploadFile) -> None:
    """Reject anything that is not a reasonably sized PDF."""
    if file.filename and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    content_type = file.content_type or ""
    if content_type and "pdf" not in content_type.lower():
        raise HTTPException(
            status_code=400,
            detail="Only PDF documents are supported.",
        )


def extract_pdf_text(data: bytes) -> str:
    """Extract readable text from PDF bytes using PyMuPDF."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail="The PDF file could not be opened. It may be corrupt.",
        ) from exc

    try:
        pages_text = [page.get_text() for page in doc]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail="Text could not be read from this PDF.",
        ) from exc
    finally:
        doc.close()

    text = " ".join(" ".join(pages_text).split())

    if len(text) < 40:
        raise HTTPException(
            status_code=422,
            detail="Not enough readable text in this PDF. It may be a scan; "
            "scanned PDFs are not supported yet.",
        )

    if len(text) > 30000:
        text = text[:30000]

    return text


MONTH_RE = (
    r"January|February|March|April|May|June|July|August|"
    r"September|October|November|December"
)


def heuristic_extract(text: str) -> dict:
    """
    Rule-based fallback when the AI extraction returns no usable
    title/category. Best effort only; unknown fields stay null.
    """
    from ai.resume_parser import TECH_SKILLS

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    lower = text.lower()

    # Title: first meaningful line (skip generic headings).
    title = ""
    for line in lines[:6]:
        if re.search(
            r"^(application|motion|the |this |all |for |it is)",
            line,
            re.IGNORECASE,
        ):
            continue
        if line and line[0].islower():
            continue  # wrapped continuation of a previous sentence
        title = line[:120]
        break
    if not title and lines:
        title = lines[0][:120]

    # Classification from keywords.
    category = [c for c, word in [
        ("scholarship", ["scholarship", "fellowship", "financial assistance", "grant"]),
        ("internship", ["internship", "intern ", "trainee"]),
        ("job", ["recruitment", "vacancy", "job opening", "position of"]),
        ("fellowship", ["fellowship"]),
    ] if any(w in lower for w in word)]
    category = category[0] if category else "other"

    # Organization from common label styles.
    organization = None
    org_match = re.search(
        r"(?:organization|organisation|ministry|department|institute|"
        r"university|company)\s*[:\-]\s*([^\n]{3,90})",
        text,
        re.IGNORECASE,
    )
    if org_match:
        organization = org_match.group(1).strip()[:200]

    # Deadline.
    def clean_number(raw: str) -> float:
        value = float(raw.replace(",", ""))
        if value < 100 and ("lakh" in lower or "lpa" in lower):
            value *= 100000
        return value

    deadline_match = re.search(r"\d{4}-\d{1,2}-\d{1,2}", text)
    if not deadline_match:
        deadline_match = re.search(
            rf"(\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{MONTH_RE})\s+\d{{4}})",
            text,
            re.IGNORECASE,
        )
    deadline = deadline_match.group(0) if deadline_match else None

    # Money fields.
    stipend = re.search(
        r"stipend[^\d]{0,60}([\d,]+(?:\.\d+)?)",
        text,
        re.IGNORECASE,
    )
    monthly_amount = (
        clean_number(stipend.group(1)) if stipend else None
    )
    if monthly_amount is not None and not (500 < monthly_amount < 1_000_000):
        monthly_amount = None

    # Income cap and minimum marks.
    income_match = re.search(
        r"income[^\d]{0,60}([\d,]+(?:\.\d+)?)", text, re.IGNORECASE
    )
    eligibility = {}

    minimum_marks = re.search(r"(\d{2})\s*(?:%|percent)", text, re.IGNORECASE)
    if minimum_marks:
        marks = float(minimum_marks.group(1))
        if 40 <= marks <= 100:
            eligibility["minimum_marks"] = marks

    if income_match:
        try:
            income = clean_number(income_match.group(1))
            if income >= 100000:
                eligibility["maximum_family_income"] = income
        except ValueError:
            pass

    skills = sorted(
        skill.title() if len(skill) > 3 else skill.upper()
        for skill in TECH_SKILLS
        if re.search(r"\b" + re.escape(skill) + r"\b", lower)
    )

    # Eligible courses from common degree tokens.
    eligible_courses = [
        d for d in ["B.Tech", "B.E.", "B.Sc", "MCA", "BCA", "M.Tech", "M.Sc"]
        if re.search(r"\b" + re.escape(d) + r"\b", text, re.IGNORECASE)
    ]

    return {
        "title": title,
        "category": category,
        "organization": organization,
        "description": text[:1200] or None,
        "deadline": deadline,
        "start_date": None,
        "location": None,
        "work_mode": None,
        "duration_months": None,
        "stipend_monthly": monthly_amount,
        "salary_annual": None,
        "minimum_experience_years": None,
        "required_skills": skills,
        "eligible_degrees": eligible_courses,
        "eligible_years": [],
        "eligibility": eligibility,
        "required_documents": [],
        "source_uncertainties": [],
    }


@router.post("/extract-pdf")
async def extract_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload an opportunity notification PDF, extract its structured
    details with Gemma, and save the result to the database.
    """
    try:
        validate_pdf_file(file)

        data = await file.read()

        if not data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(
                status_code=413,
                detail="PDF is too large. Maximum size is 10 MB.",
            )

        text = extract_pdf_text(data)

        # Try AI extraction first; fall back to rule-based parsing
        # so a quirky document never blocks the import entirely.
        uncertainties = []
        try:
            result = analyze_opportunity(text)
        except (ValueError, RuntimeError) as ai_exc:
            result = heuristic_extract(text)
            uncertainties = [
                "AI extraction did not return usable data ("
                + str(ai_exc)[:120]
                + "). Extracted with built-in rules instead — "
                "please verify every field manually."
            ]

        # Avoid exact same-title duplicates when someone re-uploads
        # the same notification.
        existing = None
        title = result.get("title")
        organization = result.get("organization")

        if title:
            existing = (
                db.query(Opportunity)
                .filter(
                    or_(
                        Opportunity.title == title,
                        Opportunity.title.ilike(title),
                    ),
                    Opportunity.organization == organization,
                )
                .first()
            )

        if existing:
            return {
                "status": "duplicate",
                "verified": existing.verified,
                "id": existing.id,
                "opportunity": {
                    "title": existing.title,
                    "category": existing.category,
                    "organization": existing.organization,
                    "description": existing.description,
                    "deadline": existing.deadline,
                    "location": existing.location,
                    "work_mode": existing.work_mode,
                    "stipend_monthly": existing.stipend_monthly,
                    "salary_annual": existing.salary_annual,
                    "eligibility": existing.eligibility,
                    "required_documents": existing.required_documents,
                    "required_skills": existing.required_skills,
                },
                "note": "This opportunity already exists in the database.",
            }

        opportunity = Opportunity(
            title=result["title"],
            category=result["category"],
            organization=result.get("organization"),
            description=result.get("description"),
            deadline=result.get("deadline"),
            start_date=result.get("start_date"),
            eligibility=result.get("eligibility", {}),
            required_documents=result.get("required_documents", []),
            required_skills=result.get("required_skills", []),
            eligible_degrees=result.get("eligible_degrees", []),
            eligible_years=result.get("eligible_years", []),
            location=result.get("location"),
            work_mode=result.get("work_mode"),
            minimum_experience_years=result.get("minimum_experience_years"),
            stipend_monthly=result.get("stipend_monthly"),
            salary_annual=result.get("salary_annual"),
            duration_months=result.get("duration_months"),
            source_url=None,
            verified=False,
        )

        db.add(opportunity)
        db.commit()
        db.refresh(opportunity)

        return {
            "status": "saved",
            "verified": opportunity.verified,
            "id": opportunity.id,
            "opportunity": {
                "title": opportunity.title,
                "category": opportunity.category,
                "organization": opportunity.organization,
                "description": opportunity.description,
                "deadline": opportunity.deadline,
                "start_date": opportunity.start_date,
                "location": opportunity.location,
                "work_mode": opportunity.work_mode,
                "duration_months": opportunity.duration_months,
                "stipend_monthly": opportunity.stipend_monthly,
                "salary_annual": opportunity.salary_annual,
                "eligibility": opportunity.eligibility,
                "required_documents": opportunity.required_documents,
                "required_skills": opportunity.required_skills,
            },
            "source_uncertainties": result.get("source_uncertainties", []),
        }

    except HTTPException:
        db.rollback()
        raise

    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to process the PDF. Please try again.",
        ) from exc
