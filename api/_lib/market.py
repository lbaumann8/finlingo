"""Key-less Yahoo Finance chart proxy (quotes + history).

Identical request/response shapes to the original server.py so the frontend's
market features keep working unchanged. There is no secret here (Yahoo's public
chart API), so nothing is exposed to the browser.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Finlingo/1.0"
_YAHOO_HOST = "https://query1.finance.yahoo.com/v8/finance/chart/"

_CRYPTO = {"BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "LTC", "BCH", "AVAX", "DOT"}

_RANGE_MAP = {
    "1D": ("1d", "5m"),
    "1W": ("5d", "30m"),
    "1M": ("1mo", "60m"),
    "3M": ("3mo", "1d"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
    "MAX": ("max", "1mo"),
}
_RANGE_FALLBACKS = {
    "1M": [("1mo", "1d")],
}


def _upstream_symbol(symbol):
    s = (symbol or "").strip().upper()
    if s in _CRYPTO:
        return f"{s}-USD"
    return s


def _fetch_yahoo(symbol, yrange, interval):
    up = _upstream_symbol(symbol)
    url = f"{_YAHOO_HOST}{urllib.parse.quote(up)}?range={yrange}&interval={interval}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    chart = (payload or {}).get("chart") or {}
    if chart.get("error"):
        raise ValueError(str(chart["error"]))
    results = chart.get("result") or []
    if not results:
        raise ValueError("empty result")
    return results[0]


def _quote_from_result(result):
    meta = result.get("meta") or {}
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose")
    if prev is None:
        prev = meta.get("previousClose")
    if not isinstance(price, (int, float)) or price <= 0:
        raise ValueError("no price")
    prev_val = prev if isinstance(prev, (int, float)) and prev > 0 else price
    change_pct = ((price - prev_val) / prev_val) * 100 if prev_val else 0.0
    return {
        "price": float(price),
        "previousClose": float(prev_val),
        "dailyChangePct": float(change_pct),
        "provider": "yahoo",
    }


def _history_from_result(result):
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    points = []
    for t, c in zip(timestamps, closes):
        if isinstance(t, (int, float)) and t > 0 and isinstance(c, (int, float)):
            points.append({"time": int(t), "value": float(c)})
    if not points:
        raise ValueError("no points")
    return points


def _history_meta_from_result(result):
    meta = result.get("meta") or {}
    open_value = meta.get("regularMarketOpen")
    previous_close = meta.get("chartPreviousClose")
    if previous_close is None:
        previous_close = meta.get("previousClose")
    out = {}
    if isinstance(open_value, (int, float)) and open_value > 0:
        out["marketOpen"] = float(open_value)
    if isinstance(previous_close, (int, float)) and previous_close > 0:
        out["previousClose"] = float(previous_close)
    return out


def handle_quotes(symbols_param):
    """Return (payload, status) for GET /api/quotes?symbols=..."""
    symbols = [s.strip().upper() for s in (symbols_param or "").split(",") if s.strip()]
    if not symbols:
        return {"error": "Missing symbols query param"}, 400
    out = {}
    errors = {}
    for sym in symbols:
        try:
            result = _fetch_yahoo(sym, "1d", "5m")
            q = _quote_from_result(result)
            q["symbol"] = sym
            out[sym] = q
        except Exception as exc:  # noqa: BLE001 - report per-symbol, keep going
            errors[sym] = str(exc)
    if not out:
        return {"error": "No quotes available", "_errors": errors}, 502
    out["_errors"] = errors
    return out, 200


def handle_history(symbol_param, range_param):
    """Return (payload, status) for GET /api/stock-history?symbol=..&range=.."""
    symbol = (symbol_param or "").strip().upper()
    rng = (range_param or "1D").strip().upper()
    if not symbol:
        return {"error": "Missing symbol query param"}, 400
    candidates = [_RANGE_MAP.get(rng, _RANGE_MAP["1D"])] + _RANGE_FALLBACKS.get(rng, [])
    last_error = None
    try:
        result = None
        points = None
        yrange = interval = None
        for candidate_range, candidate_interval in candidates:
            try:
                result = _fetch_yahoo(symbol, candidate_range, candidate_interval)
                points = _history_from_result(result)
                yrange = candidate_range
                interval = candidate_interval
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
        if result is None or points is None:
            raise last_error or ValueError("no points")
        meta = _history_meta_from_result(result)
    except Exception:  # noqa: BLE001
        return {"error": f"Chart data unavailable for {symbol}", "symbol": symbol, "range": rng}, 502
    return {
        "symbol": symbol,
        "range": rng,
        "upstreamRange": yrange,
        "interval": interval,
        "points": points,
        "domainStart": points[0]["time"],
        "domainEnd": points[-1]["time"],
        "provider": "yahoo",
        "pointCount": len(points),
        **meta,
    }, 200
