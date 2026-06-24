// supabase/functions/stripe-webhook/index.ts
//
// Receives Stripe webhook events and updates the user's tier
// in the Supabase `progress` table.
//
// TRIGGERED BY: checkout.session.completed
//
// DEPLOY:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// SECRETS (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET   — whsec_...
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Environment variables ────────────────────────────────────
// Read and validate at module load time.
// The `!` assertions below tell TypeScript these are strings after the
// guard throws — needed because TypeScript does not always carry
// const-narrowing into Deno.serve's async callback scope.

const stripeSecretKey      = Deno.env.get('STRIPE_SECRET_KEY')
const stripeWebhookSecret  = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const supabaseUrl          = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeSecretKey)     throw new Error('Missing STRIPE_SECRET_KEY')
if (!stripeWebhookSecret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')
if (!supabaseUrl)         throw new Error('Missing SUPABASE_URL')
if (!supabaseServiceKey)  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

// Non-null assertions: safe because the throws above already guard these.
const SECRET_KEY     = stripeSecretKey!
const WEBHOOK_SECRET = stripeWebhookSecret!

// ── Clients ──────────────────────────────────────────────────

const stripe = new Stripe(SECRET_KEY, {
  // createFetchHttpClient() is required in Deno — the default Node http
  // client is not available in the Edge Function runtime.
  httpClient: Stripe.createFetchHttpClient(),
  // Cast to satisfy Stripe's strict API version union type.
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
})

// Service role client bypasses Row Level Security so we can update
// any user's row without needing their access token.
const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

// ── Price ID → tier map ──────────────────────────────────────
// Used as a fallback when metadata.tier is not set on the session.
// Find Price IDs: Stripe Dashboard → Products → click product → Price ID
// Format: price_xxxxxxxxxxxxxxxxxxxxxxxx
const PRICE_TIER_MAP: Record<string, string> = {
  'price_1TBOz4KGlwVVr9R2Jjlfzt2R':     'gold',
  'price_1TBP05KGlwVVr9R2Zwga7w2Ts': 'platinum',
}

// ── Valid tiers ───────────────────────────────────────────────
const VALID_TIERS = new Set(['gold', 'platinum'])

// ── JSON response helper ──────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {

  // Only accept POST — Stripe always POSTs webhook events
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  // Read raw body — must be the original string for signature verification.
  // Do NOT parse as JSON before this step.
  const body = await req.text()

  // ── Verify the webhook signature ─────────────────────────
  // This is the core security check. Only Stripe can produce a valid
  // signature using your webhook secret. This prevents anyone else
  // from hitting this endpoint and faking a payment completion.
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      WEBHOOK_SECRET,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('❌ Webhook signature verification failed:', message)
    return new Response(`Webhook error: ${message}`, { status: 400 })
  }

  console.log(`📨 Stripe event: ${event.type} (${event.id})`)

  // ── Handle payment completion ─────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // ── Identify the user ─────────────────────────────────
    // client_reference_id is the Supabase user UUID, appended to the
    // Payment Link URL by the app before redirecting:
    //   https://buy.stripe.com/xxx?client_reference_id=SUPABASE_UUID
    const userId = session.client_reference_id

    if (!userId) {
      // This happens if the user was not signed in, or the link was opened
      // without the UUID appended. Return 200 so Stripe does not retry.
      console.warn('⚠️  No client_reference_id on session:', session.id)
      return json({ received: true, skipped: 'no_user_id' })
    }

    // ── Determine the tier ────────────────────────────────
    // Layer 1: metadata set directly on the Payment Link in Stripe Dashboard
    //   Stripe Dashboard → Payment Links → your link → Metadata → tier = gold
    let tier: string | null = session.metadata?.tier ?? null

    // Layer 2: map the purchased Price ID to a tier name
    if (!tier) {
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 5 },
        )
        for (const item of lineItems.data) {
          const priceId = item.price?.id
          if (priceId && PRICE_TIER_MAP[priceId]) {
            tier = PRICE_TIER_MAP[priceId]
            break
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('❌ Failed to list line items:', message)
      }
    }

    if (!tier) {
      // Can't determine tier — log the session for manual review but
      // return 400 (no retry) since retrying won't fix missing metadata.
      console.error('❌ Could not determine tier. Session:', session.id, 'User:', userId)
      return new Response('Could not determine tier', { status: 400 })
    }

    // Reject unexpected tier values — belt-and-suspenders guard
    if (!VALID_TIERS.has(tier)) {
      console.error('❌ Invalid tier value:', tier)
      return new Response('Invalid tier', { status: 400 })
    }

    // ── Update Supabase ───────────────────────────────────
    const { error } = await supabase
      .from('progress')
      .update({
        tier,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (error) {
      // Return 500 so Stripe automatically retries the webhook.
      console.error('❌ Supabase update failed for user', userId, error)
      return new Response('Database error', { status: 500 })
    }

    console.log(`✅ Tier updated → user=${userId} tier=${tier} session=${session.id}`)
  }

  // Return 200 for all other event types — Stripe expects this
  return json({ received: true })
})