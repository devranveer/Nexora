
from sqlalchemy.orm import Session
from app.models.student_profile import StudentProfile


def get_profile(db: Session, user_id: str):
    return (
        db.query(StudentProfile)
        .filter(StudentProfile.user_id == user_id)
        .first()
    )


def get_or_create_profile(db: Session, user_id: str):
    """Fetch the profile, creating a blank one when missing."""
    profile = get_profile(db, user_id)

    if profile is None:
        profile = StudentProfile(
            user_id=user_id,
            course="B.Tech",
            degree="B.Tech",
            year_of_study="1st Year",
            marks_percentage=0,
            annual_family_income=0,
            skills=[],
            interests=[],
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return serialize(profile)


def update_profile(db: Session, user_id: str, data: dict):
    """Create-if-missing then apply the provided fields (upsert)."""
    profile = (
        db.query(StudentProfile)
        .filter(StudentProfile.user_id == user_id)
        .first()
    )

    if profile is None:
        profile = StudentProfile(
            user_id=user_id,
            course="B.Tech",
            degree="B.Tech",
            year_of_study="1st Year",
            marks_percentage=0,
            annual_family_income=0,
            skills=[],
            interests=[],
        )
        db.add(profile)

    allowed_scalar = {
        "course",
        "degree",
        "year_of_study",
        "preferred_location",
        "preferred_work_mode",
    }

    allowed_number = {
        "marks_percentage",
        "annual_family_income",
        "expected_stipend",
    }

    for key, value in (data or {}).items():
        if key in allowed_scalar and value is not None:
            setattr(profile, key, str(value)[:200])

        elif key in allowed_number:
            try:
                if value in (None, ""):
                    continue
                setattr(profile, key, float(value))
            except (TypeError, ValueError):
                continue  # ignore malformed numbers instead of failing

    # Lists are stored as JSON columns.
    skills = data.get("skills")
    if isinstance(skills, list):
        profile.skills = [
            str(skill).strip() for skill in skills if str(skill).strip()
        ]
    elif isinstance(skills, str) and skills.strip():
        profile.skills = [
            part.strip()
            for part in skills.replace(",", " ").split()
            if part.strip()
        ]

    interests = data.get("interests")
    if isinstance(interests, list):
        profile.interests = [
            str(item).strip() for item in interests if str(item).strip()
        ]
    elif isinstance(interests, str) and interests.strip():
        profile.interests = [
            part.strip()
            for part in interests.replace(",", " ").split()
            if part.strip()
        ]

    db.commit()
    db.refresh(profile)

    return serialize(profile)


def serialize(profile: StudentProfile) -> dict:
    return {
        "course": profile.course,
        "degree": profile.degree,
        "year_of_study": profile.year_of_study,
        "marks_percentage": profile.marks_percentage,
        "annual_family_income": profile.annual_family_income,
        "skills": profile.skills or [],
        "interests": profile.interests or [],
        "preferred_location": profile.preferred_location,
        "preferred_work_mode": profile.preferred_work_mode,
        "expected_stipend": profile.expected_stipend,
    }
