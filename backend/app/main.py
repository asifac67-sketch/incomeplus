import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(models.InvestmentPlan).count() == 0:
            for plan_data in DEFAULT_PLANS:
                db.add(models.InvestmentPlan(**plan_data))
            db.commit()

        if db.query(models.ReferralSettings).count() == 0:
            db.add(models.ReferralSettings(commission_percent=DEFAULT_COMMISSION_PERCENT))
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
