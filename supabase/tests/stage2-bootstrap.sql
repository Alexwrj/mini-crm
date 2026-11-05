-- TEST HARNESS ONLY: execute exclusively in a disposable empty PostgreSQL cluster.
-- This is not a migration or an implementation of Supabase Auth.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);

grant usage on schema public to anon, authenticated;
-- Model legacy Supabase auto-grants to prove the migration revokes them.
alter default privileges in schema public
  grant all privileges on tables to public, anon, authenticated;
