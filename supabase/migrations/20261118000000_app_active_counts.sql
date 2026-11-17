-- Nombre d'utilisateurs actifs par app, affiché par le Nartya Hub.
-- Agrégat seul (aucun user_id ne sort) : même fenêtre de 3 minutes que online_count().
-- touch_app_presence n'écrit qu'une fois toutes les 100 s par utilisateur, d'où la marge.

create or replace function public.app_active_counts()
returns table (app_id text, active integer)
language sql
stable
security definer
set search_path = public
as $$
  select ap.app_id, count(*)::int
  from public.app_presence ap
  where ap.app_id in ('nartya-anime', 'nartya-movie', 'nartya-fm', 'nartya-games', 'nartya-tcg')
    and ap.last_seen_at > now() - interval '3 minutes'
  group by ap.app_id;
$$;

revoke all on function public.app_active_counts() from public;
grant execute on function public.app_active_counts() to anon, authenticated;
