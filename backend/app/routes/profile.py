
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.profile_service import (
    get_or_create_profile,
    update_profile,
)

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
