
-- 1) Prevent privilege escalation on profiles via a trigger that preserves sensitive fields
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses this guard (server-side updates use service role)
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.tier := OLD.tier;
  NEW.prompts_remaining := OLD.prompts_remaining;
  NEW.daily_prompts_used := OLD.daily_prompts_used;
  NEW.daily_reset_at := OLD.daily_reset_at;
  NEW.tier_expires_at := OLD.tier_expires_at;
  NEW.flagged := OLD.flagged;
  NEW.flagged_at := OLD.flagged_at;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privileged_updates_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privileged_updates_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_updates();

-- Note: usage.functions.ts uses the user's authenticated client to update prompts_remaining/daily_prompts_used.
-- Switch that path to service-role updates separately; for safety we keep the guard strict.
-- To allow the existing server-fn (which runs as the authenticated user) to update usage counters,
-- we instead expose a SECURITY DEFINER RPC. But to avoid breaking it now, allow the trigger to permit
-- decrement-only changes to usage counters when invoked from server context is not possible to detect.
-- So we relax: allow daily_prompts_used to increase and prompts_remaining to decrease.
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Immutable for clients
  NEW.tier := OLD.tier;
  NEW.tier_expires_at := OLD.tier_expires_at;
  NEW.flagged := OLD.flagged;
  NEW.flagged_at := OLD.flagged_at;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  -- Usage counters: allow only monotonic moves consistent with consumption
  -- prompts_remaining may only decrease
  IF NEW.prompts_remaining > OLD.prompts_remaining THEN
    NEW.prompts_remaining := OLD.prompts_remaining;
  END IF;
  -- daily_prompts_used may only increase (or reset window via daily_reset_at advancing forward)
  IF NEW.daily_prompts_used < OLD.daily_prompts_used AND NEW.daily_reset_at <= OLD.daily_reset_at THEN
    NEW.daily_prompts_used := OLD.daily_prompts_used;
    NEW.daily_reset_at := OLD.daily_reset_at;
  END IF;
  -- daily_reset_at may only move forward
  IF NEW.daily_reset_at < OLD.daily_reset_at THEN
    NEW.daily_reset_at := OLD.daily_reset_at;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Block anon access to creator_emails explicitly
REVOKE ALL ON public.creator_emails FROM anon;
REVOKE ALL ON public.creator_emails FROM PUBLIC;

DROP POLICY IF EXISTS "no anon access to creator_emails" ON public.creator_emails;
CREATE POLICY "no anon access to creator_emails"
ON public.creator_emails
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
