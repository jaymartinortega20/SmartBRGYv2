# SmartBRGY V2

SmartBRGY is the Barangay Tubod resident mobile app. It connects to the existing desktop administration website through the same Supabase Auth, PostgreSQL database, private Storage buckets, Realtime subscriptions, and notification records.

## Project folders

- Root Expo project: Android/iOS resident app and read-only mobile admin overview
- `supabase/`: schema upgrades and Edge Functions

## Final resident functions

- Barangay Tubod registration with birthdate/Purok pickers and private front/back valid-ID attachments
- Responsive resident Home with service shortcuts, active-request counts, latest announcement, and notification badge
- Structured 5 W's announcements with search and detail preview
- Multi-document requests for Barangay Clearance, Certificate of Indigency, Certificate of Residency, Barangay Business Permit/Clearance, and Cedula
- Separate copies and purpose per document, payment-upon-pickup notes, representative ID/authorization attachments, and resident/admin claim confirmation
- Incident reporting with date/time, location, urgency, evidence photo, optional barangay meeting, editable availability, and ticket summaries
- Barangay Help Desk conversations with guided categories and admin replies
- In-app notification center plus opt-in Android/iOS push notifications
- Resident Profile and Settings for profile correction, security, notification permission, support, privacy information, and sign out
- SmartBRGY Assistant (AI — free Gemini tier or Claude): barangay Q&A in Bisaya/Tagalog/English, incident-report drafting, announcement translation, and Help Desk hand-off

The old standalone Book Appointment module is intentionally removed. Requested face-to-face meetings are handled inside Incident Reports.

## Admin website connection

The separately maintained web admin uses the same Supabase project. It supports resident search and valid-ID review, ban/unban confirmation, grouped document requests and secure representative attachments, fees, incident evidence and meeting notices, Help Desk conversations, and 5 W's announcement publishing. Mobile admin access is monitoring-only.

## Local setup

1. Copy `.env.example` to `.env` and add the Supabase URL and publishable key.
2. Run `npm install`, then `npx expo start`.

For the existing SmartBRGY Supabase project, run `supabase/APPLY_THIS_FINAL_FIX.sql`
once in the SQL Editor. It only adds the missing push-token registry and does not
reset existing accounts or data.

For a new Supabase project, run `supabase/schema.sql`, then each `supabase/migration_*.sql` file in number order.

**Every project (new or existing) must also run `supabase/migration_009_fixes_and_ai.sql`.** It adds the
document-request and Help Desk functions the app calls (only if they are missing), security fixes, and the
AI assistant usage limits. It is safe to run more than once.

### Building the Android APK/AAB with EAS

`.env` is not uploaded to EAS builds. Set the Supabase values as EAS environment variables once:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --environment preview --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_PUBLISHABLE_KEY --environment preview --environment production --visibility plaintext
```

Also add `smartbrgyv2://reset-password` to Supabase → Authentication → URL Configuration → Redirect URLs so password reset links open the app.

## Edge Functions and push delivery

Deploy the included functions from the project root:

```bash
npx supabase functions deploy registered-resident --no-verify-jwt
npx supabase functions deploy manage-resident-access
npx supabase functions deploy send-push --no-verify-jwt
npx supabase functions deploy ai-assistant
```

The AI assistant needs an AI key. Free option: `npx supabase secrets set GEMINI_API_KEY=...` (key from aistudio.google.com). See `supabase/functions/ai-assistant/README.md`.

Push delivery is automatic after running `supabase/migration_011_notifications_and_push.sql`
(no manual Database Webhook needed). Use the same secret in both places:

```bash
npx supabase secrets set PUSH_WEBHOOK_SECRET=your-long-random-secret
```

```sql
-- Supabase SQL Editor
select vault.create_secret('your-long-random-secret', 'push_webhook_secret');
```

Android push also needs the Firebase (FCM V1) key uploaded once with `eas credentials`.

Expo Go uses notification-center and local/in-app alerts without an EAS project ID.
True push while the app is fully closed requires an installed development/preview/
production build. Run `eas init` once, then place the generated project ID in
`EXPO_PUBLIC_EAS_PROJECT_ID` if it is not already present in the Expo configuration.

Never place the Supabase service-role key in the Expo app or admin browser app. Service-role access exists only inside Supabase Edge Functions.
