"""
Abstracted file storage service.

Locally: saves to filesystem.
Production (when CLOUDINARY_URL or CLOUDINARY_* env vars are set): uploads to Cloudinary.
"""

import os
import io
import uuid
import aiofiles
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.config import settings


class StorageBackend(ABC):
    """Abstract storage interface."""

    @abstractmethod
    async def save(self, file_bytes: bytes, filename: str, subdir: str = "") -> str:
        """Save file and return a path/public_id that identifies it."""
        ...

    @abstractmethod
    async def delete(self, file_path: str) -> bool:
        """Delete a file. Returns True if successful."""
        ...

    @abstractmethod
    def get_url(self, file_path: str) -> str:
        """Get the URL to access the file."""
        ...


# ── Local filesystem (dev) ────────────────────────────────────────────────────

class LocalStorage(StorageBackend):
    """Local filesystem storage for development."""

    def __init__(self, base_dir: str = None):
        self.base_dir = Path(base_dir or settings.upload_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, file_bytes: bytes, filename: str, subdir: str = "") -> str:
        ext = Path(filename).suffix.lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        save_dir = self.base_dir / subdir if subdir else self.base_dir
        save_dir.mkdir(parents=True, exist_ok=True)
        file_path = save_dir / unique_name
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_bytes)
        return str(file_path.relative_to(self.base_dir))

    async def delete(self, file_path: str) -> bool:
        full_path = self.base_dir / file_path
        try:
            if full_path.exists():
                os.remove(full_path)
                return True
        except OSError:
            pass
        return False

    def get_url(self, file_path: str) -> str:
        return f"/api/uploads/{file_path}"


class ThumbnailStorage(LocalStorage):
    """Storage specifically for thumbnails."""

    def __init__(self):
        super().__init__(os.path.join(settings.upload_dir, "thumbnails"))


# ── Cloudinary (production) ───────────────────────────────────────────────────

class CloudinaryStorage(StorageBackend):
    """
    Cloudinary storage backend.
    Activated automatically when CLOUDINARY_URL (or the three individual
    CLOUDINARY_* env vars) are set.
    """

    def __init__(self, folder: str = "wandersync"):
        import cloudinary
        import cloudinary.uploader

        self.folder = folder
        self._uploader = cloudinary.uploader

        # Configure Cloudinary from either the URL or individual fields
        if settings.cloudinary_url:
            cloudinary.config(cloudinary_url=settings.cloudinary_url)
        else:
            cloudinary.config(
                cloud_name=settings.cloudinary_cloud_name,
                api_key=settings.cloudinary_api_key,
                api_secret=settings.cloudinary_api_secret,
                secure=True,
            )

    async def save(self, file_bytes: bytes, filename: str, subdir: str = "") -> str:
        """Upload to Cloudinary. Returns the public_id (used as our 'path')."""
        import asyncio
        from functools import partial

        public_id = f"{self.folder}/{subdir}/{uuid.uuid4().hex}" if subdir else f"{self.folder}/{uuid.uuid4().hex}"

        # Determine resource type
        ext = Path(filename).suffix.lower()
        resource_type = "video" if ext in {".mp4", ".mov", ".avi", ".webm", ".mkv"} else "image"

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            partial(
                self._uploader.upload,
                file_bytes,
                public_id=public_id,
                resource_type=resource_type,
                overwrite=False,
            )
        )
        # Return the public_id — we reconstruct the URL via get_url()
        return result["public_id"]

    async def delete(self, file_path: str) -> bool:
        """Delete from Cloudinary by public_id."""
        import asyncio
        from functools import partial

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                partial(self._uploader.destroy, file_path)
            )
            return result.get("result") == "ok"
        except Exception:
            return False

    def get_url(self, file_path: str) -> str:
        """Return a Cloudinary CDN URL for the given public_id."""
        import cloudinary
        return cloudinary.CloudinaryImage(file_path).build_url(secure=True)


class CloudinaryThumbnailStorage(CloudinaryStorage):
    """Cloudinary storage for thumbnails (separate folder)."""

    def __init__(self):
        super().__init__(folder="wandersync/thumbnails")


# ── Factory: pick the right backend automatically ─────────────────────────────

def _make_storage() -> StorageBackend:
    if settings.use_cloudinary:
        print("INFO: Using Cloudinary for file storage.")
        return CloudinaryStorage()
    return LocalStorage()


def _make_thumbnail_storage() -> StorageBackend:
    if settings.use_cloudinary:
        return CloudinaryThumbnailStorage()
    return ThumbnailStorage()


# Singleton instances — imported everywhere
storage = _make_storage()
thumbnail_storage = _make_thumbnail_storage()
