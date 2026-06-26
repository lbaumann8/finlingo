"""Tiny PostgREST client for the server-side unit-jobs store.

Uses the Supabase SERVICE ROLE key, which bypasses RLS. This module must only
ever run inside Vercel server functions — never shipped to the browser. The
service-role key is read from SUPABASE_SERVICE_ROLE_KEY and is never returned to
any caller.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

from _lib.common import env


class SupabaseError(RuntimeError):
    pass


def configured():
    return bool(_base_url() and _service_key())


def _base_url():
    url = env("SUPABASE_URL", "").strip().rstrip("/")
    return url


def _service_key():
    # Accept a couple of conventional names so deployment is forgiving.
    return (
        env("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or env("SUPABASE_SERVICE_KEY", "").strip()
    )


def _headers(extra=None):
    key = _service_key()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _request(method, path, query=None, body=None, prefer=None, timeout=12):
    if not configured():
        raise SupabaseError("Supabase is not configured")
    url = f"{_base_url()}/rest/v1/{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query, safe="*().,:")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    extra = {"Prefer": prefer} if prefer else None
    request = urllib.request.Request(url, data=data, method=method, headers=_headers(extra))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return []
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SupabaseError(f"Supabase {method} {path} failed ({exc.code}): {detail[:300]}") from exc
    except (TimeoutError, OSError) as exc:
        raise SupabaseError(f"Supabase {method} {path} network error: {exc}") from exc


def select(table, query=None, timeout=12):
    return _request("GET", table, query=query, timeout=timeout)


def insert(table, row, timeout=12):
    rows = _request("POST", table, body=row, prefer="return=representation", timeout=timeout)
    return rows[0] if rows else None


def update(table, query, patch, timeout=12):
    """PATCH rows matching `query`; returns the updated rows (representation)."""
    return _request("PATCH", table, query=query, body=patch, prefer="return=representation", timeout=timeout)


def delete(table, query, timeout=12):
    return _request("DELETE", table, query=query, timeout=timeout)
