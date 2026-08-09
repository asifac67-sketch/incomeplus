from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/withdrawals", tags=["withdrawals"])


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


@router.post("", response_model=schemas.WithdrawalOut, status_code=status.HTTP_201_CREATED)
def create_withdrawal(
    payload: schemas.WithdrawalCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
