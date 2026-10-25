"""Talks to the userside backend for outbound campaign calls."""
import requests

from . import config


def _headers():
    return {"X-Internal-Token": config.internal_token()}


def call_context(contact_id):
    """{"greeting": ..., "system_prompt": ...} for this contact."""
    resp = requests.get(f"{config.BACKEND_URL}/api/internal/calls/{contact_id}/context",
                        headers=_headers(), timeout=5)
    resp.raise_for_status()
    return resp.json()


def report_result(contact_id, turns, duration_seconds, error=""):
    resp = requests.post(
        f"{config.BACKEND_URL}/api/internal/calls/{contact_id}/result",
        headers=_headers(), timeout=5,
        json={"turns": [{"user": t["user"], "agent": t["agent"]} for t in turns],
              "duration_seconds": int(duration_seconds), "error": error},
    )
    resp.raise_for_status()
