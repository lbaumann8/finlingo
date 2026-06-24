import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeSecretKey) throw new Error('Missing STRIPE_SECRET_KEY')
if (!stripeWebhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
if (!supabaseServiceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const stripe = new Stripe(stripeSecretKey, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2023-10-16',
})

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const PRICE_TIER_MAP: Record<string, string> = {
  'price_1TBOz4KGlwVVr9R2Jjlfzt2R': 'gold',
  'price_1TBP05KGlwVVr9R2Zwga7w2T': 'platinum',
}

const STREAK_REPAIR_PRICE_ID = 'price_1TBjxlKGlwVVr9R2duOy8NWr'

function parseStructured<T>(value: T | string | null | undefined): T | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value as T
}

async function handleStreakRepair(session: Stripe.Checkout.Session, userId: string) {
  const { data: progress, error: progressError } = await supabase
    .from('progress')
    .select('streak, streak_date, rewards_summary')
    .eq('user_id', userId)
    .maybeSingle()

  if (progressError) {
    console.error('Failed to load progress for streak repair:', progressError)
    return new Response('Database error', { status: 500 })
  }

  if (!progress) {
    return new Response(JSON.stringify({ received: true, skipped: 'no_progress_row' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  const rewardsSummary = parseStructured<Record<string, unknown>>(progress.rewards_summary) || {}
  const repairState = (rewardsSummary.streakRepair || null) as Record<string, unknown> | null

  if (!repairState?.offerId) {
    return new Response(JSON.stringify({ received: true, skipped: 'no_repair_offer' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  if (repairState.restoredSessionId === session.id || repairState.restoredOfferId === repairState.offerId) {
    return new Response(JSON.stringify({ received: true, skipped: 'already_restored' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  if (repairState.status === 'declined' || repairState.status === 'expired') {
    return new Response(JSON.stringify({ received: true, skipped: 'repair_closed' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  const restoredStreak = Math.max(
    Number(repairState.originalStreak) || 0,
    Number(progress.streak) || 0
  )
  const restoredDate = String(repairState.resumeFromDate || repairState.missedDate || progress.streak_date || '')
  const nextRewardsSummary = {
    ...rewardsSummary,
    streakRepair: {
      ...repairState,
      status: 'restored',
      pendingCheckout: false,
      restoredAt: new Date().toISOString(),
      restoredSessionId: session.id,
      restoredOfferId: repairState.offerId,
      restoredStreak,
    },
  }

  const { error: updateError } = await supabase
    .from('progress')
    .update({
      streak: restoredStreak,
      streak_date: restoredDate || progress.streak_date,
      rewards_summary: nextRewardsSummary,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    console.error('Failed to apply streak repair:', updateError)
    return new Response('Database error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true, repaired: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSecret
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Webhook signature verification failed:', message)
    return new Response(`Webhook signature error: ${message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id

    if (!userId) {
      return new Response(JSON.stringify({ received: true, skipped: 'no_user_id' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let tier: string | null = session.metadata?.tier ?? null
    let isStreakRepair = session.metadata?.purchase === 'streak_repair'

    if (!tier && !isStreakRepair) {
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 5,
        })

        for (const item of lineItems.data) {
          const priceId = item.price?.id
          if (priceId && PRICE_TIER_MAP[priceId]) {
            tier = PRICE_TIER_MAP[priceId]
            break
          }
          if (priceId === STREAK_REPAIR_PRICE_ID) {
            isStreakRepair = true
            break
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Failed to list line items:', message)
      }
    }

    if (isStreakRepair) {
      return await handleStreakRepair(session, userId)
    }

    if (!tier) {
      return new Response('Could not determine tier', { status: 400 })
    }

    if (!['gold', 'platinum'].includes(tier)) {
      return new Response('Invalid tier', { status: 400 })
    }

    const { error } = await supabase
      .from('progress')
      .update({
        tier,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to update tier:', error)
      return new Response('Database error', { status: 500 })
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
