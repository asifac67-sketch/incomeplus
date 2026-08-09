from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..storage import save_investment_screenshot

router = APIRouter(prefix="/api/investments", tags=["investments"])


@router.post("", response_model=schemas.InvestmentOut, status_code=status.HTTP_201_CREATED)
async def create_investment(
    amount: float = Form(...),
    transaction_id: str = Form(...),
    screenshot: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = (
        db.query(models.InvestmentPlan)
        .filter(models.InvestmentPlan.amount == amount, models.InvestmentPlan.is_active.is_(True))
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select one of the available investment plans.",
        )

    transaction_id = transaction_id.strip()
    if not transaction_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter the transaction ID from your payment.",
        )

    screenshot_filename = await save_investment_screenshot(screenshot)

    new_request = models.InvestmentRequest(
        user_id=current_user.id,
        amount=amount,
        monthly_profit=plan.monthly_profit,
        transaction_id=transaction_id,
        screenshot_path=screenshot_filename,
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request


@router.get("/me", response_model=List[schemas.InvestmentOut])
def list_my_investments(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.InvestmentRequest)
        .filter(models.InvestmentRequest.user_id == current_user.id)
        .order_by(models.InvestmentRequest.created_at.desc())
        .all()
    )
