# SmartBRGY AI assistant

Powers three features in the resident app:

- **SmartBRGY Assistant** chat (Home → "Ask the SmartBRGY Assistant", and from the Help Desk tab). Answers questions about documents, fees, requirements and announcements in Bisaya, Tagalog or English, and can hand a concern off to the Help Desk.
- **Help me write this report** on the Report tab: turns the resident's own words into a draft of the incident form.
- **Translate & summarize** inside each announcement.

The API key is stored only as a Supabase secret. The app never sees it.

## Free setup (Google Gemini free tier) — recommended

1. Run `supabase/migration_009_fixes_and_ai.sql` in the Supabase SQL Editor.
2. Go to https://aistudio.google.com/apikey, sign in with a Google account, and click **Create API key**. No credit card is needed.
3. From the project root:

```bash
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
npx supabase functions deploy ai-assistant
```

Free-tier notes:
- Free usage has daily and per-minute limits. If many residents use it at once, some will see "The assistant is busy right now" and can retry. `AI_DAILY_LIMIT` (default 40 per resident per day) helps share the free quota.
- Google may use free-tier requests to improve its products. Because of this, the assistant does **not** send residents' names or their request/report/ticket records in free mode; it points residents to the Documents, Report and Help Desk tabs for status questions. Messages residents type themselves are still sent, so residents should not type sensitive personal details.

## Paid setup (Claude)

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set AI_PROVIDER=claude
npx supabase functions deploy ai-assistant
```

With Claude, the assistant can also answer "what is the status of my requests?" using the resident's own records.

## Optional settings

```bash
npx supabase secrets set AI_DAILY_LIMIT=40          # requests per resident per day
npx supabase secrets set AI_MODEL=gemini-3.5-flash  # or e.g. gemini-3.5-flash-lite (higher free limits), claude-haiku-5-5
```

If Google or Anthropic retires a model, set `AI_MODEL` to a current one; no app rebuild is needed.
