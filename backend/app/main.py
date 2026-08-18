import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from . import models
from .database import Base, SessionLocal, engine
from .routers import admin, auth, bonus, investment, plans, referrals, withdrawal
from .routers.admin import DEFAULT_COMMISSION_PERCENT
from .storage import UPLOAD_ROOT

load_dotenv()

app = FastAPI(title="IncomePlus API", version="1.0.0")

cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

DEFAULT_PLANS = [
    dict(amount=2000, monthly_profit=300, badge_label="Starter", note="Perfect for beginners", is_featured=False, sort_order=1),
    dict(amount=3000, monthly_profit=500, badge_label="Basic", note="Steady start", is_featured=False, sort_order=2),
    dict(amount=5000, monthly_profit=600, badge_label="Most Popular", note="Best balance of growth", is_featured=True, sort_order=3),
    dict(amount=10000, monthly_profit=800, badge_label="Growth", note="Accelerate your returns", is_featured=False, sort_order=4),
    dict(amount=20000, monthly_profit=1000, badge_label="Premium", note="Maximum earning potential", is_featured=False, sort_order=5),
]

# 8 fixed wheel positions, alternating a prize with nothing. required_investment
# is how much the user must invest before a win on that segment unlocks
# withdrawals (null = no restriction).
DEFAULT_WHEEL_SEGMENTS = [
    dict(position=0, amount=0, required_investment=None),
    dict(position=1, amount=500, required_investment=None),
    dict(position=2, amount=0, required_investment=None),
    dict(position=3, amount=6000, required_investment=2000),
    dict(position=4, amount=0, required_investment=None),
    dict(position=5, amount=15000, required_investment=4000),
    dict(position=6, amount=0, required_investment=None),
    dict(position=7, amount=500000, required_investment=50000),
]


# No Alembic in this project — create_all only adds missing tables, not
# missing columns on tables that already exist in production. New columns
# added to existing models need an explicit ALTER TABLE here, run once at
# startup and safe to repeat (IF NOT EXISTS) on every deploy.
COLUMN_MIGRATIONS = [
    "ALTER TABLE investment_requests ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255)",
    "ALTER TABLE investment_requests ADD COLUMN IF NOT EXISTS admin_message TEXT",
    "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255)",
    "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS admin_message TEXT",
]


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        for statement in COLUMN_MIGRATIONS:
            conn.execute(text(statement))

    db = SessionLocal()
    try:
        if db.query(models.InvestmentPlan).count() == 0:
            for plan_data in DEFAULT_PLANS:
                db.add(models.InvestmentPlan(**plan_data))
            db.commit()

        if db.query(models.ReferralSettings).count() == 0:
            db.add(models.ReferralSettings(commission_percent=DEFAULT_COMMISSION_PERCENT))
            db.commit()

        if db.query(models.WheelSegment).count() == 0:
            for segment_data in DEFAULT_WHEEL_SEGMENTS:
                db.add(models.WheelSegment(**segment_data))
            db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(investment.router)
app.include_router(admin.router)
app.include_router(bonus.router)
app.include_router(withdrawal.router)
app.include_router(plans.router)
app.include_router(referrals.router)
