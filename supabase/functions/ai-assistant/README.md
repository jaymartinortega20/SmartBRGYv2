# SmartBRGY AI assistant (Claude)

Powers three features in the resident app:

- **SmartBRGY Assistant** chat (Home → "Ask the SmartBRGY Assistant", and from the Help Desk tab). Answers questions about documents, fees, requirements, announcements and the resident's own request status, in Bisaya, Tagalog or English. Can hand a concern off to the Help Desk.
- **Help me write this report** on the Report tab: turns the resident's own words into a draft of the incident form.
- **Translate & summarize** inside each announcement.

The Claude API key is stored only as a Supabase secret. The app never sees it.

## Setup

1. Run `supabase/migration_009_fixes_and_ai.sql` in the Supabase SQL Editor (creates the daily usage limit table).
2. Create an API key at https://console.anthropic.com (Settings → API Keys) and add billing credit.
3. From the project root:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...your-key...
npx supabase functions deploy ai-assistant
```

Deploy **with** JWT verification (the default): only signed-in residents can call it.

## Optional settings

```bash
# Daily requests per resident (default 40)
npx supabase secrets set AI_DAILY_LIMIT=40
# Claude model (default claude-haiku-5-5: fast and low-cost)
npx supabase secrets set AI_MODEL=claude-haiku-5-5
```

## What the assistant can see

Only data the resident is already allowed to see: active document types and fees, the latest 8 announcements, and that resident's own document requests, incident reports and Help Desk tickets. It cannot change any record.
