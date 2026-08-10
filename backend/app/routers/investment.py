from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..storage import save_investment_screenshot

router = APIRouter(prefix="/api/investments", tags=["investments"])


def _daily_rate(current_user: models.User, db: Session) -> float:
    approved = (
        db.query(models.InvestmentRequest)
        .filter(
            models.InvestmentRequest.user_id == current_user.id,
            models.InvestmentRequest.status == models.InvestmentStatus.approved,
        )
        .all()
    )
    return sum(float(i.monthly_profit) / 30 for i in approved)


def _get_or_create_claim(current_user: models.User, db: Session) -> models.EarningClaim:
    claim = db.query(models.EarningClaim).filter(models.EarningClaim.user_id == current_user.id).first()
    if not claim:
        claim = models.EarningClaim(user_id=current_user.id, last_claimed_at=datetime.utcnow())
        db.add(claim)
        db.commit()
        db.refresh(claim)
    return claim


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


@router.get("/earnings/claim-status", response_model=schemas.EarningClaimStatusOut)
def get_claim_status(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    daily_rate = _daily_rate(current_user, db)
    claim = _get_or_create_claim(current_user, db)

    elapsed_seconds = max(0, (datetime.utcnow() - claim.last_claimed_at).total_seconds())
    claimable = (daily_rate / 86400) * elapsed_seconds

    return schemas.EarningClaimStatusOut(
        daily_rate=daily_rate,
        claimable_amount=round(claimable, 6),
        last_claimed_at=claim.last_claimed_at,
    )


@router.post("/earnings/claim", response_model=schemas.EarningClaimResult)
def claim_earnings(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    daily_rate = _daily_rate(current_user, db)
    if daily_rate <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have no active investments earning right now.",
        )

    claim = _get_or_create_claim(current_user, db)
    now = datetime.utcnow()
    elapsed_seconds = max(0, (now - claim.last_claimed_at).total_seconds())
    claimable = round((daily_rate / 86400) * elapsed_seconds, 6)

    if claimable <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to claim yet — check back soon.",
        )

    current_user.total_earning = float(current_user.total_earning) + claimable
    claim.last_claimed_at = now
    db.commit()
    db.refresh(current_user)

    return schemas.EarningClaimResult(
        claimed_amount=claimable,
        total_earning=float(current_user.total_earning),
        last_claimed_at=claim.last_claimed_at,
    )
