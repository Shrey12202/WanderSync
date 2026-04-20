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
        """Extremely robust CORS parsing."""
        val = self.cors_origins or ""
        # Split by comma, strip whitespace, strip trailing slashes, remove empty strings
        origins = [o.strip().rstrip('/') for o in val.split(",") if o.strip()]
        
        # If absolutely nothing is set, default to a safe-ish list
        if not origins:
            return ["http://localhost:3000"]
        return origins

    @property
    def async_database_url(self) -> str:
        """Return an asyncpg-compatible database URL."""
        url = self.database_url
        
        # 1. Standardise the scheme
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        # 2. Strip problematic query parameters that asyncpg doesn't support
        # (sslmode and channel_binding cause TypeError in asyncpg)
        if "?" in url:
            base_url, query_params = url.split("?", 1)
            params = [p for p in query_params.split("&") 
                     if not p.startswith("sslmode=") and not p.startswith("channel_binding=")]
            url = f"{base_url}?{'&'.join(params)}" if params else base_url
            
        return url


settings = Settings()
