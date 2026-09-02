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

## Supabase setup

Run [supabase-schema.sql](./supabase-schema.sql) for a new database. For an
existing `issues` table, run [supabase-issues-migration.sql](./supabase-issues-migration.sql).
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` when using a
different Supabase project.
