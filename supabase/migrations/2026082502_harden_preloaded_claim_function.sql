-- REG-049 follow-up: the claim endpoint must be callable only after authentication.
-- PostgreSQL grants EXECUTE to PUBLIC by default for new functions, so explicitly
-- revoke that broad grant before allowing the authenticated role.

revoke all on function public.claim_preloaded_user_setup() from public;
grant execute on function public.claim_preloaded_user_setup() to authenticated;
