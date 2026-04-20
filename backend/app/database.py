"""Database engine and session management."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Async engine for PostgreSQL.
# Uses async_database_url which normalises the scheme for asyncpg,
# and keeps pool small enough to fit inside free-tier DB connection limits.
engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_size=5,       # Free tier DBs (Neon, Supabase) cap at ~20 connections
    max_overflow=10,
    pool_pre_ping=True,  # Helps recover from idle-timeout disconnects on free tier
    # Neon/Supabase require SSL. asyncpg uses the 'ssl' argument.
    connect_args={"ssl": True} if "localhost" not in settings.database_url else {}
)

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db():
    """Dependency that yields a database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
