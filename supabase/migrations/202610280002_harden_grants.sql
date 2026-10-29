revoke all on table public.trend_analyses from anon, authenticated;
revoke all on table public.saved_items from anon, authenticated;

grant select, insert, update, delete on table public.trend_analyses to authenticated;
grant select, insert, update, delete on table public.saved_items to authenticated;
