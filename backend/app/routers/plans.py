from typing import List

from fastapi import APIRouter, Depends
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
