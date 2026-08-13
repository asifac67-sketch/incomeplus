from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/withdrawals", tags=["withdrawals"])


def _required_investment(current_user: models.User, db: Session) -> Optional[float]:
    """Returns the investment amount still needed to unlock withdrawals, or
    None if the user isn't gated.

    Looks at EVERY spin the user has ever had (not just the latest — a small
    later win must not erase a still-unmet requirement from an earlier big
    win), and joins on the spin's stable segment_index/position rather than
    the admin-editable amount, so rebalancing wheel prizes later can't
    silently change or erase a gate that's already in effect for a user."""
    spins = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == current_user.id)
        .all()
    )
    if not spins:
        return None

    positions = {s.segment_index for s in spins}
    segments = (
        db.query(models.WheelSegment)
        .filter(models.WheelSegment.position.in_(positions))
        .all()
    )

    required_values = [float(s.required_investment) for s in segments if s.required_investment is not None]
    if not required_values:
        return None

    highest_required = max(required_values)
    return highest_required if float(current_user.total_investment) < highest_required else None


def _available_balance(current_user: models.User, db: Session) -> float:
    pending_total = (
        db.query(func.coalesce(func.sum(models.WithdrawalRequest.amount), 0))
        .filter(
            models.WithdrawalRequest.user_id == current_user.id,
            models.WithdrawalRequest.status == models.InvestmentStatus.pending,
        )
        .scalar()
    )
    raw = float(current_user.total_earning) - float(current_user.withdrawal_amount) - float(pending_total)
    # Round to currency precision so binary-float residue (e.g. 176.25999999999988)
    # can't make a user's exact displayed balance fail the ">" check below.
    return round(raw, 2)


@router.get("/eligibility")
def check_withdrawal_eligibility(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    required = _required_investment(current_user, db)
    available = max(0.0, _available_balance(current_user, db))
    return {"gated": required is not None, "required_investment": required, "available_balance": available}


@router.post("", response_model=schemas.WithdrawalOut, status_code=status.HTTP_201_CREATED)
def create_withdrawal(
    payload: schemas.WithdrawalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Lock this user's row for the rest of the transaction so two concurrent
    # withdrawal requests can't both read the same pre-request balance and
    # both pass the check — the second waits here until the first commits.
    locked_user = (
        db.query(models.User).filter(models.User.id == current_user.id).with_for_update().first()
    )

    required = _required_investment(locked_user, db)
    if required is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "BONUS_INVESTMENT_REQUIRED", "required_investment": required},
        )

    available = _available_balance(locked_user, db)
    if payload.amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. You can withdraw up to Rs {available:,.2f}.",
        )

    new_request = models.WithdrawalRequest(
        user_id=locked_user.id,
        amount=payload.amount,
        wallet_provider=payload.wallet_provider,
        account_number=payload.account_number.strip(),
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request


@router.get("/me", response_model=List[schemas.WithdrawalOut])
def list_my_withdrawals(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.WithdrawalRequest)
        .filter(models.WithdrawalRequest.user_id == current_user.id)
        .order_by(models.WithdrawalRequest.created_at.desc())
        .all()
    )
