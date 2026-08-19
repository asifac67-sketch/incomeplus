import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum, Boolean, Numeric, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class InvestmentStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class WalletProvider(str, enum.Enum):
    easypaisa = "easypaisa"
    jazzcash = "jazzcash"
    other_bank = "other_bank"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    phone_number = Column(String(20), nullable=True)
    country = Column(String(80), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    total_earning = Column(Numeric(12, 2), default=0, nullable=False)
    total_investment = Column(Numeric(12, 2), default=0, nullable=False)
    withdrawal_amount = Column(Numeric(12, 2), default=0, nullable=False)

    referral_code = Column(String(12), unique=True, index=True, nullable=False)
    referred_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    investment_requests = relationship(
        "InvestmentRequest", back_populates="user", cascade="all, delete-orphan"
    )
    bonus_spins = relationship(
        "DailyBonusSpin", back_populates="user", cascade="all, delete-orphan"
    )
    withdrawal_requests = relationship(
        "WithdrawalRequest", back_populates="user", cascade="all, delete-orphan"
    )
    referred_by = relationship("User", remote_side=[id], foreign_keys=[referred_by_id])


class InvestmentPlan(Base):
    __tablename__ = "investment_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    amount = Column(Numeric(12, 2), nullable=False, unique=True)
    monthly_profit = Column(Numeric(12, 2), nullable=False)
    badge_label = Column(String(40), nullable=False)
    note = Column(String(160), nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class InvestmentRequest(Base):
    __tablename__ = "investment_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    monthly_profit = Column(Numeric(12, 2), nullable=False)
    transaction_id = Column(String(120), nullable=False)
    screenshot_path = Column(String(255), nullable=False)
    status = Column(Enum(InvestmentStatus), default=InvestmentStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(255), nullable=True)
    admin_message = Column(Text, nullable=True)

    user = relationship("User", back_populates="investment_requests")


class EarningClaim(Base):
    """Tracks when a user last claimed their accrued daily-investment-profit
    into their real, withdrawable earning balance."""

    __tablename__ = "earning_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    last_claimed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")


class WheelSegment(Base):
    """Admin-editable daily-bonus wheel prizes — 8 fixed positions (0-7).
    required_investment (nullable) is how much the user must invest before
    a win on that segment can be withdrawn; null/0 means no restriction."""

    __tablename__ = "wheel_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    position = Column(Integer, nullable=False, unique=True)
    amount = Column(Numeric(12, 2), nullable=False)
    required_investment = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class DailyBonusSpin(Base):
    __tablename__ = "daily_bonus_spins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)
    segment_index = Column(Integer, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    spun_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="bonus_spins")


class ForcedBonusSpin(Base):
    """Admin-set outcome for a user's next daily-bonus spin — consumed (deleted)
    the moment that spin happens."""

    __tablename__ = "forced_bonus_spins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")


class ReferralSettings(Base):
    __tablename__ = "referral_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commission_percent = Column(Numeric(5, 2), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class DepositAccount(Base):
    """The single bank/wallet account shown to users for sending investment
    payments — admin-editable so it can change without a code deploy."""

    __tablename__ = "deposit_account"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bank_name = Column(String(120), nullable=False)
    account_holder = Column(String(120), nullable=False)
    account_number = Column(String(60), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ReferralCommission(Base):
    __tablename__ = "referral_commissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    referred_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    investment_id = Column(UUID(as_uuid=True), ForeignKey("investment_requests.id"), nullable=False)
    investment_amount = Column(Numeric(12, 2), nullable=False)
    percent_applied = Column(Numeric(5, 2), nullable=False)
    commission_amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    referrer = relationship("User", foreign_keys=[referrer_id])
    referred_user = relationship("User", foreign_keys=[referred_user_id])


class WithdrawalRequest(Base):
    __tablename__ = "withdrawal_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    wallet_provider = Column(Enum(WalletProvider), nullable=False)
    account_number = Column(String(60), nullable=False)
    bank_name = Column(String(120), nullable=True)
    status = Column(Enum(InvestmentStatus), default=InvestmentStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(255), nullable=True)
    admin_message = Column(Text, nullable=True)

    user = relationship("User", back_populates="withdrawal_requests")
