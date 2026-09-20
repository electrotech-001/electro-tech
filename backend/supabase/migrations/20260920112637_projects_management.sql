-- ============================================================================
-- Migration: 20260920112637_projects_management.sql
-- Description: Initial schema for Electro Tech Projects Management System.
-- Includes:
--   1. project_status ENUM
--   2. public.projects table with constraints & publication checks
--   3. public.admin_users table for application-level authorization
--   4. updated_at and state invariant triggers
--   5. Partial unique index for at-most-3 homepage projects
--   6. replace_homepage_projects atomic RPC function
--   7. RLS enablement with strict browser-role revocation
--   8. project-images public storage bucket definition
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE public.project_status AS ENUM ('draft', 'published', 'archived');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. PROJECTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                        VARCHAR(100) NOT NULL,
    title                       VARCHAR(150) NOT NULL,
    location                    VARCHAR(150) NULL,
    size                        VARCHAR(100) NULL,
    description                 TEXT NULL,
    equipment                   TEXT[] NOT NULL DEFAULT '{}',
    primary_image_path          VARCHAR(500) NULL,
    secondary_image_path        VARCHAR(500) NULL,
    primary_alt                 VARCHAR(255) NULL,
    secondary_alt               VARCHAR(255) NULL,
    primary_image_position      VARCHAR(50) NOT NULL DEFAULT 'center',
    secondary_image_position    VARCHAR(50) NOT NULL DEFAULT 'center',
    status                      public.project_status NOT NULL DEFAULT 'draft',
    is_featured_homepage        BOOLEAN NOT NULL DEFAULT FALSE,
    homepage_order              SMALLINT NULL,
    project_order               INTEGER NOT NULL DEFAULT 0,
    published_at                TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_projects_slug UNIQUE (slug),
    CONSTRAINT chk_projects_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT chk_projects_title_non_empty CHECK (LENGTH(TRIM(title)) > 0),
    CONSTRAINT chk_projects_project_order CHECK (project_order >= 0),
    CONSTRAINT chk_projects_homepage_order CHECK (homepage_order IN (1, 2, 3)),
    CONSTRAINT chk_projects_featured_integrity CHECK (
        (is_featured_homepage = TRUE AND homepage_order IS NOT NULL AND status = 'published') OR
        (is_featured_homepage = FALSE AND homepage_order IS NULL)
    ),
    CONSTRAINT chk_projects_published_requirements CHECK (
        status != 'published' OR (
            location IS NOT NULL AND LENGTH(TRIM(location)) > 0 AND
            size IS NOT NULL AND LENGTH(TRIM(size)) > 0 AND
            description IS NOT NULL AND LENGTH(TRIM(description)) > 0 AND
            primary_image_path IS NOT NULL AND LENGTH(TRIM(primary_image_path)) > 0 AND
            secondary_image_path IS NOT NULL AND LENGTH(TRIM(secondary_image_path)) > 0 AND
            primary_alt IS NOT NULL AND LENGTH(TRIM(primary_alt)) > 0 AND
            secondary_alt IS NOT NULL AND LENGTH(TRIM(secondary_alt)) > 0
        )
    )
);

-- ----------------------------------------------------------------------------
-- 3. ADMIN USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS & FUNCTIONS
-- ----------------------------------------------------------------------------

-- Reusable updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for public.projects updated_at
DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Trigger for public.admin_users updated_at
DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Project state invariant & publication timestamp trigger function
CREATE OR REPLACE FUNCTION public.sync_project_state_invariants()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Initialize published_at on first publication; preserve on unpublish/republish
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status != 'published') THEN
        IF TG_OP = 'INSERT' OR OLD.published_at IS NULL THEN
            NEW.published_at = NOW();
        ELSE
            NEW.published_at = OLD.published_at;
        END IF;
    END IF;

    -- 2. Guarantee that transitioning to draft or archived automatically clears homepage features
    IF NEW.status IN ('draft', 'archived') THEN
        NEW.is_featured_homepage = FALSE;
        NEW.homepage_order = NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for public.projects state invariants
DROP TRIGGER IF EXISTS trg_projects_state_invariants ON public.projects;
CREATE TRIGGER trg_projects_state_invariants
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.sync_project_state_invariants();

-- ----------------------------------------------------------------------------
-- 5. INDEXES
-- ----------------------------------------------------------------------------

