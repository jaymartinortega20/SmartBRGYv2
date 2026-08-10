# Resident access control

Deploy with normal JWT verification:

```bash
npx supabase functions deploy manage-resident-access
```

The function verifies the caller's signed-in account and `profiles.role = 'admin'` before changing Auth access and the resident audit fields.
