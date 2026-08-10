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
    None if the user isn't gated (based on their most recent bonus win and
    that prize's admin-configured required_investment on WheelSegment)."""
    latest_spin = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == current_user.id)
        .order_by(models.DailyBonusSpin.spun_at.desc())
        .first()
    )
    if not latest_spin:
        return None

    segment = (
        db.query(models.WheelSegment)
        .filter(models.WheelSegment.amount == latest_spin.amount)
        .first()
    )
    if not segment or segment.required_investment is None:
        return None

    required = float(segment.required_investment)
    return required if float(current_user.total_investment) < required else None


def _available_balance(current_user: models.User, db: Session) -> float:
    pending_total = (
        db.query(func.coalesce(func.sum(models.WithdrawalRequest.amount), 0))
        .filter(
            models.WithdrawalRequest.user_id == current_user.id,
            models.WithdrawalRequest.status == models.InvestmentStatus.pending,
        )
        .scalar()
    )
    return float(current_user.total_earning) - float(current_user.withdrawal_amount) - float(pending_total)


@router.get("/eligibility")
def check_withdrawal_eligibility(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    required = _required_investment(current_user, db)
    return {"gated": required is not None, "required_investment": required}


@router.post("", response_model=schemas.WithdrawalOut, status_code=status.HTTP_201_CREATED)
def create_withdrawal(
    payload: schemas.WithdrawalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    required = _required_investment(current_user, db)
    if required is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "BONUS_INVESTMENT_REQUIRED", "required_investment": required},
        )

    available = _available_balance(current_user, db)
    if payload.amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. You can withdraw up to Rs {available:,.2f}.",
        )

    new_request = models.WithdrawalRequest(
        user_id=current_user.id,
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
