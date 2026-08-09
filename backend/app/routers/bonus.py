import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/bonus", tags=["bonus"])

# 10 equal wheel segments — mostly nothing, with small, medium and jackpot
# prizes scattered in as rare exciting outcomes.
WHEEL_SEGMENTS = [0, 100, 0, 500, 0, 0, 25000, 0, 0, 50000]
NEW_USER_WINDOW_DAYS = 2

# Test accounts exempt from the "2 spins, first 2 days" limit so the wheel
# can be spun repeatedly while testing/demoing.
UNLIMITED_SPIN_EMAILS = {"asifac67@gmail.com"}


def _evaluate_eligibility(current_user: models.User, db: Session):
    spins = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == current_user.id)
        .order_by(models.DailyBonusSpin.day_number)
        .all()
    )

    if current_user.email.lower() in UNLIMITED_SPIN_EMAILS:
        return True, len(spins) + 1, None, spins

    if len(spins) >= 2:
        return False, None, "You've already claimed both of your daily bonus spins.", spins

    account_age_days = (datetime.utcnow() - current_user.created_at).days
    if account_age_days > NEW_USER_WINDOW_DAYS:
        return False, None, "The daily bonus wheel is only available to new members during their first 2 days.", spins

    if len(spins) == 0:
        return True, 1, None, spins

    last_spin = spins[-1]
    if last_spin.spun_at.date() >= datetime.utcnow().date():
        return False, None, "Come back tomorrow for your second bonus spin!", spins

    return True, 2, None, spins


@router.get("/status", response_model=schemas.BonusStatusOut)
def get_bonus_status(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    eligible, next_day_number, reason, spins = _evaluate_eligibility(current_user, db)
    return schemas.BonusStatusOut(eligible=eligible, next_day_number=next_day_number, reason=reason, spins=spins)


@router.post("/spin", response_model=schemas.BonusSpinResult)
def spin_bonus_wheel(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    eligible, next_day_number, reason, _spins = _evaluate_eligibility(current_user, db)
    if not eligible:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    forced = (
        db.query(models.ForcedBonusSpin)
        .filter(models.ForcedBonusSpin.user_id == current_user.id)
        .first()
    )
    matching_indices = [i for i, a in enumerate(WHEEL_SEGMENTS) if a == float(forced.amount)] if forced else []
    if forced and matching_indices:
        segment_index = matching_indices[0]
        amount = WHEEL_SEGMENTS[segment_index]
    else:
        segment_index = random.randrange(len(WHEEL_SEGMENTS))
        amount = WHEEL_SEGMENTS[segment_index]
    if forced:
        db.delete(forced)

    new_spin = models.DailyBonusSpin(
        user_id=current_user.id,
        day_number=next_day_number,
        segment_index=segment_index,
        amount=amount,
    )
    db.add(new_spin)

    current_user.total_earning = float(current_user.total_earning) + amount

    db.commit()
    db.refresh(current_user)

    return schemas.BonusSpinResult(
        day_number=next_day_number,
        amount=amount,
        segment_index=segment_index,
        total_earning=float(current_user.total_earning),
    )
