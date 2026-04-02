"""
Abstracted file storage service.

MVP uses local filesystem. The abstract base class allows easy swap to
Cloudinary, Supabase Storage, S3, etc.
"""

import os
import uuid
import aiofiles
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.config import settings


class StorageBackend(ABC):
    """Abstract storage interface for future cloud upgrades."""

    @abstractmethod
    async def save(self, file_bytes: bytes, filename: str, subdir: str = "") -> str:
        """Save file and return the relative path."""
        ...

    @abstractmethod
    async def delete(self, file_path: str) -> bool:
        """Delete a file. Returns True if successful."""
        ...

    @abstractmethod
    def get_url(self, file_path: str) -> str:
        """Get the URL/path to access the file."""
        ...


class LocalStorage(StorageBackend):
    """Local filesystem storage for MVP."""

    def __init__(self, base_dir: str = None):
        self.base_dir = Path(base_dir or settings.upload_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, file_bytes: bytes, filename: str, subdir: str = "") -> str:
        # Generate unique filename to avoid collisions
        ext = Path(filename).suffix.lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"

        # Create subdirectory if needed
        save_dir = self.base_dir / subdir if subdir else self.base_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        file_path = save_dir / unique_name

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_bytes)

        # Return relative path from base_dir
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


# Singleton instances
storage = LocalStorage()
thumbnail_storage = ThumbnailStorage()
