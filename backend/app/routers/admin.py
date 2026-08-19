import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin
from .investment import _daily_rate, _get_or_create_claim

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_pending_record(model_cls, record_id: str, db: Session, label: str, allowed_statuses=None):
    try:
        parsed_id = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {label} ID.")

    # Lock the row so two concurrent approve/reject calls for the same
    # request (double-click, two admin tabs) can't both see it as pending —
    # the second waits here until the first's transaction commits.
    record = db.query(model_cls).filter(model_cls.id == parsed_id).with_for_update().first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label.capitalize()} request not found.")

    allowed = allowed_statuses or {models.InvestmentStatus.pending}
    if record.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request has already been {record.status.value}.",
        )
    return record


# Withdrawals can move through admin-visible review states before a final
# approve/reject — none of these count as "finalized" yet.
WITHDRAWAL_ACTIVE_STATUSES = {
    models.InvestmentStatus.pending,
    models.InvestmentStatus.under_investigation,
    models.InvestmentStatus.refund_in_progress,
}


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

    investor = db.query(models.User).filter(models.User.id == investment.user_id).with_for_update().first()

    # Settle whatever's already claimable at the investor's pre-approval daily
    # rate before this investment's rate kicks in, so the backlog time isn't
    # retroactively billed at the new (higher) rate once approved.
    old_rate = _daily_rate(investor, db)
    claim = _get_or_create_claim(investor, db)
    now = datetime.utcnow()
    elapsed_seconds = max(0, (now - claim.last_claimed_at).total_seconds())
    settle_amount = round((old_rate / 86400) * elapsed_seconds, 6)
    if settle_amount > 0:
        investor.total_earning = float(investor.total_earning) + settle_amount
    claim.last_claimed_at = now

    investment.status = models.InvestmentStatus.approved
    investment.reviewed_at = datetime.utcnow()

    investor.total_investment = float(investor.total_investment) + float(investment.amount)

    if investor.referred_by_id:
        referrer = db.query(models.User).filter(models.User.id == investor.referred_by_id).with_for_update().first()
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
    payload: Optional[schemas.RejectionInput] = None,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    investment = _get_pending_record(models.InvestmentRequest, investment_id, db, "investment")

    investment.status = models.InvestmentStatus.rejected
    investment.reviewed_at = datetime.utcnow()
    investment.rejection_reason = payload.reason if payload else None
    investment.admin_message = payload.message if payload else None

    db.commit()
    db.refresh(investment)
    return investment


