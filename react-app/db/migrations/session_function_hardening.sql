-- Harden custom-session internals.
--
-- The app uses public RPC endpoints such as login_user, logout_user,
-- set_first_password, and admin_* functions. The helpers below are internal
-- implementation details and must not be callable directly from the anon key.

revoke execute on function public.create_user_session(uuid) from public, anon, authenticated;
revoke execute on function public.session_hash(text) from public, anon, authenticated;
revoke execute on function public.session_user(text) from public, anon, authenticated;
revoke execute on function public.require_admin(text) from public, anon, authenticated;

-- Legacy auth endpoints from older app versions are not used by the React app.
-- Leaving them callable would keep registration/password flows open outside
-- the current admin-managed user model.
revoke execute on function public.register_user(text, text, text) from public, anon, authenticated;
revoke execute on function public.change_password(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Keep intended public endpoints callable.
grant execute on function public.check_username(text) to anon, authenticated;
grant execute on function public.set_first_password(text, text) to anon, authenticated;
grant execute on function public.login_user(text, text) to anon, authenticated;
grant execute on function public.logout_user(text) to anon, authenticated;
grant execute on function public.get_all_users(text) to anon, authenticated;
grant execute on function public.admin_create_user(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_reset_password(text, uuid) to anon, authenticated;
grant execute on function public.update_user_role(text, uuid, text) to anon, authenticated;
grant execute on function public.update_user_routes(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, uuid) to anon, authenticated;
grant execute on function public.admin_impersonate_user(text, uuid) to anon, authenticated;
grant execute on function public.reset_routes_id_sequence() to anon, authenticated;

-- Pin search_path on remaining legacy/helper functions flagged by advisors.
alter function public.handle_new_user() set search_path = public;
alter function public.lebuser_pickup_date(text, text, integer) set search_path = public;
alter function public.driver_trip_assert_can_finish() set search_path = public;
