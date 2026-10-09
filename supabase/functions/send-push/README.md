# SmartBRGY push delivery

Every new row in `public.notifications` is sent to residents' phones by this function.
Since `migration_011_notifications_and_push.sql`, the database calls it automatically
(through `pg_net`), so no manual Database Webhook is needed.

## One-time setup

1. Deploy:

```bash
npx supabase functions deploy send-push --no-verify-jwt
```

2. Choose a long random secret and save it in **both** places (same value):

```bash
npx supabase secrets set PUSH_WEBHOOK_SECRET=your-long-random-secret
```

```sql
-- Supabase SQL Editor
select vault.create_secret('your-long-random-secret', 'push_webhook_secret');
```

3. Android needs the Firebase (FCM V1) service account key uploaded to Expo once:
   `eas credentials` → Android → production/preview → Google Service Account →
   "Upload a Google Service Account Key for FCM V1".

Push only reaches installed EAS builds on physical phones (not Expo Go).