@router.patch("/investments/{investment_id}/rejection-message", response_model=schemas.InvestmentAdminOut)
def update_investment_rejection_message(
    investment_id: str,
    payload: schemas.RejectionInput,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Lets an admin edit the reason/message on an already-rejected request —
    the customer's Transactions page always reflects whatever is saved here."""
    try:
        parsed_id = uuid.UUID(investment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid investment ID.")

    investment = db.query(models.InvestmentRequest).filter(models.InvestmentRequest.id == parsed_id).first()
    if not investment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment request not found.")
    if investment.status != models.InvestmentStatus.rejected:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only rejected requests have a rejection message.")

    investment.rejection_reason = payload.reason
    investment.admin_message = payload.message

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
    withdrawal = _get_pending_record(
        models.WithdrawalRequest, withdrawal_id, db, "withdrawal", allowed_statuses=WITHDRAWAL_ACTIVE_STATUSES
    )

    investor = db.query(models.User).filter(models.User.id == withdrawal.user_id).with_for_update().first()

    withdrawal.status = models.InvestmentStatus.approved
    withdrawal.reviewed_at = datetime.utcnow()
    investor.withdrawal_amount = float(investor.withdrawal_amount) + float(withdrawal.amount)

    db.commit()
    db.refresh(withdrawal)
    return withdrawal


@router.patch("/withdrawals/{withdrawal_id}/reject", response_model=schemas.WithdrawalAdminOut)
def reject_withdrawal(
    withdrawal_id: str,
    payload: Optional[schemas.RejectionInput] = None,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    withdrawal = _get_pending_record(
        models.WithdrawalRequest, withdrawal_id, db, "withdrawal", allowed_statuses=WITHDRAWAL_ACTIVE_STATUSES
    )

    withdrawal.status = models.InvestmentStatus.rejected
    withdrawal.reviewed_at = datetime.utcnow()
    withdrawal.rejection_reason = payload.reason if payload else None
    withdrawal.admin_message = payload.message if payload else None

    db.commit()
    db.refresh(withdrawal)
    return withdrawal


@router.patch("/withdrawals/{withdrawal_id}/mark-under-investigation", response_model=schemas.WithdrawalAdminOut)
def mark_withdrawal_under_investigation(
    withdrawal_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    withdrawal = _get_pending_record(
        models.WithdrawalRequest, withdrawal_id, db, "withdrawal", allowed_statuses=WITHDRAWAL_ACTIVE_STATUSES
    )
    withdrawal.status = models.InvestmentStatus.under_investigation
    db.commit()
    db.refresh(withdrawal)
    return withdrawal


@router.patch("/withdrawals/{withdrawal_id}/mark-refund-progress", response_model=schemas.WithdrawalAdminOut)
def mark_withdrawal_refund_progress(
    withdrawal_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    withdrawal = _get_pending_record(
        models.WithdrawalRequest, withdrawal_id, db, "withdrawal", allowed_statuses=WITHDRAWAL_ACTIVE_STATUSES
    )
    withdrawal.status = models.InvestmentStatus.refund_in_progress
    db.commit()
    db.refresh(withdrawal)
    return withdrawal


@router.patch("/withdrawals/{withdrawal_id}/rejection-message", response_model=schemas.WithdrawalAdminOut)
def update_withdrawal_rejection_message(
    withdrawal_id: str,
    payload: schemas.RejectionInput,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Lets an admin edit the reason/message on an already-rejected request —
    the customer's Transactions page always reflects whatever is saved here."""
    try:
        parsed_id = uuid.UUID(withdrawal_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid withdrawal ID.")

    withdrawal = db.query(models.WithdrawalRequest).filter(models.WithdrawalRequest.id == parsed_id).first()
    if not withdrawal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Withdrawal request not found.")
    if withdrawal.status != models.InvestmentStatus.rejected:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only rejected requests have a rejection message.")

    withdrawal.rejection_reason = payload.reason
    withdrawal.admin_message = payload.message

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


# ---------- Deposit account (shown to users when investing) ----------

@router.get("/deposit-account", response_model=schemas.DepositAccountOut)
def get_deposit_account_admin(
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    account = db.query(models.DepositAccount).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deposit account not configured.")
    return account


@router.patch("/deposit-account", response_model=schemas.DepositAccountOut)
def update_deposit_account(
    payload: schemas.DepositAccountUpdate,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    account = db.query(models.DepositAccount).first()
    if not account:
        account = models.DepositAccount(**payload.model_dump())
        db.add(account)
    else:
        account.bank_name = payload.bank_name
        account.account_holder = payload.account_holder
        account.account_number = payload.account_number

    db.commit()
    db.refresh(account)
    return account


# ---------- Users (full history) ----------

@router.get("/users", response_model=List[schemas.UserOut])
def list_users(
    search: Optional[str] = Query(default=None),
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(models.User)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(or_(models.User.full_name.ilike(like), models.User.email.ilike(like)))
    return query.order_by(models.User.created_at.desc()).limit(100).all()


@router.get("/users/{user_id}", response_model=schemas.UserDetailOut)
def get_user_detail(
    user_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID.")

    user = db.query(models.User).filter(models.User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    investments = (
        db.query(models.InvestmentRequest)
        .filter(models.InvestmentRequest.user_id == parsed_id)
        .order_by(models.InvestmentRequest.created_at.desc())
        .all()
    )
    withdrawals = (
        db.query(models.WithdrawalRequest)
        .filter(models.WithdrawalRequest.user_id == parsed_id)
        .order_by(models.WithdrawalRequest.created_at.desc())
        .all()
    )
    spins = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == parsed_id)
        .order_by(models.DailyBonusSpin.spun_at.desc())
        .all()
    )
    referred_count = db.query(models.User).filter(models.User.referred_by_id == parsed_id).count()

    return schemas.UserDetailOut(
        user=user,
        investments=investments,
        withdrawals=withdrawals,
        spins=spins,
        referred_count=referred_count,
    )


# ---------- Wheel Prizes (spin amounts + withdrawal unlock requirements) ----------

@router.get("/wheel-segments", response_model=List[schemas.WheelSegmentOut])
def list_wheel_segments(
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.WheelSegment).order_by(models.WheelSegment.position).all()


@router.put("/wheel-segments", response_model=List[schemas.WheelSegmentOut])
def update_wheel_segments(
    payload: schemas.WheelSegmentsUpdateRequest,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    segments_by_position = {
        s.position: s for s in db.query(models.WheelSegment).all()
    }

    for update in payload.segments:
        segment = segments_by_position.get(update.position)
        if not segment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No wheel segment at position {update.position}.",
            )
        segment.amount = update.amount
        segment.required_investment = update.required_investment

    db.commit()
    return db.query(models.WheelSegment).order_by(models.WheelSegment.position).all()


# ---------- Daily Bonus Spin Control ----------

@router.get("/spin-control/users", response_model=List[schemas.SpinUserOut])
def search_users_for_spin_control(
    search: Optional[str] = Query(default=None),
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(models.User).filter(models.User.role == models.UserRole.user)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(or_(models.User.full_name.ilike(like), models.User.email.ilike(like)))

    users = query.order_by(models.User.full_name).limit(25).all()

    forced_by_user = {
        f.user_id: float(f.amount)
        for f in db.query(models.ForcedBonusSpin).filter(
            models.ForcedBonusSpin.user_id.in_([u.id for u in users])
        )
    }

    results = []
    for user in users:
        last_spin = (
            db.query(models.DailyBonusSpin)
            .filter(models.DailyBonusSpin.user_id == user.id)
            .order_by(models.DailyBonusSpin.spun_at.desc())
            .first()
        )
        results.append(
            schemas.SpinUserOut(
                id=user.id,
                full_name=user.full_name,
                email=user.email,
                forced_amount=forced_by_user.get(user.id),
                last_spin_amount=float(last_spin.amount) if last_spin else None,
            )
        )
    return results


@router.put("/spin-control/all-force")
def set_forced_spin_for_all(
    payload: schemas.ForceSpinRequest,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user_ids = [u.id for u in db.query(models.User.id).filter(models.User.role == models.UserRole.user).all()]
    if not user_ids:
        return {"updated_count": 0}

    existing = {
        f.user_id: f
        for f in db.query(models.ForcedBonusSpin).filter(models.ForcedBonusSpin.user_id.in_(user_ids))
    }

    for user_id in user_ids:
        if user_id in existing:
            existing[user_id].amount = payload.amount
        else:
            db.add(models.ForcedBonusSpin(user_id=user_id, amount=payload.amount))

    db.commit()
    return {"updated_count": len(user_ids)}


@router.put("/spin-control/users/{user_id}/force", response_model=schemas.SpinUserOut)
def set_forced_spin(
    user_id: str,
    payload: schemas.ForceSpinRequest,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID.")

    user = db.query(models.User).filter(models.User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    forced = db.query(models.ForcedBonusSpin).filter(models.ForcedBonusSpin.user_id == parsed_id).first()
    if forced:
        forced.amount = payload.amount
    else:
        forced = models.ForcedBonusSpin(user_id=parsed_id, amount=payload.amount)
        db.add(forced)

    db.commit()

    last_spin = (
        db.query(models.DailyBonusSpin)
        .filter(models.DailyBonusSpin.user_id == parsed_id)
        .order_by(models.DailyBonusSpin.spun_at.desc())
        .first()
    )
    return schemas.SpinUserOut(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        forced_amount=float(payload.amount),
        last_spin_amount=float(last_spin.amount) if last_spin else None,
    )


@router.delete("/spin-control/users/{user_id}/force", status_code=status.HTTP_204_NO_CONTENT)
def clear_forced_spin(
    user_id: str,
    _admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID.")

    forced = db.query(models.ForcedBonusSpin).filter(models.ForcedBonusSpin.user_id == parsed_id).first()
    if forced:
        db.delete(forced)
        db.commit()
