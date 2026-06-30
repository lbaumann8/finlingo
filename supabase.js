// ============================================================
// supabase.js
// Supabase REST API wrapper with proper token management.
//
// TOKEN LIFECYCLE:
//   1. authSignIn / authSignUp return { access_token, refresh_token, expires_in }
//   2. auth.js calls setStoredSession() immediately after a successful auth call
//   3. Every sbGet/sbPost/etc call goes through getAuthHeaders()
//      which reads the stored token and refreshes it if it is close to expiry
//   4. profile.js calls clearStoredSession() on sign-out
//   5. app.js calls restoreSession() on boot to silently refresh an expired token
//
// PUBLIC FUNCTIONS:
//   setStoredSession(session)           — save tokens from auth response
//   clearStoredSession()               — remove tokens (sign-out)
//   restoreSession()                   — called on boot, refreshes if needed
//   sbGet(table, query)                — SELECT rows
//   sbPost(table, body)                — INSERT a row
//   sbPatch(table, query, body)        — UPDATE rows
//   sbUpsert(table, body)              — INSERT or UPDATE
//   authSignUp(email, password)        — create Supabase Auth user
//   authSignIn(email, password)        — sign in, returns full session
//   authRequestPasswordReset(email)    — send password-reset email
//   authUpdatePassword(token, password)— set new password using recovery token
// ============================================================

// ── CONNECTION DETAILS ────────────────────────────────────────
const SB_URL  = 'https://mxvhrzzjdjwidhgmgnnf.supabase.co';
const SB_KEY  = 'sb_publishable_pJIQX7EkN10ZFHh6-kaoTA_65EWrSCe';
const SB_AUTH = `${SB_URL}/auth/v1`;

// Production site the confirmation/OAuth links should return to.
// This MUST be listed in Supabase → Authentication → URL Configuration
// (Site URL + Redirect URLs) or Supabase will reject it and fall back.
const SB_SITE_URL = 'https://learnfinlingo.online';

/**
 * Where Supabase email links (confirmation, etc.) should send the user.
 * On localhost we return the local origin so dev testing lands back locally;
 * everywhere else we use the canonical production URL so we never ship a
 * localhost redirect to real users. The landing hash is consumed by the
 * detectOAuthSession() handler in auth.js, which stores the session.
 */
function authEmailRedirectTo() {
  const origin = window.location.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin)) {
    return origin + window.location.pathname;
  }
  return SB_SITE_URL;
}

// ── TOKEN STORAGE KEYS ────────────────────────────────────────
const TOKEN_KEY         = 'finlingo_access_token';
const REFRESH_TOKEN_KEY = 'finlingo_refresh_token';
const TOKEN_EXPIRY_KEY  = 'finlingo_token_expires_at';
const AUTH_USER_ID_KEY  = 'finlingo_auth_user_id';
const AUTH_USER_EMAIL_KEY = 'finlingo_auth_user_email';

// Refresh the token this many ms before it expires (5 min buffer)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;


// ── TOKEN STORAGE ─────────────────────────────────────────────

/**
 * Save the full auth session to localStorage.
 * Must be called immediately after authSignIn or authSignUp succeeds,
 * BEFORE any sbGet / sbPost calls.
 */
function setStoredSession(session) {
  const accessToken  = session.access_token;
  const refreshToken = session.refresh_token;
  const expiresIn    = session.expires_in || 3600;

  if (!accessToken) {
    // Expected when email confirmation is ON and the user
    // hasn't yet clicked the confirmation link.
    console.warn('setStoredSession: no access_token — email confirmation may be pending');
    return;
  }

  const expiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem(TOKEN_KEY,         accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken || '');
  localStorage.setItem(TOKEN_EXPIRY_KEY,  String(expiresAt));
  if (session.user?.id) {
    localStorage.setItem(AUTH_USER_ID_KEY, session.user.id);
    localStorage.setItem(AUTH_USER_EMAIL_KEY, session.user.email || '');
  }
}

