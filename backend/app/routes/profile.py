
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session
import re
import tempfile
import os

from app.db import get_db
from app.services.profile_service import update_profile

router = APIRouter(prefix="/profile", tags=["Student Profile"])


# Temporary demo identity. Replace with real authentication
# before putting this in front of real users.
def get_demo_user_id():
    return "demo-student-1"


@router.get("/me")
def read_profile(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_demo_user_id),
):
    """Return the profile, creating a blank one on first visit."""
    from app.services.profile_service import get_or_create_profile

    profile = get_or_create_profile(db, user_id)
    return {"status": "ok", "profile": profile}


@router.put("/me")
@router.post("/me")
def save_profile(
    data: dict,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_demo_user_id),
):
    """
    Create or update the profile in one call (upsert).

    The payload is a plain dict so the frontend can send fields it
    has; unknown fields are ignored by the service.
    """
    profile = update_profile(db, user_id, data)
    return {"status": "saved", "profile": profile}


ALLOWED_RESUME_SUFFIXES = (".pdf", ".docx", ".txt", ".md")
MAX_RESUME_BYTES = 10 * 1024 * 1024


def read_pdf_text(data: bytes) -> str:
    try:
        import pymupdf as fitz

        doc = fitz.open(stream=data, filetype="pdf")
        try:
            return " ".join(
                page.get_text() for page in doc
            )
        finally:
            doc.close()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail="The PDF could not be read. It may be a scan "
            "(scanned resumes are not supported yet).",
        ) from exc


def read_docx_text(data: bytes) -> str:
    try:
        import docx
        import io

        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail="The .docx file could not be read.",
        ) from exc


@router.post("/parse-resume")
async def parse_resume_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_demo_user_id),
):
    """
    Parse an uploaded resume (PDF / DOCX / TXT) into student
    profile details, save what was found to the stored profile,
    and return everything so the eligibility checker can prefill.
    """
    try:
        filename = (file.filename or "").lower()

        if not filename.endswith(ALLOWED_RESUME_SUFFIXES):
            raise HTTPException(
                status_code=400,
                detail="Upload a PDF, DOCX or TXT file.",
            )

        data = await file.read()

        if not data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(data) > MAX_RESUME_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Resume is too large. Maximum size is 10 MB.",
            )

        if filename.endswith(".pdf"):
            text = read_pdf_text(data)
        elif filename.endswith(".docx"):
            text = read_docx_text(data)
        else:
            text = data.decode("utf-8", errors="ignore")

        text = " ".join(text.split())

        if len(text) < 60:
            raise HTTPException(
                status_code=422,
                detail="Not enough readable text in this resume.",
            )

        # The fast regex parser from the ai/ package.
        from ai.resume_parser import parse_skills, parse_resume

        parsed = parse_resume(text)  # resume_text/student_id ignored
        skills = parse_skills(text)

        # Only save details that were actually found; the parser
        # uses invented defaults for missing values, and defaults
        # must never silently break eligibility matching.
        updates = {}

        if skills:
            updates["skills"] = skills

        marks_match = re.search(r"(\d{2}(?:\.\d{1,2})?)\s*%", text)
        cgpa_match = re.search(
            r"(?:cgpa|gpa|pointer)\s*[:=-]?\s*"
            r"(\d{1,2}(?:\.\d{1,2})?)",
            text,
            re.IGNORECASE,
        )
        if marks_match and 40.0 <= float(marks_match.group(1)) <= 100.0:
            updates["marks_percentage"] = float(marks_match.group(1))
        elif cgpa_match:
            try:
                val = float(cgpa_match.group(1))
                if 0.0 < val <= 10.0:
                    updates["marks_percentage"] = round(val * 10.0, 2)
            except ValueError:
                pass

        income_match = re.search(
            r"(?:annual\s+)?income\s*[:=-]?\s*₹?\s*"
            r"(\d+(?:,\d+)*(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        if income_match:
            try:
                income = float(income_match.group(1).replace(",", ""))
                if income < 100:  # e.g. '6.5 lakh'
                    income *= 100000.0
                updates["annual_family_income"] = income
            except ValueError:
                pass

        year_match = re.search(
            r"\b([1-4])(?:st|nd|rd|th)?\s+year\b", text, re.IGNORECASE
        )
        if year_match:
            updates["year_of_study"] = (
                f"{['', '1st', '2nd', '3rd', '4th'][int(year_match.group(1))]}"
                " Year"
            )

        for degree in ["B.Tech", "B.E.", "M.Tech", "BCA", "MCA", "B.Sc", "M.Sc"]:
            if re.search(r"\b" + re.escape(degree) + r"\b", text, re.I):
                updates["degree"] = degree.replace(".Sc", ".Sc.")
                break

        from ai.resume_parser import INDIAN_STATES

        for state in INDIAN_STATES:
            if re.search(r"\b" + re.escape(state) + r"\b", text, re.I):
                updates["preferred_location"] = state
                break

        # Apply everything found to the stored profile (upsert).
        profile = update_profile(db, user_id, updates)

        return {
            "status": "parsed",
            "filename": file.filename,
            "parsed": {
                "name": parsed.name,
                "college": parsed.college,
                "college_tier": parsed.college_tier,
                "state_domicile": updates.get("preferred_location"),
                "degree": updates.get("degree"),
                "year_of_study": updates.get("year_of_study"),
                "marks_percentage": updates.get("marks_percentage"),
                "annual_family_income": updates.get(
                    "annual_family_income"
                ),
                "skills": skills,
            },
            "profile": profile,
            "note": (
                "Parsed details were saved to your profile. Fields "
                "missing from the resume were left unchanged."
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to parse the resume. Please try again.",
        ) from exc
