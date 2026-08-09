import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
INVESTMENTS_DIR = UPLOAD_ROOT / "investments"
INVESTMENTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024  # 5 MB


async def save_investment_screenshot(file: UploadFile) -> str:
    extension = ALLOWED_IMAGE_TYPES.get(file.content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a valid screenshot (PNG, JPG or WEBP).",
        )

    contents = await file.read()
    if len(contents) > MAX_SCREENSHOT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Screenshot must be smaller than 5 MB.",
        )
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded screenshot appears to be empty.",
        )

    filename = f"{uuid.uuid4().hex}{extension}"
    filepath = INVESTMENTS_DIR / filename
    filepath.write_bytes(contents)

    return filename