/** Remove all stored tokens. Call on sign-out. */
function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(AUTH_USER_ID_KEY);
  localStorage.removeItem(AUTH_USER_EMAIL_KEY);
}

/**
 * Read the current stored session from localStorage.
 * @returns {{ accessToken, refreshToken, expiresAt } | null}
 */
function getStoredSession() {
  const accessToken  = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || '';
  const expiresAt    = Number(localStorage.getItem(TOKEN_EXPIRY_KEY)) || 0;
  if (!accessToken) return null;
  return { accessToken, refreshToken, expiresAt };
}

/** Read the last known authenticated user snapshot saved with the session. */
function getStoredSessionUser() {
  const id = localStorage.getItem(AUTH_USER_ID_KEY);
  if (!id) return null;
  return {
    id,
    email: localStorage.getItem(AUTH_USER_EMAIL_KEY) || ''
  };
}


// ── TOKEN REFRESH ─────────────────────────────────────────────

/**
 * Exchange the stored refresh token for a new access token.
 * Clears session on failure so the user is prompted to sign in again.
 * @returns {string | null}
 */
async function refreshAccessToken() {
  const session = getStoredSession();
  if (!session?.refreshToken) {
    console.warn('refreshAccessToken: no refresh token — clearing session');
    clearStoredSession();
    return null;
  }

  let res, data;
  try {
    res = await fetch(`${SB_AUTH}/token?grant_type=refresh_token`, {
      method:  'POST',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refreshToken })
    });
    data = await res.json();
  } catch (err) {
    // Network error — keep existing token in case we're back online soon
    console.warn('refreshAccessToken: network error, keeping existing token:', err.message);
    return session.accessToken;
  }

  if (!res.ok) {
    // Refresh token expired (Supabase default: 60 days) or revoked
    console.warn('refreshAccessToken: rejected, clearing session:', data);
    clearStoredSession();
    return null;
  }

  setStoredSession(data);
  console.log('✅ Token refreshed successfully');
  return data.access_token;
}

/**
 * Returns a valid access token, refreshing proactively if near expiry.
 * @returns {string | null}
 */
async function getValidToken() {
  const session = getStoredSession();
  if (!session) return null;
  const isExpiringSoon = (session.expiresAt - Date.now()) < REFRESH_BUFFER_MS;
  if (isExpiringSoon) return await refreshAccessToken();
  return session.accessToken;
}


// ── HEADERS ───────────────────────────────────────────────────

/**
 * Build request headers using the current user token.
 * Falls back to the anon key for unauthenticated requests.
 * @returns {Promise<object>}
 */
async function getAuthHeaders() {
  const token = await getValidToken();
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${token || SB_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation'
  };
}


// ── SESSION RESTORE (called once on boot by app.js) ───────────

/**
 * Checks for a stored token and silently refreshes if expired.
 * Only handles the token — does not affect S.user in state.js.
 * @returns {Promise<boolean>}
 */
async function restoreSession() {
  const session = getStoredSession();
  if (!session) return false;

  const isExpired = session.expiresAt < Date.now();
  if (isExpired) {
    console.log('restoreSession: token expired, refreshing...');
    const newToken = await refreshAccessToken();
    if (!newToken) {
      console.warn('restoreSession: refresh failed — next DB call will use anon key');
      return false;
    }
    console.log('✅ restoreSession: token refreshed on boot');
    return true;
  }

  const mins = Math.round((session.expiresAt - Date.now()) / 60000);
  console.log(`✅ restoreSession: valid token found (${mins} min remaining)`);
  return true;
}


// ── CRUD HELPERS ──────────────────────────────────────────────

/** SELECT rows. */
async function sbGet(table, query = '') {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, { headers });
  if (!res.ok) throw new Error(`sbGet ${table}: ${res.status}`);
  return res.json();
}

/** INSERT a row. */
async function sbPost(table, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`sbPost ${table}: ${res.status} ${err}`);
  }
  return res.json();
}

