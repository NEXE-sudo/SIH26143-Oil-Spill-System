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
LOCAL_DEV_MODE = os.getenv("APP_ENV", "development").lower() == "development" or not bool(
    JWT_SECRET or SUPABASE_JWKS_URL
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

    if LOCAL_DEV_MODE:
        return _local_dev_payload()

    try:
        unverified_header = jwt.get_unverified_header(token)
        token_alg = unverified_header.get("alg", "HS256")
        allowed_algorithms = list(dict.fromkeys([
            token_alg,
            "HS256", "HS384", "HS512",
            "RS256", "RS384", "RS512",
            "ES256", "ES384", "ES512"
        ]))
        allowed_algorithms = [a for a in allowed_algorithms if a]

        decode_options = {"verify_aud": False, "require": ["exp", "sub"]}
        is_asymmetric = any(token_alg.startswith(prefix) for prefix in ("RS", "ES", "PS", "Ed"))

        if is_asymmetric and SUPABASE_JWKS_URL:
            jwks_client = PyJWKClient(SUPABASE_JWKS_URL)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=allowed_algorithms,
                options=decode_options,
            )

        if JWT_SECRET and not is_asymmetric:
            import base64

            secrets_to_try = [JWT_SECRET]
            try:
                padded = JWT_SECRET + "=" * (-len(JWT_SECRET) % 4)
                secrets_to_try.append(base64.b64decode(padded))
                secrets_to_try.append(base64.urlsafe_b64decode(padded))
            except Exception:
                pass

            last_exc = None
            for sec in secrets_to_try:
                try:
                    return jwt.decode(
                        token,
                        sec,
                        algorithms=allowed_algorithms,
                        options=decode_options,
                    )
                except jwt.InvalidSignatureError as err:
                    last_exc = err
                    continue
                except Exception as err:
                    last_exc = err
                    break
            else:
                if not SUPABASE_JWKS_URL and last_exc:
                    raise last_exc

        if SUPABASE_JWKS_URL:
            jwks_client = PyJWKClient(SUPABASE_JWKS_URL)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=allowed_algorithms,
                options=decode_options,
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No valid verification configuration available.",
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - runtime validation path
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials is None or not credentials.credentials:
        if LOCAL_DEV_MODE:
            return _local_dev_payload()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    if LOCAL_DEV_MODE:
        return _local_dev_payload()

    return verify_token(credentials.credentials)
