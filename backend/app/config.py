"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """App settings — reads from .env file automatically."""

    database_url: str = "postgresql+asyncpg://worldmap:worldmap_dev_password@localhost:5432/worldmap"
    upload_dir: str = "./uploads"
    cors_origins: str = "http://localhost:3000"
    max_upload_size: int = 50 * 1024 * 1024  # 50MB

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
