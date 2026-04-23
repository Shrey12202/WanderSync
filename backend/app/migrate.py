"""
One-time migration: make media.trip_id nullable + add media.user_id column.

Run this ONCE on your Neon DB, then it's safe to run again (idempotent).
Execute via:  python -m app.migrate
OR paste the SQL directly in the Neon SQL editor.
"""
import asyncio
import os
import asyncpg


SQL = """
-- 1. Allow standalone media (no trip attached)
ALTER TABLE media ALTER COLUMN trip_id DROP NOT NULL;

-- 2. Add user_id for direct ownership on standalone uploads
ALTER TABLE media ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

-- 3. Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);

-- 4. Backfill: copy trip owner's user_id into existing media rows
--    so the query OR-condition works even for pre-auth uploads
UPDATE media m
SET user_id = t.user_id
FROM trips t
WHERE m.trip_id = t.id
  AND m.user_id IS NULL
  AND t.user_id IS NOT NULL;
"""


async def run():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        return

    # asyncpg needs postgresql:// not postgres://
    url = db_url.replace("postgres://", "postgresql://")

    print("Connecting to Neon…")
    conn = await asyncpg.connect(url, ssl="require")
    try:
        print("Running migration…")
        await conn.execute(SQL)
        print("✅  Migration complete.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())
