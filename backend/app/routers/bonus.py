import random
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/bonus", tags=["bonus"])

# One spin every rolling 24 hours, indefinitely — not just for new users.
SPIN_COOLDOWN_HOURS = 24

# Test accounts exempt from the daily cooldown so the wheel can be spun
# repeatedly while testing/demoing.
UNLIMITED_SPIN_EMAILS = {"asifac67@gmail.com"}


def _get_wheel_amounts(db: Session) -> List[float]:
    """The 8 wheel prize amounts, ordered by position — admin-editable via
    /api/admin/wheel-segments."""
    segments = db.query(models.WheelSegment).order_by(models.WheelSegment.position).all()
    return [float(s.amount) for s in segments]


def _evaluate_eligibility(current_user: models.User, db: Session):
    """Returns (eligible, next_day_number, reason, spins, next_eligible_at) —
    next_eligible_at is only set for the "already spun, on cooldown" case, so
    the frontend can render a live countdown to the exact next-spin moment."""
    spins = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == current_user.id)
        .order_by(models.DailyBonusSpin.spun_at)
        .all()
    )

    if current_user.email.lower() in UNLIMITED_SPIN_EMAILS:
        return True, len(spins) + 1, None, spins, None

    if not spins:
        return True, 1, None, spins, None

    last_spin = spins[-1]
    next_eligible_at = last_spin.spun_at + timedelta(hours=SPIN_COOLDOWN_HOURS)
    if datetime.utcnow() < next_eligible_at:
        return False, None, "Come back tomorrow for your next bonus spin!", spins, next_eligible_at

    return True, len(spins) + 1, None, spins, None


@router.get("/segments", response_model=List[schemas.WheelSegmentOut])
def get_wheel_segments(db: Session = Depends(get_db)):
    return (
        db.query(models.WheelSegment)
        .order_by(models.WheelSegment.position)
        .all()
    )


@router.get("/status", response_model=schemas.BonusStatusOut)
def get_bonus_status(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    eligible, next_day_number, reason, spins, next_eligible_at = _evaluate_eligibility(current_user, db)
    return schemas.BonusStatusOut(
        eligible=eligible,
        next_day_number=next_day_number,
        reason=reason,
        spins=spins,
        next_eligible_at=next_eligible_at,
    )


@router.post("/spin", response_model=schemas.BonusSpinResult)
def spin_bonus_wheel(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Lock this user's row for the rest of the transaction so two concurrent
    # spin requests can't both read the same "not yet spun" state and both
    # pass eligibility — the second waits here until the first commits.
    locked_user = (
        db.query(models.User).filter(models.User.id == current_user.id).with_for_update().first()
    )

    eligible, next_day_number, reason, _spins, _next_eligible_at = _evaluate_eligibility(locked_user, db)
    if not eligible:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    wheel_amounts = _get_wheel_amounts(db)

    forced = (
        db.query(models.ForcedBonusSpin)
        .filter(models.ForcedBonusSpin.user_id == locked_user.id)
        .first()
    )
    matching_indices = [i for i, a in enumerate(wheel_amounts) if a == float(forced.amount)] if forced else []
    if forced and matching_indices:
        segment_index = matching_indices[0]
        amount = wheel_amounts[segment_index]
        # Only consume the forced spin once it actually matched a live segment —
        # if no segment currently has that amount, leave it in place so it still
        # applies once the wheel segments are fixed, instead of silently vanishing.
        db.delete(forced)
    else:
        segment_index = random.randrange(len(wheel_amounts))
        amount = wheel_amounts[segment_index]

    new_spin = models.DailyBonusSpin(
        user_id=locked_user.id,
        day_number=next_day_number,
        segment_index=segment_index,
        amount=amount,
    )
    db.add(new_spin)

    locked_user.total_earning = float(locked_user.total_earning) + amount

    db.commit()
    db.refresh(locked_user)

    return schemas.BonusSpinResult(
        day_number=next_day_number,
        amount=amount,
        segment_index=segment_index,
        total_earning=float(current_user.total_earning),
    )