/** UPDATE rows. */
async function sbPatch(table, query, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, {
    method:  'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body:    JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`sbPatch ${table}: ${res.status}`);
  return res.json();
}

/** INSERT or UPDATE. Uses merge-duplicates to prevent 409 conflicts. */
async function sbUpsert(table, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body:    JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`sbUpsert ${table}: ${res.status}`);
  return res.json();
}


// ── TIER FETCH ────────────────────────────────────────────────
/**
 * Read the authoritative tier for a user from Supabase.
 * Called on boot and after a Stripe payment return to sync
 * local state with the database source of truth.
 *
 * Returns the tier string ('standard' | 'gold' | 'platinum'),
 * or null on network error (caller keeps existing local state).
 *
 * @param {string} userId — Supabase user UUID from S.user.id
 * @returns {Promise<string|null>}
 */
async function fetchTierFromSupabase(userId) {
  if (!userId) return null;
  try {
    const rows = await sbGet('progress', `?user_id=eq.${userId}&select=tier`);
    return rows?.[0]?.tier || 'standard';
  } catch (err) {
    console.warn('fetchTierFromSupabase: could not reach Supabase, keeping local tier:', err.message);
    return null; // null = don't override local state
  }
}

/**
 * Read the current authenticated user from Supabase Auth.
 * Used on boot when we have tokens but local app identity is missing.
 */
async function authGetCurrentUser() {
  const token = await getValidToken();
  if (!token) return null;

  try {
    const res = await fetch(`${SB_AUTH}/user`, {
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ? data : null;
  } catch (err) {
    console.warn('authGetCurrentUser: could not resolve current user:', err.message);
    return null;
  }
}


// ── AUTH HELPERS ──────────────────────────────────────────────
// Network errors and auth errors are separated into distinct
// try/catch blocks so the caller always gets a meaningful message.

/**
 * Register a new user via Supabase Auth.
 *
 * WITH EMAIL CONFIRMATION ON:
 *   Returns { id, email, confirmation_sent_at, ... } with NO access_token.
 *   auth.js detects this and shows the "check your email" screen.
 *   No DB rows are written during signup.
 *
 * WITHOUT EMAIL CONFIRMATION:
 *   Returns { access_token, refresh_token, user: {...}, ... }.
 *   auth.js stores the token and writes DB rows immediately.
 */
async function authSignUp(email, password) {
  // Confirmation-link destination. Passed as a query param (GoTrue reads
  // redirect_to from the URL, not the body) so the email points at production
  // instead of whatever Site URL default the dashboard happens to hold.
  const redirectTo = authEmailRedirectTo();

  // Step 1: network call only — catches true network failures separately
  let res;
  try {
    res = await fetch(`${SB_AUTH}/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method:  'POST',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,  // ← required for new key format
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ email, password })
    });
  } catch (err) {
    // fetch() threw before getting any response.
    // Most common cause during testing: Supabase's 3-emails/hour rate limit.
    // A 429 rate-limit response often omits CORS headers, so the browser
    // treats it as a network error rather than exposing the response body.
    // Less common causes: project paused, no internet, wrong URL.
    console.error('authSignUp network error:', err);
    throw new Error(
      'SIGNUP_NETWORK_BLOCKED'
    );
  }

  // Step 2: parse response body
  const data = await res.json();
  console.log('authSignUp response:', res.status, {
    id:                   data.id,
    email:                data.email,
    confirmation_sent_at: data.confirmation_sent_at || '⚠️ NOT SET — email may not have been queued',
    email_confirmed_at:   data.email_confirmed_at   || 'not confirmed yet',
    has_access_token:     !!data.access_token
  });
  if (!data.confirmation_sent_at && !data.access_token) {
    console.warn('authSignUp: confirmation_sent_at is absent — check Supabase email settings and rate limits');
  }

  // Step 3: check for auth-level rejection from Supabase
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || data.msg || `Signup failed (${res.status})`
    );
  }

  return data;
}

/**
 * Re-send the signup confirmation email for an address that has signed up
 * but not yet verified. REST equivalent of supabase.auth.resend({ type:'signup' }).
 *
 * GoTrue endpoint: POST /resend with body { type:'signup', email } and the
 * confirmation destination passed as ?redirect_to=… (same as signup).
 *
 * Throws a meaningful Error on failure so the caller can render it inline:
 *   - 'RESEND_RATE_LIMIT'  → 429 / "security purposes" / "too many" / cooldown
 *   - 'RESEND_NETWORK'     → fetch() threw before any response
 *   - otherwise the human-readable message Supabase returned
 *
 * Resolves true on success (Supabase returns 200 with an empty/minimal body).
 */
async function authResendConfirmation(email) {
  const redirectTo = authEmailRedirectTo();

  let res;
  try {
    res = await fetch(`${SB_AUTH}/resend?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method:  'POST',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ type: 'signup', email })
    });
  } catch (err) {
    console.error('authResendConfirmation network error:', err);
    throw new Error('RESEND_NETWORK');
  }

  const data = await res.json().catch(() => ({}));
  console.log('authResendConfirmation response:', res.status, {
    email,
    ok: res.ok,
    message: data.error_description || data.error || data.msg || null
  });

  if (!res.ok) {
    const rawMsg = (data.error_description || data.error || data.msg || '').toLowerCase();
    const isRateLimit = res.status === 429
      || rawMsg.includes('rate limit')
      || rawMsg.includes('security purposes')
      || rawMsg.includes('too many')
      || rawMsg.includes('after');           // "For security purposes… after N seconds"
    if (isRateLimit) throw new Error('RESEND_RATE_LIMIT');

    throw new Error(
      data.error_description || data.error || data.msg || `Resend failed (${res.status})`
    );
  }

  console.log('✅ authResendConfirmation: confirmation email re-sent to', email);
  return true;
}

