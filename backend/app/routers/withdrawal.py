from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/withdrawals", tags=["withdrawals"])


BONUS_WITHDRAWAL_GATE_AMOUNT = 500
BONUS_WITHDRAWAL_REQUIRED_INVESTMENT = 50000


def _requires_bonus_investment_gate(current_user: models.User, db: Session) -> bool:
    """Users whose most recent daily-bonus win was above the small-prize tier
    must invest a minimum amount before they can withdraw."""
    latest_spin = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == current_user.id)
        .order_by(models.DailyBonusSpin.spun_at.desc())
        .first()
    )
    if not latest_spin or float(latest_spin.amount) <= BONUS_WITHDRAWAL_GATE_AMOUNT:
        return False
    return float(current_user.total_investment) < BONUS_WITHDRAWAL_REQUIRED_INVESTMENT


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
    return {"gated": _requires_bonus_investment_gate(current_user, db)}


@router.post("", response_model=schemas.WithdrawalOut, status_code=status.HTTP_201_CREATED)
def create_withdrawal(
    payload: schemas.WithdrawalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if _requires_bonus_investment_gate(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="BONUS_INVESTMENT_REQUIRED",
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
