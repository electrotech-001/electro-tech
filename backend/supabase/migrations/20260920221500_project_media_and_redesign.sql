-- ============================================================================
-- Migration: 20260920221500_project_media_and_redesign.sql
-- Description: Extends public.projects with client_organization, category,
--              completion_year, short_summary, full_story, and creates
--              normalized public.project_media table supporting 1-5 IMAGES
--              (JPEG, PNG, WebP up to 5MB). Videos are NOT supported.
--              Includes partial unique primary index, advisory locking on insert,
--              atomic primary switching RPC, and comprehensive constraint triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND public.projects TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS client_organization VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS completion_year SMALLINT NULL,
    ADD COLUMN IF NOT EXISTS short_summary VARCHAR(400) NULL,
    ADD COLUMN IF NOT EXISTS full_story TEXT NULL;

-- Add check constraint for whitelisted categories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_category'
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT chk_projects_category CHECK (
                category IS NULL OR category IN (
                    'Complete Solar System Installation',
                    'Solar Structures',
                    'Security Systems (CCTV)',
                    'Electrical Works'
                )
            );
    END IF;
END $$;

-- Add check constraint for completion year (reasonable range 2000 - 2100)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_completion_year'
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT chk_projects_completion_year CHECK (
                completion_year IS NULL OR (completion_year >= 2000 AND completion_year <= 2100)
            );
    END IF;
END $$;

-- Add check constraint for short_summary length (10 - 400 chars)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_short_summary_length'
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT chk_projects_short_summary_length CHECK (
                short_summary IS NULL OR (LENGTH(TRIM(short_summary)) >= 10 AND LENGTH(TRIM(short_summary)) <= 400)
            );
    END IF;
END $$;

-- Drop legacy publication constraint requiring primary_image_path, secondary_image_path, etc.
ALTER TABLE public.projects
    DROP CONSTRAINT IF EXISTS chk_projects_published_requirements;

-- Add new publication requirements constraint on public.projects fields
ALTER TABLE public.projects
    ADD CONSTRAINT chk_projects_published_requirements CHECK (
        status != 'published' OR (
            location IS NOT NULL AND LENGTH(TRIM(location)) > 0 AND
            size IS NOT NULL AND LENGTH(TRIM(size)) > 0 AND
            client_organization IS NOT NULL AND LENGTH(TRIM(client_organization)) > 0 AND
            category IS NOT NULL AND LENGTH(TRIM(category)) > 0 AND
            completion_year IS NOT NULL AND
            short_summary IS NOT NULL AND LENGTH(TRIM(short_summary)) >= 10 AND LENGTH(TRIM(short_summary)) <= 400
        )
    );

