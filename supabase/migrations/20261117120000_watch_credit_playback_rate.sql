-- Lecture en ×2 : le serveur ne créditait que le temps réel écoulé, donc à ×2 on plafonnait à
-- 50 % de la durée, sous le seuil « réellement vu » (60 %). Le client envoie maintenant la
-- vitesse de lecture ; le crédit d'un battement est multiplié par elle, bornée à [1, 2].
-- Les anciennes signatures sont retirées : avec un argument en plus par défaut, elles
-- rendraient les appels à 4 / 11 arguments ambigus.

drop function if exists public.watch_credit(text, double precision, integer, integer);
drop function if exists public.watch_tick(
  text, text, text, double precision, text, double precision, double precision,
  text, text, integer, integer);

create function public.watch_credit(
  p_episode_key text,
  p_duration double precision,
  p_tz_offset integer,
  p_season_total integer,
  p_rate double precision default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  beat_cap constant integer := 45;   -- plafond crédité/battement (battements ~30 s + marge réseau)
  min_duration constant integer := 180;
  v_me      uuid := auth.uid();
  v_key     text := left(coalesce(trim(p_episode_key), ''), 300);
  v_dur     integer := case
                         when p_duration is null or p_duration < min_duration or p_duration > 86400 then null
                         else floor(p_duration)::int
                       end;
  v_tz      smallint := case
                          when p_tz_offset is null or p_tz_offset < -720 or p_tz_offset > 840 then null
                          else p_tz_offset::smallint
                        end;
  -- Une seconde d'épisode vue à ×2 ne dure qu'une demi-seconde réelle.
  v_rate    double precision := least(2, greatest(1, coalesce(p_rate, 1)));
  v_total   integer;
  v_flipped boolean := false;
  v_user_elapsed integer;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (auth.jwt() ->> 'is_anonymous')::boolean is true then raise exception 'guest_not_allowed'; end if;
  if public.is_banned() then raise exception 'account_banned'; end if;
  if v_key = '' then raise exception 'episode_invalide'; end if;

  select floor(extract(epoch from (now() - last_beat_at)))::int into v_user_elapsed
  from public.watch_clock where user_id = v_me for update;

  insert into public.watch_clock (user_id, last_beat_at) values (v_me, now())
  on conflict (user_id) do update set last_beat_at = now();

  insert into public.watch_time (user_id, episode_key, trusted_seconds, duration_seconds,
                                 tz_offset_minutes, last_beat_at, updated_at)
  values (v_me, v_key, 0, v_dur, v_tz, now(), now())
  on conflict (user_id, episode_key) do update
    set trusted_seconds = public.watch_time.trusted_seconds
          + floor(greatest(0, least(beat_cap,
              floor(extract(epoch from (now() - public.watch_time.last_beat_at)))::int,
              coalesce(v_user_elapsed, beat_cap))) * v_rate)::int,
        duration_seconds = nullif(
          greatest(coalesce(public.watch_time.duration_seconds, 0), coalesce(v_dur, 0)), 0),
        tz_offset_minutes = coalesce(public.watch_time.tz_offset_minutes, v_tz),
        last_beat_at = now(),
        updated_at   = now()
  returning trusted_seconds into v_total;

  update public.watch_time set truly_watched_at = now()
  where user_id = v_me and episode_key = v_key
    and truly_watched and truly_watched_at is null;
  v_flipped := found;

  return jsonb_build_object(
    'total', v_total,
    'unlocked', to_jsonb(public.achievements_evaluate(
      v_me, v_flipped, v_key, v_tz, p_season_total))
  );
end;
$$;

revoke all on function public.watch_credit(text, double precision, integer, integer, double precision)
  from public, anon;
grant execute on function public.watch_credit(text, double precision, integer, integer, double precision)
  to authenticated, service_role;

create function public.watch_tick(
  p_episode_key text,
  p_slug text,
  p_season_id text,
  p_episode_number double precision,
  p_language text,
  p_position double precision,
  p_duration double precision,
  p_title text default null,
  p_cover text default null,
  p_tz_offset integer default null,
  p_season_total integer default null,
  p_rate double precision default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_profile uuid;
  v_pct   double precision;
  v_title text;
  v_res   jsonb;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  v_profile := public.active_profile();

  v_res := public.watch_credit(p_episode_key, p_duration, p_tz_offset, p_season_total, p_rate);

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title = 'Sans titre' then v_title := null; end if;

  v_pct := case when coalesce(p_duration, 0) > 0
                then least(coalesce(p_position, 0) / p_duration * 100, 100)
                else 0 end;

  insert into public.episode_progress (
    user_id, episode_key, anime_slug, anime_title, anime_cover, season_id,
    episode_number, language, position_seconds, duration, progress_percent,
    completed, hidden_from_resume, updated_at
  )
  values (
    v_profile, p_episode_key, p_slug, v_title, p_cover, p_season_id,
    p_episode_number, p_language, p_position, p_duration, v_pct,
    v_pct >= 90, false, now()
  )
  on conflict (user_id, episode_key) do update
    set anime_slug        = excluded.anime_slug,
        anime_title       = coalesce(excluded.anime_title, public.episode_progress.anime_title),
        anime_cover       = coalesce(excluded.anime_cover, public.episode_progress.anime_cover),
        season_id         = excluded.season_id,
        episode_number    = excluded.episode_number,
        language          = excluded.language,
        position_seconds  = excluded.position_seconds,
        duration          = excluded.duration,
        progress_percent  = excluded.progress_percent,
        completed         = excluded.completed,
        hidden_from_resume = false,
        updated_at        = now();

  return v_res;
end;
$$;

revoke all on function public.watch_tick(
  text, text, text, double precision, text, double precision, double precision,
  text, text, integer, integer, double precision)
  from public, anon;
grant execute on function public.watch_tick(
  text, text, text, double precision, text, double precision, double precision,
  text, text, integer, integer, double precision)
  to authenticated, service_role;
