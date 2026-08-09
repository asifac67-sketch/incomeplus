import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_pending_record(model_cls, record_id: str, db: Session, label: str):
    try:
        parsed_id = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {label} ID.")

    record = db.query(model_cls).filter(model_cls.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label.capitalize()} request not found.")
    if record.status != models.InvestmentStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request has already been {record.status.value}.",
        )
    return record


# ---------- Investments ----------

@router.get("/investments", response_model=List[schemas.InvestmentAdminOut])
def list_investments(
    status_filter: Optional[models.InvestmentStatus] = Query(default=None, alias="status"),
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(models.InvestmentRequest).options(joinedload(models.InvestmentRequest.user))
    if status_filter:
        query = query.filter(models.InvestmentRequest.status == status_filter)
    return query.order_by(models.InvestmentRequest.created_at.desc()).all()


@router.patch("/investments/{investment_id}/approve", response_model=schemas.InvestmentAdminOut)
def approve_investment(
    investment_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    investment = _get_pending_record(models.InvestmentRequest, investment_id, db, "investment")

    investment.status = models.InvestmentStatus.approved
    investment.reviewed_at = datetime.utcnow()

    investor = db.query(models.User).filter(models.User.id == investment.user_id).first()
    investor.total_investment = float(investor.total_investment) + float(investment.amount)

    if investor.referred_by_id:
        referrer = db.query(models.User).filter(models.User.id == investor.referred_by_id).first()
        if referrer:
            settings = get_or_create_referral_settings(db)
            percent = float(settings.commission_percent)
            commission_amount = float(investment.amount) * percent / 100

            referrer.total_earning = float(referrer.total_earning) + commission_amount
            db.add(
                models.ReferralCommission(
                    referrer_id=referrer.id,
                    referred_user_id=investor.id,
                    investment_id=investment.id,
                    investment_amount=investment.amount,
                    percent_applied=percent,
                    commission_amount=commission_amount,
                )
            )

    db.commit()
    db.refresh(investment)
    return investment


@router.patch("/investments/{investment_id}/reject", response_model=schemas.InvestmentAdminOut)
def reject_investment(
    investment_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    investment = _get_pending_record(models.InvestmentRequest, investment_id, db, "investment")

    investment.status = models.InvestmentStatus.rejected
    investment.reviewed_at = datetime.utcnow()

    db.commit()
    db.refresh(investment)
    return investment


# ---------- Withdrawals ----------

@router.get("/withdrawals", response_model=List[schemas.WithdrawalAdminOut])
def list_withdrawals(
    status_filter: Optional[models.InvestmentStatus] = Query(default=None, alias="status"),
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(models.WithdrawalRequest).options(joinedload(models.WithdrawalRequest.user))
    if status_filter:
        query = query.filter(models.WithdrawalRequest.status == status_filter)
    return query.order_by(models.WithdrawalRequest.created_at.desc()).all()


@router.patch("/withdrawals/{withdrawal_id}/approve", response_model=schemas.WithdrawalAdminOut)
def approve_withdrawal(
    withdrawal_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    withdrawal = _get_pending_record(models.WithdrawalRequest, withdrawal_id, db, "withdrawal")

    withdrawal.status = models.InvestmentStatus.approved
    withdrawal.reviewed_at = datetime.utcnow()

    investor = db.query(models.User).filter(models.User.id == withdrawal.user_id).first()
    investor.withdrawal_amount = float(investor.withdrawal_amount) + float(withdrawal.amount)

    db.commit()
    db.refresh(withdrawal)
    return withdrawal


@router.patch("/withdrawals/{withdrawal_id}/reject", response_model=schemas.WithdrawalAdminOut)
def reject_withdrawal(
    withdrawal_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    withdrawal = _get_pending_record(models.WithdrawalRequest, withdrawal_id, db, "withdrawal")

    withdrawal.status = models.InvestmentStatus.rejected
    withdrawal.reviewed_at = datetime.utcnow()

    db.commit()
    db.refresh(withdrawal)
    return withdrawal


# ---------- Investment Plans ----------

@router.get("/plans", response_model=List[schemas.PlanOut])
def list_all_plans(
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.InvestmentPlan)
        .order_by(models.InvestmentPlan.sort_order, models.InvestmentPlan.amount)
        .all()
    )


@router.post("/plans", response_model=schemas.PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: schemas.PlanCreate,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(models.InvestmentPlan).filter(models.InvestmentPlan.amount == payload.amount).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A plan for Rs {payload.amount:,.0f} already exists.",
        )

    plan = models.InvestmentPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _get_plan(plan_id: str, db: Session) -> models.InvestmentPlan:
    try:
        parsed_id = uuid.UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid plan ID.")

    plan = db.query(models.InvestmentPlan).filter(models.InvestmentPlan.id == parsed_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")
    return plan


@router.patch("/plans/{plan_id}", response_model=schemas.PlanOut)
def update_plan(
    plan_id: str,
    payload: schemas.PlanUpdate,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    plan = _get_plan(plan_id, db)

    updates = payload.model_dump(exclude_unset=True)

    if "amount" in updates and updates["amount"] != float(plan.amount):
        clash = db.query(models.InvestmentPlan).filter(
            models.InvestmentPlan.amount == updates["amount"],
            models.InvestmentPlan.id != plan.id,
        ).first()
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A plan for Rs {updates['amount']:,.0f} already exists.",
            )

    for field, value in updates.items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    plan = _get_plan(plan_id, db)
    db.delete(plan)
    db.commit()


# ---------- Referral Settings ----------

DEFAULT_COMMISSION_PERCENT = 10


def get_or_create_referral_settings(db: Session) -> models.ReferralSettings:
    settings = db.query(models.ReferralSettings).first()
    if not settings:
        settings = models.ReferralSettings(commission_percent=DEFAULT_COMMISSION_PERCENT)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/referral-settings", response_model=schemas.ReferralSettingsOut)
def get_referral_settings(
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return get_or_create_referral_settings(db)


@router.patch("/referral-settings", response_model=schemas.ReferralSettingsOut)
def update_referral_settings(
    payload: schemas.ReferralSettingsUpdate,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    settings = get_or_create_referral_settings(db)
    settings.commission_percent = payload.commission_percent
    db.commit()
    db.refresh(settings)
    return settings
