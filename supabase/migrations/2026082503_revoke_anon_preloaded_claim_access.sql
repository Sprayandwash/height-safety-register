-- REG-049 follow-up: do not retain an explicit anonymous-role grant after the
-- PUBLIC grant has been removed. The claim endpoint is for signed-in users only.

revoke all on function public.claim_preloaded_user_setup() from anon;
grant execute on function public.claim_preloaded_user_setup() to authenticated;
