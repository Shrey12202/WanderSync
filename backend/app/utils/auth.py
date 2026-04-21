"""
Clerk JWT authentication dependency for FastAPI.

Verifies the Clerk session token from the Authorization header
and returns the user_id (sub claim).
"""

import os
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError


# Clerk's JWKS endpoint -- we fetch public keys to verify tokens
_CLERK_JWKS_URL: Optional[str] = None
_JWKS_CACHE: Optional[dict] = None


def _get_jwks_url() -> str:
    """Build the Clerk JWKS URL from the issuer env var."""
    issuer = os.environ.get("CLERK_ISSUER_URL", "")
    if not issuer:
        raise RuntimeError("CLERK_ISSUER_URL environment variable is not set.")
    return f"{issuer.rstrip('/')}/.well-known/jwks.json"


async def _fetch_jwks() -> dict:
    """Fetch and cache Clerk's public JWKS."""
    global _JWKS_CACHE
    if _JWKS_CACHE:
        return _JWKS_CACHE
    async with httpx.AsyncClient() as client:
        resp = await client.get(_get_jwks_url(), timeout=10)
        resp.raise_for_status()
        _JWKS_CACHE = resp.json()
    return _JWKS_CACHE


def _find_key(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def get_current_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    FastAPI dependency — extracts and verifies the Clerk JWT.

    Returns the Clerk user ID (sub claim) on success.
    Raises HTTP 401 on missing/invalid token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        # Decode header only to get kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        jwks = await _fetch_jwks()
        key_data = _find_key(jwks, kid)

        if not key_data:
            # Invalidate cache and retry once
            global _JWKS_CACHE
            _JWKS_CACHE = None
            jwks = await _fetch_jwks()
            key_data = _find_key(jwks, kid)

        if not key_data:
            raise HTTPException(status_code=401, detail="Public key not found")

        issuer = os.environ.get("CLERK_ISSUER_URL", "").rstrip("/")
        payload = jwt.decode(
            token,
            key_data,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't set aud by default
            issuer=issuer,
        )

        user_id: str = payload.get("sub", "")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        return user_id

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
