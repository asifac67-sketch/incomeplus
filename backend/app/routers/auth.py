import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

ADMIN_SIGNUP_CODE = os.getenv("ADMIN_SIGNUP_CODE", "change_this_admin_code")


@router.post("/signup", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    if payload.role == models.UserRole.admin:
        if not payload.admin_code or payload.admin_code != ADMIN_SIGNUP_CODE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid admin registration code.",
            )

    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    referred_by_id = None
    if payload.referral_code:
        referrer = (
            db.query(models.User)
            .filter(models.User.referral_code == payload.referral_code.strip().upper())
            .first()
        )
        if referrer:
            referred_by_id = referrer.id

    new_referral_code = security.generate_referral_code()
    while db.query(models.User).filter(models.User.referral_code == new_referral_code).first():
        new_referral_code = security.generate_referral_code()

    new_user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=security.hash_password(payload.password),
        phone_number=payload.phone_number,
        country=payload.country,
        role=payload.role,
        referral_code=new_referral_code,
        referred_by_id=referred_by_id,
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
    )

    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not security.verify_password(payload.password, user.hashed_password):
        raise invalid_credentials

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled.")

    if user.role != payload.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account is not registered as {payload.role.value}.",
        )

    token, expires_in_minutes = security.create_access_token(
        subject=str(user.id), role=user.role.value, remember_me=payload.remember_me
    )

    return schemas.TokenResponse(
        access_token=token,
        expires_in_minutes=expires_in_minutes,
        remember_me=payload.remember_me,
        user=user,
    )


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.ProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in updates.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not security.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    current_user.hashed_password = security.hash_password(payload.new_password)
    db.commit()
