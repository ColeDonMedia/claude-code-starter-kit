# Card: sending email

**When:** the app sends email: sign-up confirmation, password reset, invitations, receipts, notifications, newsletters.

## Rules
1. **Send through an email service** with its sending domain set up (SPF, DKIM and DMARC records), never from a personal mailbox.
2. **Send from a background job,** never inside the request, so a slow or failing email service doesn't break the page.
3. **Never put secrets or more personal data than needed in an email;** links carry single-use, expiring tokens.
4. **Every email the user didn't ask for has an unsubscribe link** that works in one click and is honoured; transactional emails
   (reset, receipt) are kept separate from marketing ones.
5. **Escape everything user-supplied** in email templates (names, messages), the same as on a web page.
6. **Bounces and complaints are recorded,** and the app stops sending to addresses that bounce hard.
7. **In development and tests, nothing reaches a real inbox:** a fake mailer or a local catcher.

## Prove it with tests
- Requesting a password reset queues exactly one email to that address, with a link that works once.
- An invitation email for account A contains A's name and nothing of account B.
- A user name containing HTML is shown as text in the email.
- An unsubscribed user gets no marketing email but still gets password resets.
- When the email service fails, the page still succeeds and the email is retried.

## Common mistakes
Sending inside the request; reset links that never expire; no unsubscribe; HTML injection through a display name; test emails sent
to real customers from a copied database.