-- ----------------------------------------------------------------------------
-- 2. NORMALIZED public.project_media TABLE (IMAGES ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_media (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    object_path   VARCHAR(500) NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    alt_text      VARCHAR(255) NULL,
    caption       VARCHAR(255) NULL,
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order    SMALLINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Supported image MIME types only
    CONSTRAINT chk_project_media_image_mime CHECK (
        mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    )
);

-- Index on project_id and sort_order for fast retrieval
CREATE INDEX IF NOT EXISTS idx_project_media_project_sort
    ON public.project_media (project_id, sort_order ASC, created_at ASC);

-- Enforce at most one primary image per project via deterministic partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_media_primary
    ON public.project_media (project_id)
    WHERE is_primary = TRUE;

-- Trigger to maintain updated_at on public.project_media
DROP TRIGGER IF EXISTS trg_project_media_updated_at ON public.project_media;
CREATE TRIGGER trg_project_media_updated_at
BEFORE UPDATE ON public.project_media
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enforce maximum 5 images per project in database with transaction-scoped advisory locking
CREATE OR REPLACE FUNCTION public.check_project_media_limit()
RETURNS TRIGGER AS $$
DECLARE
    media_count INTEGER;
BEGIN
    -- Acquire transaction-scoped advisory lock for this project to serialize concurrent inserts
    PERFORM pg_advisory_xact_lock(hashtext('project_media_limit_' || NEW.project_id::text));

    SELECT COUNT(*) INTO media_count
    FROM public.project_media
    WHERE project_id = NEW.project_id;

    IF media_count >= 5 THEN
        RAISE EXCEPTION 'A project cannot have more than 5 images.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_project_media_limit ON public.project_media;
CREATE TRIGGER trg_check_project_media_limit
BEFORE INSERT ON public.project_media
FOR EACH ROW
EXECUTE FUNCTION public.check_project_media_limit();

-- Enforce published project media safety on INSERT, UPDATE, and DELETE
CREATE OR REPLACE FUNCTION public.check_published_project_media_safety()
RETURNS TRIGGER AS $$
DECLARE
    v_project_id UUID;
    v_proj_status public.project_status;
    v_img_count INTEGER;
    v_primary_count INTEGER;
    v_primary_alt_empty BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    -- Check status of project
    SELECT status INTO v_proj_status
    FROM public.projects
    WHERE id = v_project_id;

    -- If parent project was deleted (e.g. CASCADE delete), nothing to enforce
    IF NOT FOUND OR v_proj_status IS NULL THEN
        RETURN NULL;
    END IF;

    -- Enforce publication invariants only if the project is currently published
    IF v_proj_status = 'published' THEN
        SELECT COUNT(*),
               COUNT(*) FILTER (WHERE is_primary = TRUE),
               BOOL_OR(is_primary = TRUE AND btrim(coalesce(alt_text, '')) = '')
        INTO v_img_count, v_primary_count, v_primary_alt_empty
        FROM public.project_media
        WHERE project_id = v_project_id;

        IF v_img_count = 0 THEN
            RAISE EXCEPTION 'Cannot leave a published project with zero images.'
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_primary_count != 1 THEN
            RAISE EXCEPTION 'A published project must have exactly 1 primary image.'
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_primary_alt_empty = TRUE THEN
            RAISE EXCEPTION 'The primary image of a published project must have non-empty alt text.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- If UPDATE moved media across projects, also check old project if it was published
    IF TG_OP = 'UPDATE' AND OLD.project_id != NEW.project_id THEN
        SELECT status INTO v_proj_status
        FROM public.projects
        WHERE id = OLD.project_id;

        IF FOUND AND v_proj_status = 'published' THEN
            SELECT COUNT(*),
                   COUNT(*) FILTER (WHERE is_primary = TRUE),
                   BOOL_OR(is_primary = TRUE AND btrim(coalesce(alt_text, '')) = '')
            INTO v_img_count, v_primary_count, v_primary_alt_empty
            FROM public.project_media
            WHERE project_id = OLD.project_id;

            IF v_img_count = 0 THEN
                RAISE EXCEPTION 'Cannot leave a published project with zero images.'
                    USING ERRCODE = 'check_violation';
            END IF;

            IF v_primary_count != 1 THEN
                RAISE EXCEPTION 'A published project must have exactly 1 primary image.'
                    USING ERRCODE = 'check_violation';
            END IF;

            IF v_primary_alt_empty = TRUE THEN
                RAISE EXCEPTION 'The primary image of a published project must have non-empty alt text.'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_published_project_media_safety ON public.project_media;
CREATE CONSTRAINT TRIGGER trg_check_published_project_media_safety
AFTER INSERT OR UPDATE OR DELETE ON public.project_media
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_published_project_media_safety();

-- Enforce cross-table media requirements before project publication
CREATE OR REPLACE FUNCTION public.check_project_publication_media()
RETURNS TRIGGER AS $$
DECLARE
    img_count INTEGER;
    primary_count INTEGER;
    primary_alt_empty BOOLEAN;
BEGIN
    IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status != 'published') THEN
        SELECT COUNT(*),
               COUNT(*) FILTER (WHERE is_primary = TRUE),
               BOOL_OR(is_primary = TRUE AND btrim(coalesce(alt_text, '')) = '')
        INTO img_count, primary_count, primary_alt_empty
        FROM public.project_media
        WHERE project_id = NEW.id;

        IF img_count = 0 THEN
            RAISE EXCEPTION 'A project must have at least 1 image to be published.'
                USING ERRCODE = 'check_violation';
        END IF;

        IF primary_count != 1 THEN
            RAISE EXCEPTION 'A published project must have exactly 1 primary image.'
                USING ERRCODE = 'check_violation';
        END IF;

        IF primary_alt_empty = TRUE THEN
            RAISE EXCEPTION 'The primary image of a published project must have non-empty alt text.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_project_publication_media ON public.projects;
CREATE TRIGGER trg_check_project_publication_media
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.check_project_publication_media();

-- ----------------------------------------------------------------------------
-- 3. ATOMIC PRIMARY SWITCHING FUNCTION (RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_primary_project_media(
    p_project_id UUID,
    p_media_id UUID
)
RETURNS public.project_media
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_media public.project_media;
    v_proj_status public.project_status;
BEGIN
    -- Verify media belongs to project
    SELECT * INTO v_media
    FROM public.project_media
    WHERE id = p_media_id AND project_id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Media item % not found for project %', p_media_id, p_project_id
            USING ERRCODE = 'P0002';
    END IF;

    -- If project is published, verify target media has non-empty alt text
    SELECT status INTO v_proj_status
    FROM public.projects
    WHERE id = p_project_id;

    IF v_proj_status = 'published' AND btrim(coalesce(v_media.alt_text, '')) = '' THEN
        RAISE EXCEPTION 'Cannot set an image without alt text as primary on a published project.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Clear old primary
    UPDATE public.project_media
    SET is_primary = FALSE
    WHERE project_id = p_project_id AND is_primary = TRUE;

    -- Set new primary
    UPDATE public.project_media
    SET is_primary = TRUE, updated_at = NOW()
    WHERE id = p_media_id AND project_id = p_project_id
    RETURNING * INTO v_media;

    RETURN v_media;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES & PRIVILEGES FOR project_media
-- ----------------------------------------------------------------------------
ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;

-- Revoke all direct access from public, anon, and authenticated browser roles
REVOKE ALL ON TABLE public.project_media FROM PUBLIC, anon, authenticated;

-- Grant full control exclusively to service_role (used by Express backend)
GRANT ALL ON TABLE public.project_media TO service_role;

-- Revoke RPC execution from browser roles and grant exclusively to service_role
REVOKE ALL ON FUNCTION public.set_primary_project_media(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_project_media(UUID, UUID) TO service_role;