/**
 * Sign in an existing verified user.
 * Always returns { access_token, refresh_token, expires_in, user: {...} }.
 */
async function authSignIn(email, password) {
  // Step 1: network call
  let res;
  try {
    res = await fetch(`${SB_AUTH}/token?grant_type=password`, {
      method:  'POST',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ email, password })
    });
  } catch (err) {
    console.error('authSignIn network error:', err);
    throw new Error(
      'Could not reach Supabase. Check your internet connection or visit supabase.com/dashboard to confirm your project is active.'
    );
  }

  // Step 2: parse response
  const data = await res.json();
  console.log('authSignIn response:', res.status, {
    user_id:     data.user?.id || null,
    email:       data.user?.email || email,
    expires_in:  data.expires_in || null,
    token_found: !!data.access_token
  });

  // Step 3: check for auth-level rejection
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || data.msg || `Auth failed (${res.status})`
    );
  }

  return data;
}

/**
 * Send a password-reset email to the given address.
 *
 * Supabase always returns 200 for this endpoint, even if the email is
 * not registered — this is intentional (prevents user enumeration).
 *
 * The email contains a link pointing back to this app's origin with
 * a URL hash of the form:
 *   #access_token=TOKEN&refresh_token=RTOKEN&type=recovery
 *
 * auth.js detects this hash on page load and enters 'reset' mode.
 *
 * IMPORTANT: The redirect origin must be added to the Supabase dashboard
 * under Authentication → URL Configuration → Redirect URLs.
 * For Live Server local testing add: http://localhost:5500
 * and/or: http://127.0.0.1:5500
 */
/**
 * Send a password-reset email to the given address.
 *
 * Retries once after 3 s on a network-level failure.
 * This handles Supabase free-tier cold-start, where the first request
 * times out while the project wakes up, then the second succeeds.
 *
 * If the retry hits a rate limit (429 / "security purposes"), the first
 * request almost certainly went through — we treat that as success.
 *
 * Supabase always returns 200 for valid requests (even unknown emails).
 * IMPORTANT: redirect_to must be listed in Supabase → Auth → URL Configuration.
 * For Live Server add: http://127.0.0.1:5500 and http://localhost:5500
 */
