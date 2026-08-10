# SmartBRGY push delivery

Deploy this function without JWT verification because the database webhook authenticates with a private header:

```bash
npx supabase functions deploy send-push --no-verify-jwt
npx supabase secrets set PUSH_WEBHOOK_SECRET=replace-with-a-long-random-secret
```

In Supabase Dashboard, create a Database Webhook for **INSERT** on `public.notifications`:

- URL: `https://<project-ref>.supabase.co/functions/v1/send-push`
- Method: `POST`
- Header: `x-smartbrgy-webhook-secret: <the same secret>`

Then run `eas init` once in the mobile project so the generated EAS project ID is written to the Expo configuration. Push notifications require a physical device and a development/preview/production build.
