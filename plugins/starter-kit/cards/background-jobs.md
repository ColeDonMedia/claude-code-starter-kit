# Card: background jobs, queues and scheduled tasks

**When:** work happens outside a request: sending email, generating reports or exports, processing uploads or webhooks, nightly
or hourly tasks, retries.

## Rules
1. **Jobs can run twice; make them safe to repeat** (idempotent): check whether the work is already done, or use a unique key.
2. **Pass ids, not whole objects,** and load fresh data when the job runs; the record may have changed or been deleted.
3. **Carry the context explicitly:** the account or tenant, the user who asked, and the locale go with the job.
4. **Retries with limits:** back off between tries, stop after a few, and put the failure where the owner can see it (a failed
   jobs list, an alert), never silently drop it.
5. **Time limits:** every job has a timeout; long work is split into chunks that can resume.
6. **Scheduled tasks run once even with two servers** (a lock or the scheduler's single-run option), and say when they last ran.
7. **The app works when the queue is slow:** screens show "processing" states, not errors.

## Prove it with tests
- Running the same job twice gives the same result as once (one email, one charge, one row).
- A job whose record was deleted before it ran finishes cleanly without an error storm.
- A job that fails is retried, then lands in the failed list after the limit, and the owner can see it.
- A job created for account A never touches account B, even when B's jobs run in between.
- The scheduled task skips a run when the previous one is still going.

## Common mistakes
Serialising a whole model into the job; no retry limit; failures only in a log nobody reads; a scheduled task that runs on every
server; jobs that depend on "the current user" after the request ended.
