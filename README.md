# CivicLens AI

CivicLens AI is a React/Vite civic issue reporting dashboard. Citizens can submit
photo-based complaints, track their status, and view nearby issues. Government
users can review reports, inspect evidence, view citizen contact details, and
update report status.

## Run locally

```bash
npm install
npm run dev
```

## Validate changes

```bash
npm run lint
npm run build
```

## Vercel deployment

Keep the Vercel project root set to this directory. Use the Vite preset, with
`npm run build` as the build command and `dist` as the output directory. The
root `vercel.json` provides the SPA fallback needed for direct visits and
refreshes on React Router routes.

## Supabase setup

Run [supabase-schema.sql](./supabase-schema.sql) for a new database. For an
existing `issues` table, run [supabase-issues-migration.sql](./supabase-issues-migration.sql).
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` when using a
different Supabase project.

## AI photo analysis

For a local hackathon demo, add the following to `.env` and restart the Vite
dev server:

```env
VITE_ZENMUX_API_KEY=your_rotated_zenmux_api_key
VITE_ZENMUX_MODEL=openai/gpt-6-luna
```

The report wizard sends the image directly to ZenMux's OpenAI-compatible
Chat Completions API and checks whether it shows a reportable civic issue.
This direct-browser setup is for local demos only: every `VITE_` variable is
included in the browser bundle, so the API key is visible to users. Revoke any
key exposed in chat or screenshots, and use a server-side proxy for production.
