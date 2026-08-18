import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import UserRole, InvestmentStatus, WalletProvider


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str
    phone_number: str = Field(min_length=7, max_length=20)
    country: str = Field(min_length=2, max_length=80)
    role: UserRole = UserRole.user
    admin_code: Optional[str] = None
    referral_code: Optional[str] = None

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = UserRole.user
    remember_me: bool = False


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone_number: Optional[str] = Field(default=None, min_length=7, max_length=20)
    country: Optional[str] = Field(default=None, min_length=2, max_length=80)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
    confirm_new_password: str

    @field_validator("confirm_new_password")
    @classmethod
    def passwords_match(cls, v, info):
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("New passwords do not match")
        return v


class UserOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone_number: Optional[str] = None
    country: Optional[str] = None
    role: UserRole
    created_at: datetime
    total_earning: float = 0
    total_investment: float = 0
    withdrawal_amount: float = 0
    referral_code: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    remember_me: bool
    user: UserOut


class PlanBase(BaseModel):
    amount: float = Field(gt=0)
    monthly_profit: float = Field(ge=0)
    badge_label: str = Field(min_length=1, max_length=40)
    note: str = Field(min_length=1, max_length=160)
    is_featured: bool = False
    sort_order: int = 0


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    monthly_profit: Optional[float] = Field(default=None, ge=0)
    badge_label: Optional[str] = Field(default=None, min_length=1, max_length=40)
    note: Optional[str] = Field(default=None, min_length=1, max_length=160)
    is_featured: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class PlanOut(PlanBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InvestmentOut(BaseModel):
    id: uuid.UUID
    amount: float
    monthly_profit: float
    transaction_id: str
    screenshot_path: str
    status: InvestmentStatus
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    admin_message: Optional[str] = None

    class Config:
        from_attributes = True


class RejectionInput(BaseModel):
    reason: Optional[str] = None
    message: Optional[str] = None


class InvestorInfo(BaseModel):
    full_name: str
    email: EmailStr

    class Config:
        from_attributes = True


class InvestmentAdminOut(InvestmentOut):
    user: InvestorInfo


class BonusSpinOut(BaseModel):
    day_number: int
    amount: float
    segment_index: int
    spun_at: datetime

    class Config:
        from_attributes = True


class BonusStatusOut(BaseModel):
    eligible: bool
    next_day_number: Optional[int] = None
    reason: Optional[str] = None
    spins: List[BonusSpinOut] = []
    next_eligible_at: Optional[datetime] = None


class BonusSpinResult(BaseModel):
    day_number: int
    amount: float
    segment_index: int
    total_earning: float


class WithdrawalCreate(BaseModel):
    amount: float = Field(gt=0)
    wallet_provider: WalletProvider
    account_number: str = Field(min_length=7, max_length=20)


class WithdrawalOut(BaseModel):
    id: uuid.UUID
    amount: float
    wallet_provider: WalletProvider
    account_number: str
    status: InvestmentStatus
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    admin_message: Optional[str] = None

    class Config:
        from_attributes = True


class WithdrawalAdminOut(WithdrawalOut):
    user: InvestorInfo


class ReferredUserOut(BaseModel):
    full_name: str
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class ReferralCommissionOut(BaseModel):
    id: uuid.UUID
    referred_user_id: uuid.UUID
    investment_amount: float
    percent_applied: float
    commission_amount: float
    created_at: datetime

    class Config:
        from_attributes = True


class ReferralStatsOut(BaseModel):
    referral_code: str
    total_referrals: int
    total_commission_earned: float
    commission_percent: float
    referred_users: List[ReferredUserOut]
    commissions: List[ReferralCommissionOut]


class ReferralSettingsOut(BaseModel):
    commission_percent: float

    class Config:
        from_attributes = True


class ReferralSettingsUpdate(BaseModel):
    commission_percent: float = Field(ge=0, le=100)


class WheelSegmentOut(BaseModel):
    position: int
    amount: float
    required_investment: Optional[float] = None

    class Config:
        from_attributes = True


class WheelSegmentUpdate(BaseModel):
    position: int = Field(ge=0, le=7)
    amount: float = Field(ge=0)
    required_investment: Optional[float] = Field(default=None, ge=0)


class WheelSegmentsUpdateRequest(BaseModel):
    segments: List[WheelSegmentUpdate]


class EarningClaimStatusOut(BaseModel):
    daily_rate: float
    claimable_amount: float
    last_claimed_at: datetime


class EarningClaimResult(BaseModel):
    claimed_amount: float
    total_earning: float
    last_claimed_at: datetime


class UserDetailOut(BaseModel):
    user: UserOut
    investments: List[InvestmentOut] = []
    withdrawals: List[WithdrawalOut] = []
    spins: List[BonusSpinOut] = []
    referred_count: int = 0


class SpinUserOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr
    forced_amount: Optional[float] = None
    last_spin_amount: Optional[float] = None

    class Config:
        from_attributes = True


class ForceSpinRequest(BaseModel):
    amount: float = Field(ge=0)
