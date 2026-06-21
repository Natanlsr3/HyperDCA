-- Enable Supabase pg_cron + pg_net for scheduling HTTP calls to Vercel cron endpoints.
-- Job definitions (cron.schedule) are applied post-deploy via supabase/cron_setup.example.sql
-- so prod URL and CRON_SECRET never live in committed migrations.

create extension if not exists pg_cron;
create extension if not exists pg_net;
