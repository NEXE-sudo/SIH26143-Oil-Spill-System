from __future__ import annotations

import os
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

JWT_SECRET = (
    os.getenv("SUPABASE_JWT_SECRET")
    or os.getenv("JWT_SECRET")
    or os.getenv("SUPABASE_AUTH_JWT_SECRET")
)
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("SUPABASE_PROJECT_URL")
SUPABASE_JWKS_URL = (
    os.getenv("SUPABASE_JWKS_URL")
    or (f"{SUPABASE_URL}/auth/v1/keys" if SUPABASE_URL else None)
)

bearer_scheme = HTTPBearer(auto_error=False)


def _local_dev_payload() -> dict[str, Any]:
    return {"sub": "local-dev", "role": "dev", "email": "local@dev"}


def verify_token(token: str) -> dict[str, Any]:
    """Validate a Supabase JWT when the project secret/JWKS is configured.

    If neither a JWT secret nor a JWKS URL is configured, we fall back to a
    local-development mode so the app remains usable in a simple local setup.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    if not JWT_SECRET and not SUPABASE_JWKS_URL:
        return _local_dev_payload()

    try:
        if JWT_SECRET:
            return jwt.decode(
                token,
                JWT_SECRET,
                algorithms=["HS256"],
                options={"require": ["exp", "sub"]},
            )

        if not SUPABASE_JWKS_URL:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase JWKS is not configured.",
            )

        jwks_client = PyJWKClient(SUPABASE_JWKS_URL)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"require": ["exp", "sub"]},
        )
    except Exception as exc:  # pragma: no cover - runtime validation path
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    return verify_token(credentials.credentials)
