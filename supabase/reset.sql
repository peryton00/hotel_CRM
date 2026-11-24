-- ==============================================================================
-- HOTEL_CRM: Complete Database Teardown & Reset Script
-- File: supabase/reset.sql
-- Description: Completely purges all existing tables, views, custom types,
--              Row Level Security policies, stored procedures, triggers,
--              and Realtime publication bindings in the 'public' schema.
--              Execute this script in Supabase SQL Editor BEFORE running schema.sql
--              to start completely fresh.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DETACH REALTIME REPLICATION BINDINGS (DYNAMIC & COMPATIBLE)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOR r IN (
            SELECT schemaname, tablename 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        ) LOOP
            EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);
        END LOOP;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- Safe continue
END $$;

-- ------------------------------------------------------------------------------
-- 2. DROP AUTH HOOK TRIGGER ON auth.users
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ------------------------------------------------------------------------------
-- 3. TEARDOWN ALL PUBLIC ENTITIES (COMPLETE CLEAN WIPE)
-- ------------------------------------------------------------------------------
-- The cleanest, most reliable way in PostgreSQL/Supabase to delete all tables,
-- foreign keys, RLS policies, sequences, and enums is dropping and recreating
-- the 'public' schema with CASCADE.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ------------------------------------------------------------------------------
-- 4. RESTORE DEFAULT SUPABASE ROLE PERMISSIONS ON public
-- ------------------------------------------------------------------------------
GRANT USAGE, CREATE ON SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;

-- Re-grant schema usage
GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Re-enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
