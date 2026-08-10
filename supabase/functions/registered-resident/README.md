# Resident registration function

Deploy once with JWT verification disabled because this function is used before the resident has an account:

```bash
npx supabase functions deploy registered-resident --no-verify-jwt
```

The function still validates every field, restricts registration to Barangay Tubod areas, limits ID file types/sizes, and uses the service role only inside the server environment. Valid IDs are stored in the private `resident-valid-ids` bucket.
