ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.sync_project_state_invariants() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.check_project_media_limit() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.check_published_project_media_safety() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.check_project_publication_media() SET search_path = public, pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;
