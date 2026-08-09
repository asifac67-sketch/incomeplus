import os
import secrets
import string
from datetime import datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "change_this_to_a_long_random_secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REMEMBER_ME_EXPIRE_DAYS = int(os.getenv("REMEMBER_ME_EXPIRE_DAYS", "30"))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, role: str, remember_me: bool = False) -> tuple[str, int]:
    if remember_me:
        expire_delta = timedelta(days=REMEMBER_ME_EXPIRE_DAYS)
        expires_in_minutes = REMEMBER_ME_EXPIRE_DAYS * 24 * 60
    else:
        expire_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        expires_in_minutes = ACCESS_TOKEN_EXPIRE_MINUTES

    expire = datetime.utcnow() + expire_delta
    payload = {"sub": subject, "role": role, "exp": expire, "remember_me": remember_me}
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, expires_in_minutes


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def generate_referral_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