async function authRequestPasswordReset(email) {
  const redirectTo = window.location.origin + window.location.pathname;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await fetch(`${SB_AUTH}/recover`, {
        method:  'POST',
        headers: {
          'apikey':        SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ email, redirect_to: redirectTo })
      });
    } catch (err) {
      if (attempt === 1) {
        // Network error on first attempt — likely Supabase cold-start (free tier waking up).
        // Wait 3 s and retry once. Button stays in "Sending…" so the user sees nothing unusual.
        console.warn(
          'authRequestPasswordReset: attempt 1 network error — possible cold-start, retrying in 3 s…',
          err.message
        );
        await new Promise(r => setTimeout(r, 3000));
        continue; // → attempt 2
      }
      // Both attempts failed — genuine network problem.
      console.error('authRequestPasswordReset: both attempts failed:', err);
      throw new Error(
        'Could not reach Supabase. Check your internet connection or visit supabase.com/dashboard to confirm your project is active.'
      );
    }

    // Got an HTTP response — check status.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`authRequestPasswordReset attempt ${attempt}:`, res.status, data);

      const rawMsg = (data.error_description || data.error || data.msg || '').toLowerCase();
      const isRateLimit = res.status === 429
        || rawMsg.includes('rate limit')
        || rawMsg.includes('security purposes')
        || rawMsg.includes('too many');

      if (isRateLimit && attempt === 2) {
        // Rate limit on the retry: the first attempt likely went through even though
        // we got a network error. Treat this as success — the email was sent.
        console.log(
          'authRequestPasswordReset: rate limit on retry — first attempt likely succeeded.',
          'Treating as success.'
        );
        return true;
      }

      if (isRateLimit) {
        throw new Error('RESET_EMAIL_RATE_LIMIT');
      }

      throw new Error(
        data.error_description || data.error || data.msg || `Reset request failed (${res.status})`
      );
    }

    console.log(`✅ authRequestPasswordReset: reset email sent to ${email} (attempt ${attempt})`);
    return true;
  }
  // Supabase returns 200 for valid requests (even unknown emails).
  // 429 means the email rate limit (3/hour on free tier) has been hit.
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('authRequestPasswordReset error:', res.status, data);

    const rawMsg = (data.error_description || data.error || data.msg || '').toLowerCase();
    const isRateLimit = res.status === 429
      || rawMsg.includes('rate limit')
      || rawMsg.includes('security purposes')
      || rawMsg.includes('too many');

    if (isRateLimit) {
      throw new Error('RESET_EMAIL_RATE_LIMIT');
    }

    throw new Error(
      data.error_description || data.error || data.msg || `Reset request failed (${res.status})`
    );
  }

  console.log('✅ authRequestPasswordReset: reset email sent to', email);
  return true;
}

/**
 * Set a new password using the short-lived recovery token from the
 * reset email. The token is a one-time-use JWT — it expires after use
 * or after 1 hour, whichever comes first.
 *
 * On success Supabase returns a full session object
 * ({ access_token, refresh_token, user, ... }) which auth.js should
 * pass to setStoredSession() so the user is immediately logged in.
 */
async function authUpdatePassword(recoveryToken, newPassword) {
  let res;
  try {
    res = await fetch(`${SB_AUTH}/user`, {
      method:  'PUT',
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${recoveryToken}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    });
  } catch (err) {
    console.error('authUpdatePassword network error:', err);
    throw new Error(
      'Could not reach Supabase. Check your internet connection.'
    );
  }

  const data = await res.json();
  console.log('authUpdatePassword response:', res.status, {
    user_id:     data.user?.id || null,
    email:       data.user?.email || null,
    expires_in:  data.expires_in || null,
    token_found: !!data.access_token
  });

  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || data.msg || `Password update failed (${res.status})`
    );
  }

  return data; // full session — pass straight to setStoredSession()
}
