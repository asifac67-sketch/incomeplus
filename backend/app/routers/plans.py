from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("", response_model=List[schemas.PlanOut])
def list_active_plans(db: Session = Depends(get_db)):
    return (
        db.query(models.InvestmentPlan)
        .filter(models.InvestmentPlan.is_active.is_(True))
        .order_by(models.InvestmentPlan.sort_order, models.InvestmentPlan.amount)
        .all()
    )


deposit_router = APIRouter(prefix="/api/deposit-account", tags=["plans"])


@deposit_router.get("", response_model=schemas.DepositAccountOut)
def get_deposit_account(db: Session = Depends(get_db)):
    account = db.query(models.DepositAccount).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deposit account not configured.")
    return account