-- Enforces AT MOST 3 homepage projects (positions 1, 2, 3) across the database
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_homepage_order
ON public.projects (homepage_order)
WHERE homepage_order IS NOT NULL;

-- Optimizes public homepage query (published and featured, sorted 1..3)
CREATE INDEX IF NOT EXISTS idx_projects_public_homepage
ON public.projects (homepage_order ASC)
WHERE status = 'published' AND is_featured_homepage = TRUE;

-- Optimizes public /projects directory listing
CREATE INDEX IF NOT EXISTS idx_projects_public_directory
ON public.projects (project_order ASC, published_at DESC)
WHERE status = 'published';

-- Optimizes admin project filtering by status and recency
CREATE INDEX IF NOT EXISTS idx_projects_admin_status
ON public.projects (status, created_at DESC);

-- Note: No separate index is created for 'slug' because 'CONSTRAINT uq_projects_slug UNIQUE (slug)'
-- automatically creates the underlying unique B-tree index in PostgreSQL.

-- ----------------------------------------------------------------------------
-- 6. ATOMIC HOMEPAGE REPLACEMENT FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_homepage_projects(p_project_ids UUID[])
RETURNS VOID AS $$
DECLARE
    v_count INTEGER;
    v_published_count INTEGER;
BEGIN
    -- 0. Acquire transaction-scoped advisory lock dedicated to homepage replacement.
    -- Serializes concurrent execution across all callers; automatically releases at transaction end.
    PERFORM pg_advisory_xact_lock(hashtext('replace_homepage_projects')::bigint);

    -- 1. Require an array of exactly 3 project UUIDs
    IF p_project_ids IS NULL OR cardinality(p_project_ids) != 3 THEN
        RAISE EXCEPTION 'replace_homepage_projects requires an array of exactly 3 project UUIDs.';
    END IF;

    -- 2. Require all 3 project UUIDs to be distinct
    IF p_project_ids[1] = p_project_ids[2] OR
       p_project_ids[1] = p_project_ids[3] OR
       p_project_ids[2] = p_project_ids[3] THEN
        RAISE EXCEPTION 'All 3 project UUIDs for the homepage must be distinct.';
    END IF;

    -- 3. Lock rows to prevent concurrent interleaved updates and verify records
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'published')
    INTO v_count, v_published_count
    FROM public.projects
    WHERE id = ANY(p_project_ids)
    FOR UPDATE;

    -- 4. Verify all 3 records exist
    IF v_count != 3 THEN
        RAISE EXCEPTION 'One or more specified project UUIDs do not exist in the database.';
    END IF;

    -- 5. Verify all 3 records are published
    IF v_published_count != 3 THEN
        RAISE EXCEPTION 'All 3 homepage projects must have status = ''published''.';
    END IF;

    -- 6. Atomically clear current homepage assignments
    UPDATE public.projects
    SET is_featured_homepage = FALSE,
        homepage_order = NULL
    WHERE is_featured_homepage = TRUE;

    -- 7. Assign new positions 1, 2, 3
    UPDATE public.projects
    SET is_featured_homepage = TRUE,
        homepage_order = 1
    WHERE id = p_project_ids[1];

    UPDATE public.projects
    SET is_featured_homepage = TRUE,
        homepage_order = 2
    WHERE id = p_project_ids[2];

    UPDATE public.projects
    SET is_featured_homepage = TRUE,
        homepage_order = 3
    WHERE id = p_project_ids[3];
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog, pg_temp;

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY & PRIVILEGES
-- ----------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Deny all direct table access to public browser roles (anon, authenticated).
-- All reads and mutations are routed through the Express backend using the Supabase secret key.
REVOKE ALL ON TABLE public.projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;

-- Explicitly revoke execute from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM authenticated;

-- Explicitly grant full access to the elevated service_role used by the backend
GRANT ALL ON TABLE public.projects TO service_role;
GRANT ALL ON TABLE public.admin_users TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. STORAGE BUCKET CONFIGURATION
-- ----------------------------------------------------------------------------
-- Define public 'project-images' bucket for marketing photos (WebP, JPEG, PNG, max 5 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'project-images',
    'project-images',
    TRUE,
    5242880, -- 5 MB
    ARRAY['image/webp', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
