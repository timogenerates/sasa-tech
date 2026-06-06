CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Usage counters are server-managed only. Clients cannot modify them at all.
  NEW.prompts_remaining := OLD.prompts_remaining;
  NEW.daily_prompts_used := OLD.daily_prompts_used;
  NEW.daily_reset_at := OLD.daily_reset_at;

  RETURN NEW;
END;
$function$;