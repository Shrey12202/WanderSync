"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """App settings — reads from environment variables / .env file.

    Production (Render) sets DATABASE_URL, CORS_ORIGINS, etc. as env vars.
    Local dev reads from a .env file in the backend directory.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Render injects DATABASE_URL automatically.
    database_url: str = "postgresql+asyncpg://worldmap:worldmap_dev_password@localhost:5432/worldmap"

    upload_dir: str = "./uploads"
    cors_origins: str = "http://localhost:3000"
    max_upload_size: int = 50 * 1024 * 1024  # 50MB

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def async_database_url(self) -> str:
        """Return an asyncpg-compatible database URL."""
        url = self.database_url
        
        # Strip channel_binding if present (sometimes causes issues with asyncpg)
        if "channel_binding=" in url:
            import re
            url = re.sub(r'[&?]channel_binding=[^&]*', '', url)

        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        # Ensure asyncpg is the dialect
        if "postgresql+asyncpg://" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://")
            
        return url


settings = Settings()
