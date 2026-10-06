BEGIN;

-- Preserve legacy years, media and publication state; never infer a month/day.
ALTER TABLE public.projects ADD COLUMN completion_date DATE NULL;
ALTER TABLE public.projects ADD COLUMN completion_date_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.projects ALTER COLUMN completion_date_required SET DEFAULT TRUE;

ALTER TABLE public.projects DROP CONSTRAINT chk_projects_published_requirements;
ALTER TABLE public.projects ADD CONSTRAINT chk_projects_published_requirements CHECK (
  status != 'published' OR (
    location IS NOT NULL AND LENGTH(TRIM(location)) > 0 AND
    size IS NOT NULL AND LENGTH(TRIM(size)) > 0 AND
    client_organization IS NOT NULL AND LENGTH(TRIM(client_organization)) > 0 AND
    category IS NOT NULL AND LENGTH(TRIM(category)) > 0 AND
    (completion_date IS NOT NULL OR (NOT completion_date_required AND completion_year IS NOT NULL)) AND
    short_summary IS NOT NULL AND LENGTH(TRIM(short_summary)) BETWEEN 10 AND 400
  )
);

CREATE FUNCTION public.require_exact_project_completion_date() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.completion_date IS NOT NULL THEN NEW.completion_date_required := TRUE; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_require_exact_project_completion_date BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.require_exact_project_completion_date();

CREATE TABLE public.project_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL CHECK (
    char_length(btrim(reviewer_name)) BETWEEN 1 AND 80 AND reviewer_name !~ '^[[:space:]]*$'
  ),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL CHECK (
    char_length(btrim(review_text)) BETWEEN 10 AND 1000 AND review_text !~ '^[[:space:]]*$'
  ),
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_project_reviews_project ON public.project_reviews(project_id);
CREATE INDEX idx_project_reviews_visible ON public.project_reviews(project_id, is_visible, created_at DESC, id DESC);
CREATE INDEX idx_project_reviews_created ON public.project_reviews(created_at DESC);
CREATE TRIGGER trg_project_reviews_updated_at BEFORE UPDATE ON public.project_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_reviews TO service_role;

-- One round trip for a bounded page and the summary of ALL visible reviews.
CREATE FUNCTION public.get_public_project_reviews(p_project_id UUID, p_page INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE result JSONB;
BEGIN
  PERFORM 1 FROM public.projects WHERE id = p_project_id AND status = 'published';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_page < 1 OR p_page > 100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
  SELECT jsonb_build_object(
    'reviewCount', count(*), 'averageRating', avg(rating), 'hasMore', count(*) > p_page * 20,
    'reviews', COALESCE((
      SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC, page.id DESC)
      FROM (
        SELECT id, project_id, reviewer_name, rating, review_text, created_at
        FROM public.project_reviews WHERE project_id = p_project_id AND is_visible
        ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET (p_page - 1) * 20
      ) page
    ), '[]'::jsonb)
  ) INTO result FROM public.project_reviews WHERE project_id = p_project_id AND is_visible;
  RETURN result;
END;
$$;

-- Serialize concurrent retries. No visitor IP or other identifiers are stored.
CREATE FUNCTION public.submit_project_review(
  p_project_id UUID, p_reviewer_name TEXT, p_rating SMALLINT, p_review_text TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE existing public.project_reviews; inserted public.project_reviews;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('project_review_' || p_project_id::text));
  PERFORM 1 FROM public.projects WHERE id = p_project_id AND status = 'published' FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO existing FROM public.project_reviews
  WHERE project_id = p_project_id AND lower(reviewer_name) = lower(btrim(p_reviewer_name))
    AND rating = p_rating AND review_text = btrim(p_review_text)
    AND created_at > NOW() - INTERVAL '10 minutes'
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF FOUND THEN
    IF NOT existing.is_visible THEN RETURN jsonb_build_object('hiddenDuplicate', TRUE); END IF;
    RETURN jsonb_build_object('review', to_jsonb(existing), 'duplicate', TRUE);
  END IF;
  INSERT INTO public.project_reviews(project_id, reviewer_name, rating, review_text)
  VALUES (p_project_id, btrim(p_reviewer_name), p_rating, btrim(p_review_text)) RETURNING * INTO inserted;
  RETURN jsonb_build_object('review', to_jsonb(inserted), 'duplicate', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_project_reviews(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_project_review(UUID, TEXT, SMALLINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_project_reviews(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_project_review(UUID, TEXT, SMALLINT, TEXT) TO service_role;

COMMIT;
