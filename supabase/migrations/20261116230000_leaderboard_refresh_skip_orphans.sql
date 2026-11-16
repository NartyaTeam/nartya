-- Le rafraîchissement des classements échouait depuis le 2026-10-31 :
-- episode_progress contient des user_id de comptes supprimés (aucune FK sur cette table),
-- et leur insertion dans leaderboard_totals (FK vers auth.users) faisait tomber tout le passage.
-- On n'agrège plus que les comptes qui existent encore.

create or replace function public.refresh_stats_snapshot()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lock_key constant bigint := hashtext('refresh_stats_snapshot');
begin
  if not pg_try_advisory_lock(v_lock_key) then
    raise notice 'refresh_stats_snapshot: run précédent toujours actif, on saute ce passage';
    return;
  end if;

  drop table if exists _lb_periods, _lb_totals;
  create temp table _lb_periods on commit drop as
  select * from (values
    ('all',   '-infinity'::timestamptz),
    ('day',   date_trunc('day',   now(), 'Europe/Paris')),
    ('week',  date_trunc('week',  now(), 'Europe/Paris')),
    ('month', date_trunc('month', now(), 'Europe/Paris')),
    ('year',  date_trunc('year',  now(), 'Europe/Paris'))
  ) v(period, since);

  create temp table _lb_totals on commit drop as
  with w as (
    select 'all'::text as period, t.user_id, sum(t.trusted_seconds)::double precision as secs
      from public.watch_time t
     group by 2
    union all
    select p.period, d.user_id, sum(d.seconds)::double precision
      from _lb_periods p
      join public.watch_time_daily d on d.day >= (p.since at time zone 'Europe/Paris')::date
     where p.period <> 'all'
     group by 1, 2
  ),
  e as (
    select p.period, t.user_id,
           count(*) filter (where t.completed and t.duration > 0) as eps,
           count(distinct t.anime_slug) filter (where t.duration > 0) as animes
      from _lb_periods p join public.episode_progress t on t.updated_at >= p.since
     group by 1, 2
  ),
  c as (
    select p.period, r.user_id, count(*) as chapters
      from _lb_periods p join public.scan_chapter_reads r on r.read_at >= p.since
     group by 1, 2
  ),
  we as (
    select coalesce(w.period, e.period) as period, coalesce(w.user_id, e.user_id) as user_id,
           coalesce(w.secs, 0) as secs, coalesce(e.eps, 0) as eps, coalesce(e.animes, 0) as animes
      from w full join e on e.period = w.period and e.user_id = w.user_id
  )
  select coalesce(we.period, c.period) as period, coalesce(we.user_id, c.user_id) as user_id,
         coalesce(we.secs, 0)::double precision as secs, coalesce(we.eps, 0)::bigint as eps,
         coalesce(we.animes, 0)::bigint as animes, coalesce(c.chapters, 0)::bigint as chapters
    from we full join c on c.period = we.period and c.user_id = we.user_id
   where exists (select 1 from auth.users u where u.id = coalesce(we.user_id, c.user_id));

  insert into public.leaderboard_totals (user_id, period, secs, eps, animes, chapters)
  select user_id, period, secs, eps, animes, chapters from _lb_totals
  on conflict (user_id, period) do update
    set secs = excluded.secs, eps = excluded.eps, animes = excluded.animes, chapters = excluded.chapters
    where (leaderboard_totals.secs, leaderboard_totals.eps, leaderboard_totals.animes, leaderboard_totals.chapters)
          is distinct from (excluded.secs, excluded.eps, excluded.animes, excluded.chapters);

  -- Une période qui recommence (nouveau jour, semaine…) efface ceux qui n'y ont encore rien fait.
  delete from public.leaderboard_totals t
   where t.period <> 'all'
     and not exists (select 1 from _lb_totals x where x.user_id = t.user_id and x.period = t.period);

  with ranked as (
    select t.user_id, row_number() over (order by t.secs desc, p.created_at asc) as rnk
    from public.leaderboard_totals t
    join public.profiles p on p.id = t.user_id
    where t.period = 'all'
      and t.secs > 0
      and p.is_public = true
      and coalesce(p.banned, false) = false
      and p.handle is not null
  )
  insert into public.leaderboard_rank_records (user_id, current_rank, best_rank, best_rank_at, updated_at)
  select user_id, rnk, rnk, now(), now() from ranked
  on conflict (user_id) do update
    set current_rank = excluded.current_rank,
        best_rank = least(leaderboard_rank_records.best_rank, excluded.current_rank),
        best_rank_at = case when excluded.current_rank < leaderboard_rank_records.best_rank
                             then now() else leaderboard_rank_records.best_rank_at end,
        updated_at = now();

  update public.leaderboard_rank_records r
  set current_rank = null, updated_at = now()
  where r.current_rank is not null
    and not exists (
      select 1
      from public.leaderboard_totals t
      join public.profiles p on p.id = t.user_id
      where t.user_id = r.user_id and t.period = 'all' and t.secs > 0
        and p.is_public = true and coalesce(p.banned, false) = false and p.handle is not null
    );

  insert into public.stats_snapshot (key, payload, computed_at)
  values ('overview', jsonb_build_object(
    'active_today',  (select count(distinct user_id) from episode_progress where updated_at > now() - interval '1 day'),
    'active_7d',     (select count(distinct user_id) from episode_progress where updated_at > now() - interval '7 days'),
    'active_30d',    (select count(distinct user_id) from episode_progress where updated_at > now() - interval '30 days'),
    'watch_seconds', (select coalesce(sum(position_seconds), 0) from episode_progress),
    'trusted_secs',  (select coalesce(sum(trusted_seconds), 0) from watch_time),
    'episodes',      (select count(*) from episode_progress where completed)
  ), now())
  on conflict (key) do update
    set payload = excluded.payload, computed_at = excluded.computed_at;

  perform pg_advisory_unlock(v_lock_key);
exception when others then
  perform pg_advisory_unlock(v_lock_key);
  raise;
end;
$function$;
