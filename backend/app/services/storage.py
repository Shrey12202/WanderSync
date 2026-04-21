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
    The Cloudinary SDK auto-reads CLOUDINARY_URL from os.environ on import.
    No manual config call needed.
    """

    def __init__(self, folder: str = "wandersync"):
        import cloudinary  # noqa — triggers auto-config from CLOUDINARY_URL env var
        import cloudinary.uploader
        self.folder = folder
        self._uploader = cloudinary.uploader
        print(f"INFO: CloudinaryStorage initialised (folder={folder})")

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
        # Store the full secure URL so the frontend can use it directly
        return result["secure_url"]

    async def delete(self, file_path: str) -> bool:
        """Delete from Cloudinary. Accepts either a public_id or a full secure URL."""
        import asyncio, re
        from functools import partial

        # If it's a full URL, extract the public_id
        if file_path.startswith("http"):
            match = re.search(r'/upload/(?:v\d+/)?(.+?)(?:\.[^./]+)?$', file_path)
            public_id = match.group(1) if match else file_path
        else:
            public_id = file_path

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                partial(self._uploader.destroy, public_id)
            )
            return result.get("result") == "ok"
        except Exception:
            return False

    def get_url(self, file_path: str) -> str:
        """Return a Cloudinary CDN URL. Pass-through if already a full URL."""
        if file_path.startswith("http"):
            return file_path
        import cloudinary
        return cloudinary.CloudinaryImage(file_path).build_url(secure=True)


class CloudinaryThumbnailStorage(CloudinaryStorage):
    """Cloudinary storage for thumbnails (separate folder)."""

    def __init__(self):
        super().__init__(folder="wandersync/thumbnails")


# ── Factory: pick the right backend automatically ─────────────────────────────

def _make_storage() -> StorageBackend:
    if settings.use_cloudinary:
        try:
            backend = CloudinaryStorage()
            print("INFO: ✅ Using Cloudinary for media storage.")
            return backend
        except Exception as e:
            print(f"WARNING: Cloudinary init failed ({e}). Falling back to LocalStorage.")
    else:
        print("INFO: ⚠️ CLOUDINARY_URL not set — using local filesystem storage (files will be lost on restart).")
    return LocalStorage()


def _make_thumbnail_storage() -> StorageBackend:
    if settings.use_cloudinary:
        try:
            return CloudinaryThumbnailStorage()
        except Exception:
            return ThumbnailStorage()
    return ThumbnailStorage()


# Singleton instances — imported everywhere
storage = _make_storage()
thumbnail_storage = _make_thumbnail_storage()
