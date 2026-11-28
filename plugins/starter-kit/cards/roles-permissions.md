# Card: roles, permissions and invitations

**When:** different people may do different things (owner, admin, member, viewer, client), or people are invited to an account.

## Rules
1. **Check permission on the server for every action,** in one place (a policy, guard or `can(user, action, record)` function),
   never only by hiding a button.
2. **Check the record, not just the role:** "may edit invoices" still needs "this invoice belongs to the user's account".
3. **Deny by default:** a new route or action is forbidden until a rule allows it.
4. **Roles are data, checks are code:** name a few roles in the plan, list what each may do, and test that table.
5. **Nobody can raise their own role,** and the last owner can't be removed or demoted.
6. **Invitations** are single-use, expire, are bound to the invited email, and give exactly the role chosen by the inviter
   (never more than the inviter has).
7. **Important changes are recorded:** who changed whose role, removed whom, or exported what, and when.

## Prove it with tests
- For every role and every action in the plan's table: allowed ones succeed, others are refused on the server (call the route
  directly, not through the screen).
- A member who edits the form to send `role=admin` stays a member.
- A user allowed to edit invoices can't edit an invoice of another account.
- The last owner can't leave, be removed or be demoted.
- An invitation used twice, used after expiry, or used by a different email fails.

## Common mistakes
Checks only in the screen; admin pages that only check "signed in"; a role taken from the request; invitations that never expire;
no record of who changed permissions.
