from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from .admin import get_or_create_referral_settings

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


@router.get("/me", response_model=schemas.ReferralStatsOut)
def get_my_referrals(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    referred_users = (
        db.query(models.User)
        .filter(models.User.referred_by_id == current_user.id)
        .order_by(models.User.created_at.desc())
        .all()
    )

    commissions = (
        db.query(models.ReferralCommission)
        .filter(models.ReferralCommission.referrer_id == current_user.id)
        .order_by(models.ReferralCommission.created_at.desc())
        .all()
    )

    total_commission = sum(float(c.commission_amount) for c in commissions)
    settings = get_or_create_referral_settings(db)

    return schemas.ReferralStatsOut(
        referral_code=current_user.referral_code,
        total_referrals=len(referred_users),
        total_commission_earned=total_commission,
        commission_percent=float(settings.commission_percent),
        referred_users=referred_users,
        commissions=commissions,
    )
