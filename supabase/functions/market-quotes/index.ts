const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYMBOL_MAP: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  const symbols = (url.searchParams.get('symbols') || '')
    .split(',')
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean)

  if (!symbols.length) {
    return json({ error: 'Missing symbols query param' }, 400)
  }

  if (!finnhubApiKey) {
    return json({ error: 'Missing FINNHUB_API_KEY' }, 503)
  }

  const fetchedAt = new Date().toISOString()
  const pairs = await Promise.all(symbols.map(async symbol => {
    const providerSymbol = SYMBOL_MAP[symbol] || symbol
    const endpoint = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(providerSymbol)}&token=${encodeURIComponent(finnhubApiKey)}`

    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`Quote request failed with ${res.status}`)

      const quote = await res.json()
      const price = Number(quote?.c)
      const previousClose = Number(quote?.pc)
      if (!Number.isFinite(price) || price <= 0) return [symbol, null] as const

      const changePct = Number.isFinite(previousClose) && previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : 0

      return [symbol, {
        symbol,
        price,
        previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
        dailyChangePct: changePct,
        asOf: fetchedAt,
        provider: 'finnhub',
      }] as const
    } catch (err) {
      console.error(`Failed to fetch quote for ${symbol}:`, err)
      return [symbol, null] as const
    }
  }))

  const quotes = Object.fromEntries(pairs.filter(([, quote]) => quote))
  if (!Object.keys(quotes).length) {
    return json({ error: 'No quotes available' }, 502)
  }

  return json({
    provider: 'finnhub',
    fetchedAt,
    quotes,
  })
})
