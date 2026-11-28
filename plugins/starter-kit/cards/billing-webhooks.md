# Card: payments, subscriptions and billing webhooks

**When:** the app takes money: one-off payments, subscriptions, invoices, refunds, or anything driven by a payment provider's
webhooks (Stripe, Paddle, Lemon Squeezy, Square and the like).

## Rules
1. **Prices and totals are computed on the server** from the plan or product id. Never accept an amount from the browser.
2. **The provider is the source of truth for "paid".** Grant access only from a verified webhook or a server-side fetch of the
   payment, never because the browser came back to a "success" page.
3. **Verify every webhook's signature on the raw body** with the signing secret from the environment, and reject old timestamps.
4. **Handle each event once.** Store the provider's event id; a repeated event does nothing. Events can arrive late, twice or out
   of order: compare with the stored state rather than assuming the order.
5. **Answer the webhook fast** (store it, return 200), then do slow work in a background job that retries.
6. **Every failure path has a state the owner can see:** payment failed, card expiring, subscription past due, cancelled at period
   end, refunded, disputed. Each changes access the way the plan says.
7. **Keys:** only the publishable key reaches the browser; secret and webhook keys stay in the environment; develop with test keys.

## Prove it with tests
- A webhook with a wrong signature, no signature, or an old timestamp is refused and changes nothing.
- The same event sent twice gives access once and records one payment.
- A "subscription cancelled" event arriving before the "payment succeeded" event it follows still ends in the right state.
- A request that sends its own price or amount is charged the server's price.
- After a failed renewal the account follows the plan's rule (grace period, read-only, or locked), and the owner can see it.
- A refund removes access or credit exactly as promised, once.

## Common mistakes
Trusting the success redirect; parsing JSON before checking the signature; no idempotency; doing the whole job inside the webhook
request so the provider retries and doubles it; test and live keys mixed up between environments.
