# SmartBRGY V2

SmartBRGY is the Barangay Tubod resident mobile app. It connects to the existing desktop administration website through the same Supabase Auth, PostgreSQL database, private Storage buckets, Realtime subscriptions, and notification records.

## Project folders

- Root Expo project: Android/iOS resident app and read-only mobile admin overview
- `supabase/`: schema upgrades and Edge Functions

## Final resident functions

- Barangay Tubod registration with birthdate/Purok pickers and private front/back valid-ID attachments
- Responsive resident Home with service shortcuts, active-request counts, latest announcement, and notification badge
- Structured 5 W's announcements, search, detail preview, and attendance confirmation
- Multi-document requests for Barangay Clearance, Certificate of Indigency, Certificate of Residency, Barangay Business Permit/Clearance, and Cedula
- Separate copies and purpose per document, payment-upon-pickup notes, representative ID/authorization attachments, and resident/admin claim confirmation
- Incident reporting with date/time, location, urgency, evidence photo, optional barangay meeting, editable availability, and ticket summaries
- Barangay Help Desk conversations with guided categories and admin replies
- In-app notification center plus opt-in Android/iOS push notifications
- Resident Profile and Settings for profile correction, security, notification permission, support, privacy information, and sign out

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

## Edge Functions and push delivery

Deploy the included functions from the project root:

```bash
npx supabase functions deploy registered-resident --no-verify-jwt
npx supabase functions deploy manage-resident-access
npx supabase functions deploy send-push --no-verify-jwt
```

Set a long random `PUSH_WEBHOOK_SECRET` for `send-push`, then create an INSERT database webhook from `public.notifications` to that function with the same `x-smartbrgy-webhook-secret` header. Full details are in `supabase/functions/send-push/README.md`.

Expo Go uses notification-center and local/in-app alerts without an EAS project ID.
True push while the app is fully closed requires an installed development/preview/
production build. Run `eas init` once, then place the generated project ID in
`EXPO_PUBLIC_EAS_PROJECT_ID` if it is not already present in the Expo configuration.

Never place the Supabase service-role key in the Expo app or admin browser app. Service-role access exists only inside Supabase Edge Functions.
