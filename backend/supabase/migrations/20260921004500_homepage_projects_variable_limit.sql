-- ============================================================================
-- Migration: Update replace_homepage_projects to support 0 to 3 projects
-- Timestamp: 20260921004500_homepage_projects_variable_limit.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.replace_homepage_projects(p_project_ids UUID[])
RETURNS VOID AS $$
DECLARE
    v_len INTEGER;
    v_count INTEGER;
    v_published_count INTEGER;
    v_distinct_count INTEGER;
    i INTEGER;
BEGIN
    -- 0. Acquire transaction-scoped advisory lock dedicated to homepage replacement.
    -- Serializes concurrent execution across all callers; automatically releases at transaction end.
    PERFORM pg_advisory_xact_lock(hashtext('replace_homepage_projects')::bigint);

    -- 1. If NULL is passed, treat as empty array
    IF p_project_ids IS NULL THEN
        p_project_ids := ARRAY[]::UUID[];
    END IF;

    v_len := COALESCE(cardinality(p_project_ids), 0);

    -- 2. Validate length: between 0 and 3
    IF v_len > 3 THEN
        RAISE EXCEPTION 'replace_homepage_projects requires an array of 0 to 3 project UUIDs.';
    END IF;

    -- 3. If array is not empty, check uniqueness and published status
    IF v_len > 0 THEN
        -- Check distinct count
        SELECT COUNT(DISTINCT id)
        INTO v_distinct_count
        FROM unnest(p_project_ids) AS id;

        IF v_distinct_count != v_len THEN
            RAISE EXCEPTION 'All project UUIDs for the homepage must be distinct.';
        END IF;

        -- Lock rows to prevent concurrent interleaved updates and verify records
        PERFORM 1
        FROM public.projects
        WHERE id = ANY(p_project_ids)
        FOR UPDATE;

        SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'published')
        INTO v_count, v_published_count
        FROM public.projects
        WHERE id = ANY(p_project_ids);

        -- Verify all records exist
        IF v_count != v_len THEN
            RAISE EXCEPTION 'One or more specified project UUIDs do not exist in the database.';
        END IF;

        -- Verify all records are published
        IF v_published_count != v_len THEN
            RAISE EXCEPTION 'All homepage projects must have status = ''published''.';
        END IF;
    END IF;

    -- 4. Atomically clear current homepage assignments
    UPDATE public.projects
    SET is_featured_homepage = FALSE,
        homepage_order = NULL
    WHERE is_featured_homepage = TRUE;

    -- 5. Assign new positions 1..v_len
    IF v_len > 0 THEN
        FOR i IN 1..v_len LOOP
            UPDATE public.projects
            SET is_featured_homepage = TRUE,
                homepage_order = i
            WHERE id = p_project_ids[i];
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog, pg_temp;

-- Explicitly revoke execute from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) FROM authenticated;

-- Explicitly grant execute to service_role
GRANT EXECUTE ON FUNCTION public.replace_homepage_projects(UUID[]) TO service_role;
