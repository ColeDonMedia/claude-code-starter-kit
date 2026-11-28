# Card: sign-up, sign-in and sessions

**When:** people create accounts, sign in, reset passwords, stay signed in, or sign in with another service.

## Rules
1. **Use a vetted library or the framework's own auth** for passwords and sessions; never hand-roll hashing or tokens. Passwords
   are hashed with Argon2id, scrypt or bcrypt.
2. **Same answer for "no such account" and "wrong password"**, and for "reset link sent", so accounts can't be discovered.
3. **Rate-limit** sign-in, sign-up, reset and code checks per account and per address; lock out gently, never permanently.
4. **Sessions:** cookies `HttpOnly`, `Secure`, `SameSite=Lax` or stricter; a new session id after sign-in and after any privilege
   change; sign-out ends the session on the server; changing the password ends other sessions.
5. **Reset and magic links** are single-use, expire (minutes to an hour), are stored hashed, and are invalidated by a newer one.
6. **Forms work with password managers:** real `<label>`s, `autocomplete` attributes, paste allowed.
7. **Signing in with another service** checks the `state` value, uses the provider's verified email only, and never links to an
   existing account by email without proof the same person owns both.

## Prove it with tests
- Sign-in with an unknown email and with a wrong password give the same message and timing class.
- The 6th wrong password in a minute is refused even with the right one, then works after the wait.
- A reset link works once, fails the second time, and fails after it expires.
- After sign-out, the old session cookie no longer opens a signed-in page.
- After a password change, a session signed in elsewhere is ended.
- A signed-out visitor sent to a signed-in page lands on sign-in and comes back to that page afterwards.

## Common mistakes
"No account with that email"; reset tokens stored in plain text; sessions that survive sign-out; no rate limit on the reset form;
blocking paste in password fields.
