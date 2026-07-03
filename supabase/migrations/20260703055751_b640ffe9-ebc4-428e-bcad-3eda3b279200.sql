
-- 1) Restrict avatars bucket SELECT to owner only (defense in depth; signed URLs still work)
DROP POLICY IF EXISTS "Avatars are readable" ON storage.objects;
CREATE POLICY "Users read own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 2) Defense-in-depth for privileged profile columns: revoke column-level UPDATE
--    even for authenticated users. The existing trigger still runs as a backstop.
REVOKE UPDATE (tier, prompts_remaining, daily_prompts_used, daily_reset_at, tier_expires_at, flagged, flagged_at, id, created_at)
  ON public.profiles FROM authenticated;
REVOKE UPDATE (tier, prompts_remaining, daily_prompts_used, daily_reset_at, tier_expires_at, flagged, flagged_at, id, created_at)
  ON public.profiles FROM anon;

-- Explicitly grant only the columns clients may safely update
GRANT UPDATE (display_name, avatar_url, email, updated_at) ON public.profiles TO authenticated;
