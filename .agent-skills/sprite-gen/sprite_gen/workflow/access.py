# SPDX-License-Identifier: Apache-2.0
"""Credential readiness is not proof of a paid subscription or remaining quota."""
from __future__ import annotations

from sprite_gen.gen import codex_provider
from sprite_gen.gen.base import PROVIDER_CODEX, PROVIDER_GROK, PROVIDER_OPENAI
from sprite_gen.gen.openai_provider import AUTH_ENV as OPENAI_AUTH_ENV
from sprite_gen.gen.openai_provider import resolve_credential as resolve_openai_credential
from sprite_gen.gen.xai import AUTH_SOURCE_API_KEY, resolve_credential

# The readings `guide` acts on, each written once: a login that cannot be used, and a route billed per call.
LOGIN_UNAVAILABLE = "unavailable"
BILLING_API_CREDIT = "api-credit"


def probe_access(provider: str) -> dict:
    """One probe per provider: images and videos of a provider share its credential precedence."""
    result = {"provider": provider, "login": "unknown", "subscription": "unknown", "quota": "unknown",
              "billing": "subscription", "reason": "Subscription and media access need user confirmation when not independently known."}
    if provider == PROVIDER_CODEX:
        # The one reading of how codex is signed in; it never repeats what the CLI said.
        login = codex_provider.codex_login()
        if login.source is None:
            return {**result, "login": LOGIN_UNAVAILABLE, "reason": f"{login.reason}; sign in and check again"}
        if login.source == codex_provider.AUTH_SOURCE_API_KEY:
            return {**result, "login": "ready", "billing": BILLING_API_CREDIT,
                    "reason": "codex is signed in with an API key and bills it per call; confirm this billing choice "
                              "or sign in with ChatGPT (`codex login`)."}
        return {**result, "login": "ready"}
    if provider == PROVIDER_OPENAI:
        # An API key is the whole credential: there is no login to inspect and no
        # subscription route to prefer, so readiness is the key's presence and the
        # billing route is always metered API credit.
        try:
            resolve_openai_credential()
        except (SystemExit, OSError, ValueError):
            return {**result, "login": LOGIN_UNAVAILABLE,
                    "reason": f"{OPENAI_AUTH_ENV} is not set; export the key or choose another provider"}
        return {**result, "login": "ready", "billing": BILLING_API_CREDIT,
                "reason": f"OpenAI images will use {OPENAI_AUTH_ENV} and separate API credit; confirm this billing choice."}
    if provider != PROVIDER_GROK:
        raise ValueError(f"unknown provider: {provider}")
    try:
        # Images and videos use the same direct API credential precedence.
        credential = resolve_credential()
    except (SystemExit, OSError, ValueError):
        return {**result, "login": LOGIN_UNAVAILABLE, "reason": "grok credential missing, expired or unreadable; check grok login"}
    if credential.source == AUTH_SOURCE_API_KEY:
        return {**result, "login": "ready", "billing": BILLING_API_CREDIT,
                "reason": "Grok media will use XAI_API_KEY and separate API credit; confirm this billing choice."}
    return {**result, "login": "ready"}
