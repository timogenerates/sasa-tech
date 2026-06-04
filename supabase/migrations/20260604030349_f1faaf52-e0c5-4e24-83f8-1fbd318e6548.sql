
-- Profiles: explicit self-scoped INSERT/DELETE policies
CREATE POLICY "users insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users delete own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- creator_emails: revoke any client access, allow service_role only
REVOKE ALL ON public.creator_emails FROM anon, authenticated;
GRANT ALL ON public.creator_emails TO service_role;

-- Explicit deny-by-default policy so intent is documented
CREATE POLICY "no client access to creator_emails"
  ON public.creator_emails
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
