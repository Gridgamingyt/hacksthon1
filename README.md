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

Set these server-side environment variables in Vercel (Production, Preview,
and Development) or in the local `.env` file:

```env
ZENMUX_API_KEY=your_rotated_zenmux_api_key
ZENMUX_MODEL=openai/gpt-6-luna
```

The report wizard sends the image to the `/api/analyze-issue-image` Vercel
function, which calls ZenMux's OpenAI-compatible Chat Completions API on the
server. The API key is never included in the browser bundle. The local Vite
server provides the same endpoint for development. Revoke any key exposed in
chat or screenshots and replace it with a newly rotated key.
