-- Schéma de la base Nartya (Supabase), sans données.
-- Généré depuis la base de production : pg_dump du schéma public, puis les buckets et
-- policies du stockage, puis les tâches planifiées (pg_cron).
-- À charger sur un projet Supabase neuf, après création des schémas auth et storage.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER SCHEMA public OWNER TO pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE FUNCTION public._comment_assert_can_write(p_me uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_anon    boolean;
  v_banned  boolean;
  v_created timestamptz;
begin
  if p_me is null then raise exception 'forbidden'; end if;

  select is_anonymous into v_anon from auth.users where id = p_me;
  if coalesce(v_anon, false) then raise exception 'guest_not_allowed'; end if;

  select coalesce(banned, false), created_at into v_banned, v_created
    from public.profiles where id = p_me;
  if v_banned then raise exception 'account_banned'; end if;
  if v_created is null
     or v_created > now() - make_interval(mins => public.comment_min_account_minutes()) then
    raise exception 'account_too_recent';
  end if;
end; $$;

ALTER FUNCTION public._comment_assert_can_write(p_me uuid) OWNER TO postgres;

CREATE FUNCTION public.achievement_tier(p_family text, p_value bigint) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select (case p_family
    when 'night_owl'  then case when p_value >= 50    then 3 when p_value >= 10    then 2 when p_value >= 1 then 1 else 0 end
    when 'marathon'   then case when p_value >= 8     then 3 when p_value >= 5     then 2 when p_value >= 3 then 1 else 0 end
    when 'watch_time' then case when p_value >= 43200 then 3 when p_value >= 18000 then 2 when p_value >= 3600 then 1 else 0 end
    when 'completion' then case when p_value >= 20    then 3 when p_value >= 5     then 2 when p_value >= 1 then 1 else 0 end
    else 0 end)::smallint;
$$;

ALTER FUNCTION public.achievement_tier(p_family text, p_value bigint) OWNER TO postgres;

CREATE FUNCTION public.achievements_evaluate(p_user uuid, p_flipped boolean, p_episode_key text, p_tz_offset integer, p_season_total integer) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  marathon_cap constant integer := 8;  -- au-delà, aucune récompense supplémentaire (cf. doc)
  -- Ordre de référence des familles : les tableaux v_counts / v_tiers s'alignent dessus.
  FAMILIES constant text[] := array['night_owl', 'marathon', 'watch_time', 'completion'];
  v_counts   bigint[];
  v_tiers    smallint[];
  v_i        integer;
  v_trusted  bigint;
  v_s        public.user_achievement_stats;
  v_local    timestamp;   -- heure MURALE du membre (sans fuseau), cf. note ci-dessous
  v_day      date;
  v_slug     text;
  v_season   text;
  v_total    integer;
  v_watched  integer;
  v_done     timestamptz;
  v_dirty    boolean := false;
  v_new      text[]  := '{}';
  v_tier     smallint;
  v_lvl      integer;
begin
  -- Ligne d'agrégat lue, pas réécrite : un upsert créerait un tuple mort à chaque battement.
  -- L'insertion n'a lieu qu'une fois dans la vie du membre.
  select * into v_s from public.user_achievement_stats where user_id = p_user;
  if not found then
    insert into public.user_achievement_stats (user_id) values (p_user)
    on conflict (user_id) do nothing;  -- course entre deux appareils : le perdant relit
    select * into v_s from public.user_achievement_stats where user_id = p_user;
  end if;

  -- Lu à la source, jamais dupliqué, et rétroactif : les paliers 1 h / 5 h / 12 h se débloquent
  -- dès le premier battement pour les membres déjà actifs.
  select coalesce(sum(trusted_seconds), 0) into v_trusted
  from public.watch_time where user_id = p_user;

  -- ─── Chemin froid : un épisode vient de basculer à « réellement vu » ───────
  if p_flipped then
    v_dirty := true;
    -- `at time zone 'utc'` détache le fuseau : sinon `extract(hour …)` dépendrait du TimeZone de
    -- la session. Fuseau inconnu → UTC : au pire un badge de nuit raté, jamais un à tort.
    v_local := (now() at time zone 'utc') + make_interval(mins => coalesce(p_tz_offset, 0));
    v_day   := v_local::date;

    -- night_owl : terminé entre 00:00 et 04:59 heure locale.
    if extract(hour from v_local) < 5 then
      v_s.night_episodes := v_s.night_episodes + 1;
    end if;

    -- marathon : compteur de la journée locale courante, et record historique. Le record ne
    -- redescend jamais — c'est un maximum, pas un instantané.
    if v_s.day_key is distinct from v_day then
      v_s.day_key := v_day;
      v_s.day_episodes := 1;
    else
      v_s.day_episodes := v_s.day_episodes + 1;
    end if;
    v_s.best_day_episodes := least(greatest(v_s.best_day_episodes, v_s.day_episodes), marathon_cap);

    -- completion : toutes les unités de la saison réellement vues.
    if coalesce(p_season_total, 0) > 0 then
      v_slug   := split_part(p_episode_key, ':', 1);
      v_season := split_part(p_episode_key, ':', 2);

      insert into public.user_season_progress (user_id, anime_slug, season_id, total_units)
      values (p_user, v_slug, v_season, p_season_total)
      on conflict (user_id, anime_slug, season_id) do update
        set total_units = greatest(public.user_season_progress.total_units, excluded.total_units)
      returning total_units, completed_at into v_total, v_done;

      if v_done is null then
        -- Distinct sur le numéro : un épisode vu en VF puis en VOSTFR ne compte qu'une fois.
        -- Borné par l'index partiel `watch_time_real_episodes`, une fois par épisode terminé.
        select count(distinct split_part(episode_key, ':', 3)) into v_watched
        from public.watch_time
        where user_id = p_user
          and truly_watched
          and split_part(episode_key, ':', 1) = v_slug
          and split_part(episode_key, ':', 2) = v_season;

        if v_watched >= v_total then
          update public.user_season_progress set completed_at = now()
          where user_id = p_user and anime_slug = v_slug and season_id = v_season;
          v_s.completed_seasons := v_s.completed_seasons + 1;
        end if;
      end if;
    end if;
  end if;

  -- Paliers : `user_achievements` n'est touchée qu'au franchissement. Tableaux parallèles plutôt
  -- qu'un `case` : plpgsql termine la condition d'un IF au premier `then`.
  v_counts := array[v_s.night_episodes, v_s.best_day_episodes,
                    v_trusted, v_s.completed_seasons];
  v_tiers  := array[v_s.night_owl_tier, v_s.marathon_tier,
                    v_s.watch_time_tier, v_s.completion_tier];

  for v_i in 1 .. array_length(FAMILIES, 1) loop
    v_tier := public.achievement_tier(FAMILIES[v_i], v_counts[v_i]);
    if v_tier > v_tiers[v_i] then
      -- Un saut de plusieurs paliers (amorçage rétroactif du temps de visionnage) attribue
      -- bien chaque palier intermédiaire : la collection ne doit pas avoir de trou.
      for v_lvl in v_tiers[v_i] + 1 .. v_tier loop
        insert into public.user_achievements (user_id, achievement_id)
        values (p_user, FAMILIES[v_i] || '_' || v_lvl)
        on conflict do nothing;
        v_new := v_new || (FAMILIES[v_i] || '_' || v_lvl);
      end loop;
      v_tiers[v_i] := v_tier;
      v_dirty := true;
    end if;
  end loop;

  v_s.night_owl_tier  := v_tiers[1];
  v_s.marathon_tier   := v_tiers[2];
  v_s.watch_time_tier := v_tiers[3];
  v_s.completion_tier := v_tiers[4];

  -- Écriture UNIQUEMENT si quelque chose a bougé : le battement ordinaire ne touche pas
  -- cette table, donc pas de version de ligne morte toutes les 30 s.
  if v_dirty then
    update public.user_achievement_stats set
      night_episodes    = v_s.night_episodes,
      -- (le temps de visionnage vit dans watch_time)
      day_key           = v_s.day_key,
      day_episodes      = v_s.day_episodes,
      best_day_episodes = v_s.best_day_episodes,
      completed_seasons = v_s.completed_seasons,
      night_owl_tier    = v_s.night_owl_tier,
      marathon_tier     = v_s.marathon_tier,
      watch_time_tier   = v_s.watch_time_tier,
      completion_tier   = v_s.completion_tier,
      updated_at        = now()
    where user_id = p_user;
  end if;

  return v_new;
end; $$;

ALTER FUNCTION public.achievements_evaluate(p_user uuid, p_flipped boolean, p_episode_key text, p_tz_offset integer, p_season_total integer) OWNER TO postgres;

CREATE FUNCTION public.admin_account_types() RETURNS TABLE(discord bigint, email bigint, guest bigint, other bigint, contactable_emails bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select payload->'accounts' into v from public.stats_snapshot where key = 'admin_dashboard';
  return query select
    coalesce((v->>'discord')::bigint, 0),
    coalesce((v->>'email')::bigint, 0),
    coalesce((v->>'guest')::bigint, 0),
    coalesce((v->>'other')::bigint, 0),
    coalesce((v->>'contactableEmails')::bigint, 0);
end;
$$;

ALTER FUNCTION public.admin_account_types() OWNER TO postgres;

CREATE FUNCTION public.admin_activity_daily(days integer DEFAULT 30) RETURNS TABLE(day date, episodes bigint, watch_seconds double precision, active_users bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  days := least(greatest(coalesce(days, 30), 1), 30);
  return query
  select (x.item->>'day')::date,
         coalesce((x.item->>'episodes')::bigint, 0),
         coalesce((x.item->>'watchSeconds')::double precision, 0),
         coalesce((x.item->>'activeUsers')::bigint, 0)
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'activity') with ordinality as x(item, ord)
  where s.key = 'admin_dashboard'
    and (x.item->>'day')::date >= current_date - (days - 1)
  order by x.ord;
end;
$$;

ALTER FUNCTION public.admin_activity_daily(days integer) OWNER TO postgres;

CREATE FUNCTION public.admin_app_presence_overview() RETURNS TABLE(app_id text, app_version text, platform text, active_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;

  return query
    select ap.app_id, coalesce(ap.app_version, 'inconnue'), coalesce(ap.platform, 'inconnue'), count(*)::int
    from public.app_presence ap
    where ap.app_id in ('nartya-anime', 'nartya-hub')
      and ap.last_seen_at > now() - interval '15 minutes'
    group by ap.app_id, ap.app_version, ap.platform
    order by ap.app_id, active_count desc;
end;
$$;

ALTER FUNCTION public.admin_app_presence_overview() OWNER TO postgres;

CREATE FUNCTION public.admin_ban_machine(target_id uuid, p_reason text DEFAULT NULL::text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_mid text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if target_id = auth.uid() then raise exception 'cannot ban yourself'; end if;
  select machine_id into v_mid from public.profiles where id = target_id;
  if v_mid is null then raise exception 'no_machine'; end if;

  insert into public.banned_machines (machine_id, reason, banned_until, created_by)
  values (v_mid, nullif(trim(coalesce(p_reason, '')), ''), p_until, auth.uid())
  on conflict (machine_id) do update
    set reason = excluded.reason, banned_until = excluded.banned_until,
        created_by = excluded.created_by, created_at = now();

  -- Cohérence : on bannit aussi le compte cible.
  update public.profiles
     set banned = true, ban_reason = nullif(trim(coalesce(p_reason, '')), ''),
         banned_until = p_until, banned_at = now(), banned_by = auth.uid()
   where id = target_id;

  return json_build_object('ok', true);
end; $$;

ALTER FUNCTION public.admin_ban_machine(target_id uuid, p_reason text, p_until timestamp with time zone) OWNER TO postgres;

CREATE FUNCTION public.admin_clear_anime_identity(p_slug text, p_season_id text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_supprimees int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  delete from public.anime_identity
  where slug = p_slug and season_id = p_season_id and source = 'locked';
  get diagnostics v_supprimees = row_count;
  return json_build_object('ok', true, 'supprimees', v_supprimees);
end; $$;

ALTER FUNCTION public.admin_clear_anime_identity(p_slug text, p_season_id text) OWNER TO postgres;

CREATE FUNCTION public.admin_create_announcement(p_title text, p_body text, p_type text DEFAULT 'info'::text, p_buttons jsonb DEFAULT '[]'::jsonb, p_target uuid DEFAULT NULL::uuid, p_draft boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'message_requis';
  end if;
  if p_type not in ('info', 'success', 'warning') then p_type := 'info'; end if;
  insert into public.announcements (author_id, title, body, type, buttons, target_user_id, is_draft, published_at)
  values (auth.uid(), nullif(left(btrim(coalesce(p_title, '')), 120), ''), p_body, p_type,
          public.sanitize_announcement_buttons(p_buttons), p_target,
          coalesce(p_draft, false), case when coalesce(p_draft, false) then null else now() end)
  returning id into v_id;
  return v_id;
end; $$;

ALTER FUNCTION public.admin_create_announcement(p_title text, p_body text, p_type text, p_buttons jsonb, p_target uuid, p_draft boolean) OWNER TO postgres;

CREATE FUNCTION public.admin_create_staff_announcement(p_title text, p_body text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required'; end if;

  insert into public.staff_announcements (author_id, title, body)
  values (auth.uid(), nullif(trim(coalesce(p_title, '')), ''), trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

ALTER FUNCTION public.admin_create_staff_announcement(p_title text, p_body text) OWNER TO postgres;

CREATE FUNCTION public.admin_dashboard_snapshot() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_payload  jsonb;
  v_overview jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;

  select payload into v_payload
  from public.stats_snapshot
  where key = 'admin_dashboard';
  if v_payload is null then raise exception 'dashboard snapshot unavailable'; end if;

  select jsonb_build_object(
    'totalUsers', o.total_users,
    'totalAdmins', o.total_admins,
    'totalBanned', o.total_banned,
    'activeToday', o.active_today,
    'active7d', o.active_7d,
    'active30d', o.active_30d,
    'newToday', o.new_today,
    'new7d', o.new_7d,
    'onlineNow', o.online_now,
    'onlineAndroid', o.online_android,
    'premiumActive', o.premium_active,
    'totalWatchSeconds', o.total_watch_seconds,
    'trustedWatchSeconds', o.trusted_watch_seconds,
    'totalEpisodes', o.total_episodes
  ) into v_overview
  from public.admin_overview() o;

  return jsonb_set(v_payload, '{overview}', v_overview, false);
end;
$$;

ALTER FUNCTION public.admin_dashboard_snapshot() OWNER TO postgres;

CREATE FUNCTION public.admin_delete_announcement(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  delete from public.announcements where id = p_id;
end; $$;

ALTER FUNCTION public.admin_delete_announcement(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.admin_delete_staff_announcement(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  delete from public.staff_announcements where id = p_id;
end;
$$;

ALTER FUNCTION public.admin_delete_staff_announcement(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.admin_extend_premium(target_id uuid, p_tier text, p_months integer, p_days integer DEFAULT 0) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cur_tier  text;
  v_cur_until timestamptz;
  v_base      timestamptz;
  v_new       timestamptz;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_tier is null or p_tier not in ('plus', 'ultimate') then raise exception 'invalid_tier'; end if;
  if coalesce(p_months, 0) < 0 or coalesce(p_days, 0) < 0 then raise exception 'invalid_duration'; end if;
  if coalesce(p_months, 0) = 0 and coalesce(p_days, 0) = 0 then raise exception 'invalid_duration'; end if;

  select premium_tier, premium_until into v_cur_tier, v_cur_until
    from public.profiles where id = target_id;

  -- Cumul consécutif : on ne prolonge depuis l'échéance existante que si l'abonnement est
  -- ENCORE actif ET a une échéance finie. Un abonnement expiré (ou inexistant) repart de now().
  -- Un premium « à vie » (échéance null) repart aussi de now() → il devient dès lors à durée.
  if v_cur_tier is not null and v_cur_until is not null and v_cur_until > now() then
    v_base := v_cur_until;
  else
    v_base := now();
  end if;

  v_new := v_base + make_interval(months => coalesce(p_months, 0), days => coalesce(p_days, 0));

  update public.profiles
    set premium_tier = p_tier, premium_until = v_new
    where id = target_id;

  return v_new;
end; $$;

ALTER FUNCTION public.admin_extend_premium(target_id uuid, p_tier text, p_months integer, p_days integer) OWNER TO postgres;

CREATE FUNCTION public.admin_get_profile(p_id uuid) RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, banner text, bio text, role text, accent_color text, created_at timestamp with time zone, is_public boolean, activity_public boolean, favorites_public boolean, friends_public boolean, presence_public boolean, total_watch_seconds double precision, total_episodes bigint, total_animes bigint, premium_tier text, premium_until timestamp with time zone, profile_emblem text, ambient_theme text, cosmetic_ornament text, cosmetic_banner text, cosmetic_particles text, friends_count bigint, last_active timestamp with time zone, views_count integer, discord_id text, banned boolean, last_login timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom,
    p.banner, p.bio, p.role, p.accent_color, p.created_at,
    p.is_public, p.activity_public, p.favorites_public,
    p.friends_public, p.presence_public,
    coalesce(wt.secs, 0), coalesce(st.eps, 0), coalesce(st.animes, 0),
    eff.tier,
    p.premium_until,
    p.profile_emblem,
    case when public.cosmetic_ok('particles', p.ambient_theme, eff.tier)
         then p.ambient_theme else null end,
    case when public.cosmetic_ok('ornament', p.cosmetic_ornament, eff.tier)
         then p.cosmetic_ornament else null end,
    case when public.cosmetic_ok('banner', p.cosmetic_banner, eff.tier)
         then p.cosmetic_banner else null end,
    case when public.cosmetic_ok('particles', p.cosmetic_particles, eff.tier)
         then p.cosmetic_particles else null end,
    coalesce(fc.n, 0),
    p.last_login,
    p.views_count,
    p.discord_id, p.banned, p.last_login
  from public.profiles p
  cross join lateral (
    select case when p.premium_tier is not null
                     and (p.premium_until is null or p.premium_until > now())
                then p.premium_tier else null end as tier
  ) eff
  left join lateral (
    select sum(trusted_seconds)::double precision as secs
    from public.watch_time where user_id = p.id
  ) wt on true
  left join lateral (
    select count(*) filter (where completed) as eps,
           count(distinct anime_slug) as animes
    from public.episode_progress where user_id = p.id
  ) st on true
  left join lateral (
    select count(*) as n from public.friendships f
    where f.status = 'accepted' and (f.requester_id = p.id or f.addressee_id = p.id)
  ) fc on true
  where p.id = p_id;
end; $$;

ALTER FUNCTION public.admin_get_profile(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.admin_list_anime_identity(p_filter text DEFAULT 'todo'::text, p_search text DEFAULT NULL::text, lim integer DEFAULT 50, off integer DEFAULT 0) RETURNS TABLE(slug text, season_id text, season_name text, anilist_ids bigint[], tmdb_id bigint, tmdb_season integer, episode_offset integer, confidence smallint, source text, evidence jsonb, episodes_concernes integer, updated_at timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_filter text := lower(coalesce(nullif(trim(p_filter), ''), 'todo'));
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if v_filter not in ('todo', 'unresolved', 'low', 'locked', 'served', 'all') then
    v_filter := 'todo';
  end if;

  return query
  with base as (
    select
      s.slug,
      s.season_id,
      s.name as season_name,
      i.anilist_ids,
      i.tmdb_id,
      i.tmdb_season,
      i.episode_offset,
      i.confidence,
      i.source,
      i.evidence,
      nullif(i.evidence #>> '{preuves,episodes,servis}', '')::int as episodes_concernes,
      i.updated_at
    from public.anime_seasons s
    left join public.anime_identity i
      on i.slug = s.slug and i.season_id = s.season_id
  ),
  filtre as (
    select * from base b
    where
      case v_filter
        -- « À traiter » : tout ce que la route ne sert PAS aujourd'hui, verrous exclus (ils
        -- sont servis quelle que soit leur confiance, donc déjà réglés).
        when 'todo'       then b.source is distinct from 'locked'
                               and (b.confidence is null or b.confidence < 75)
        when 'unresolved' then b.confidence is null
        when 'low'        then b.source is distinct from 'locked'
                               and b.confidence between 60 and 74
        when 'locked'     then b.source = 'locked'
        when 'served'     then b.source = 'locked' or b.confidence >= 75
        else true
      end
      and (
        v_search is null
        or b.slug ilike '%' || v_search || '%'
        or coalesce(b.season_name, '') ilike '%' || v_search || '%'
      )
  )
  select
    f.slug, f.season_id, f.season_name, f.anilist_ids, f.tmdb_id, f.tmdb_season,
    f.episode_offset, f.confidence, f.source, f.evidence, f.episodes_concernes, f.updated_at,
    (select count(*) from filtre) as total_count
  from filtre f
  order by f.episodes_concernes desc nulls last, f.slug, f.season_id
  limit greatest(1, least(coalesce(lim, 50), 200))
  offset greatest(0, coalesce(off, 0));
end; $$;

ALTER FUNCTION public.admin_list_anime_identity(p_filter text, p_search text, lim integer, off integer) OWNER TO postgres;

CREATE FUNCTION public.admin_list_announcements(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, title text, body text, type text, buttons jsonb, created_at timestamp with time zone, is_global boolean, author_name text, author_avatar text, target_name text, target_avatar text, read_count bigint, total_count bigint, is_draft boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select
    a.id, a.title, a.body, a.type, a.buttons, a.created_at,
    (a.target_user_id is null) as is_global,
    au.username, au.avatar,
    tu.username, tu.avatar,
    (select count(*) from public.announcement_reads r where r.announcement_id = a.id) as read_count,
    (select count(*) from public.announcements) as total_count,
    a.is_draft
  from public.announcements a
  left join public.profiles au on au.id = a.author_id
  left join public.profiles tu on tu.id = a.target_user_id
  order by a.created_at desc
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
end; $$;

ALTER FUNCTION public.admin_list_announcements(p_limit integer, p_offset integer) OWNER TO postgres;

CREATE FUNCTION public.admin_list_blocked_words() RETURNS TABLE(word text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query select w.word, w.created_at from public.comment_blocked_words w order by w.word;
end; $$;

ALTER FUNCTION public.admin_list_blocked_words() OWNER TO postgres;

CREATE FUNCTION public.admin_list_comment_reports(p_status text DEFAULT 'open'::text, lim integer DEFAULT 50, off integer DEFAULT 0) RETURNS TABLE(id uuid, comment_id uuid, reason text, status text, created_at timestamp with time zone, reporter_username text, author_id uuid, author_username text, body text, target_kind text, target_key text, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query
  select
    r.id, r.comment_id, r.reason, r.status, r.created_at,
    rp.username, c.user_id, ap.username,
    c.body, c.target_kind, c.target_key,
    (select count(*) from public.comment_reports r2
      where p_status = 'all' or r2.status = p_status)
  from public.comment_reports r
  join public.comments c  on c.id = r.comment_id
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles ap on ap.id = c.user_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit greatest(1, least(lim, 100)) offset greatest(0, off);
end; $$;

ALTER FUNCTION public.admin_list_comment_reports(p_status text, lim integer, off integer) OWNER TO postgres;

CREATE FUNCTION public.admin_list_scan_offsets() RETURNS TABLE(oeuvre text, chapter_offset integer, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query
  select o.oeuvre, o.chapter_offset, o.updated_at
  from public.scan_offsets o
  order by o.updated_at desc;
end; $$;

ALTER FUNCTION public.admin_list_scan_offsets() OWNER TO postgres;

CREATE FUNCTION public.admin_list_staff() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_out jsonb;
begin
  if not is_staff() then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'avatar', p.avatar,
    'discordId', p.discord_id,
    'role', p.role,
    'createdAt', p.created_at,
    'lastSeenAt', p.last_seen_at,
    'claimedOpen', (
      select count(*) from public.bug_reports r
      where r.staff_user_id = p.id and r.status = 'handled'
    ),
    'resolvedCount', (
      select count(*) from public.bug_reports r
      where r.staff_user_id = p.id and r.status = 'resolved'
    ),
    'rejectedCount', (
      select count(*) from public.bug_reports r
      where r.staff_user_id = p.id and r.status = 'rejected'
    ),
    'banEvents24h', (
      select count(*) from public.staff_ban_events e
      where e.actor_id = p.id and e.created_at > now() - interval '24 hours'
    ),
    'banEventsTotal', (
      select count(*) from public.staff_ban_events e where e.actor_id = p.id
    )
  ) order by (p.role = 'admin') desc, p.username asc), '[]'::jsonb)
  into v_out
  from public.profiles p
  where p.role in ('staff', 'admin');

  return v_out;
end;
$$;

ALTER FUNCTION public.admin_list_staff() OWNER TO postgres;

CREATE FUNCTION public.admin_list_staff_announcements() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_out jsonb;
begin
  if not is_staff() then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'body', a.body,
    'createdAt', a.created_at,
    'authorId', a.author_id,
    'authorName', p.username,
    'authorAvatar', p.avatar,
    'authorRole', p.role
  ) order by a.created_at desc), '[]'::jsonb)
  into v_out
  from public.staff_announcements a
  left join public.profiles p on p.id = a.author_id;

  return v_out;
end;
$$;

ALTER FUNCTION public.admin_list_staff_announcements() OWNER TO postgres;

CREATE FUNCTION public.admin_list_staff_audit(p_actor uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_search text DEFAULT NULL::text, lim integer DEFAULT 50, off integer DEFAULT 0) RETURNS TABLE(id bigint, created_at timestamp with time zone, actor_id uuid, actor_name text, actor_role text, actor_avatar text, action text, target_type text, target_id text, target_label text, details jsonb, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return query
  select l.id, l.created_at, l.actor_id, coalesce(p.username, l.actor_name), l.actor_role, p.avatar,
         l.action, l.target_type, l.target_id, l.target_label, l.details,
         count(*) over ()
    from public.staff_audit_log l
    left join public.profiles p on p.id = l.actor_id
   where (p_actor is null or l.actor_id = p_actor)
     and (p_category is null or l.action like p_category || '.%')
     and (v_q is null
          or l.target_label ilike '%' || v_q || '%'
          or l.target_id = v_q
          or coalesce(p.username, l.actor_name) ilike '%' || v_q || '%'
          or l.action ilike '%' || v_q || '%')
   order by l.created_at desc, l.id desc
   limit least(greatest(coalesce(lim, 50), 1), 200)
  offset greatest(coalesce(off, 0), 0);
end;
$$;

ALTER FUNCTION public.admin_list_staff_audit(p_actor uuid, p_category text, p_search text, lim integer, off integer) OWNER TO postgres;

CREATE FUNCTION public.admin_list_users(search text DEFAULT ''::text, lim integer DEFAULT 20, off integer DEFAULT 0, sort text DEFAULT 'recent'::text, p_account text DEFAULT ''::text, p_platform text DEFAULT ''::text) RETURNS TABLE(id uuid, username text, avatar text, discord_id text, role text, banned boolean, ban_reason text, banned_until timestamp with time zone, machine_banned boolean, created_at timestamp with time zone, last_login timestamp with time zone, app_version text, platform text, last_seen_at timestamp with time zone, is_online boolean, app_clients jsonb, active_apps text[], episodes_watched bigint, watch_seconds double precision, premium_tier text, premium_until timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  return query
  with filtered as (
    select p.*
    from profiles p
    join auth.users u on u.id = p.id
    where (
        search = ''
        or p.username ilike '%' || search || '%'
        or p.discord_id ilike '%' || search || '%'
      )
      and (
        p_account = '' or p_account is null
        or (p_account = 'guest'   and u.is_anonymous)
        or (p_account = 'email'   and not u.is_anonymous and (u.raw_app_meta_data->>'provider') = 'email')
        or (p_account = 'discord' and not u.is_anonymous and (u.raw_app_meta_data->>'provider') = 'discord')
      )
      and (
        p_platform = '' or p_platform is null
        or p.platform = p_platform
        or exists(
          select 1 from public.app_presence ap
          where ap.user_id = p.id and ap.platform = p_platform
        )
      )
  )
  select
    f.id, f.username, f.avatar, f.discord_id, f.role, f.banned,
    f.ban_reason, f.banned_until,
    exists(
      select 1 from public.banned_machines bm
      where bm.machine_id = f.machine_id
        and (bm.banned_until is null or bm.banned_until > now())
    ) as machine_banned,
    f.created_at, f.last_login,
    f.app_version, f.platform, f.last_seen_at,
    (f.last_seen_at is not null and f.last_seen_at > now() - interval '3 minutes') as is_online,
    coalesce((
      select jsonb_object_agg(
        ap.app_id,
        jsonb_build_object(
          'version', ap.app_version,
          'platform', ap.platform,
          'lastSeenAt', ap.last_seen_at
        )
        order by ap.app_id
      )
      from public.app_presence ap
      where ap.user_id = f.id
    ), '{}'::jsonb) as app_clients,
    coalesce((
      select array_agg(ap.app_id order by ap.app_id)
      from public.app_presence ap
      where ap.user_id = f.id
        and ap.last_seen_at > now() - interval '3 minutes'
    ), '{}'::text[]) as active_apps,
    f.episodes_watched_total::bigint as episodes_watched,
    f.watch_seconds_total as watch_seconds,
    f.premium_tier, f.premium_until,
    count(*) over () as total_count
  from filtered f
  order by
    case when sort = 'banned_first' then f.banned end desc nulls last,
    case when sort = 'watch_desc'    then f.watch_seconds_total end desc nulls last,
    case when sort = 'episodes_desc' then f.episodes_watched_total end desc nulls last,
    case when sort = 'created_desc'  then f.created_at end desc nulls last,
    case when sort = 'created_asc'   then f.created_at end asc  nulls last,
    case when sort = 'username_asc'  then lower(f.username) end asc nulls last,
    case when sort = 'role_desc'
         then case f.role when 'admin' then 3 when 'staff' then 2 else 1 end end desc nulls last,
    case when sort = 'version_desc' and f.app_version ~ '^[0-9]+(\.[0-9]+){0,3}$'
         then string_to_array(f.app_version, '.')::int[] end desc nulls last,
    case when sort = 'version_asc' and f.app_version ~ '^[0-9]+(\.[0-9]+){0,3}$'
         then string_to_array(f.app_version, '.')::int[] end asc nulls last,
    case when sort = 'premium_desc'
         then case f.premium_tier when 'ultimate' then 2 when 'plus' then 1 else 0 end end desc nulls last,
    case when sort = 'premium_desc' then f.premium_until end desc nulls last,
    f.last_seen_at desc nulls last, f.created_at desc
  limit greatest(1, least(lim, 100)) offset greatest(0, off);
end;
$_$;

ALTER FUNCTION public.admin_list_users(search text, lim integer, off integer, sort text, p_account text, p_platform text) OWNER TO postgres;

CREATE FUNCTION public.admin_overview() RETURNS TABLE(total_users bigint, total_admins bigint, total_banned bigint, active_today bigint, active_7d bigint, active_30d bigint, new_today bigint, new_7d bigint, online_now bigint, online_android bigint, premium_active bigint, total_watch_seconds double precision, trusted_watch_seconds double precision, total_episodes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select payload->'overview' into v from public.stats_snapshot where key = 'admin_dashboard';

  return query
  with live as (
    select count(*) as total_users,
           count(*) filter (where role = 'admin') as total_admins,
           count(*) filter (where banned) as total_banned,
           count(*) filter (where created_at > now() - interval '1 day') as new_today,
           count(*) filter (where created_at > now() - interval '7 days') as new_7d,
           count(*) filter (where last_seen_at > now() - interval '3 minutes') as online_now,
           count(*) filter (
             where platform = 'android' and last_seen_at > now() - interval '3 minutes'
           ) as online_android,
           count(*) filter (
             where premium_tier is not null and (premium_until is null or premium_until > now())
           ) as premium_active
    from public.profiles
  )
  select live.total_users,
         live.total_admins,
         live.total_banned,
         coalesce((v->>'activeToday')::bigint, 0),
         coalesce((v->>'active7d')::bigint, 0),
         coalesce((v->>'active30d')::bigint, 0),
         live.new_today,
         live.new_7d,
         live.online_now,
         live.online_android,
         live.premium_active,
         coalesce((v->>'totalWatchSeconds')::double precision, 0),
         coalesce((v->>'trustedWatchSeconds')::double precision, 0),
         coalesce((v->>'totalEpisodes')::bigint, 0)
  from live;
end;
$$;

ALTER FUNCTION public.admin_overview() OWNER TO postgres;

CREATE FUNCTION public.admin_platform_breakdown() RETURNS TABLE(platform text, users bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return query
  select x.item->>'platform', coalesce((x.item->>'users')::bigint, 0)
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'platforms') with ordinality as x(item, ord)
  where s.key = 'admin_dashboard'
  order by x.ord;
end;
$$;

ALTER FUNCTION public.admin_platform_breakdown() OWNER TO postgres;

CREATE FUNCTION public.admin_publish_announcement(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update public.announcements
  set is_draft = false, published_at = now()
  where id = p_id and is_draft;
end; $$;

ALTER FUNCTION public.admin_publish_announcement(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.admin_set_anime_identity(p_slug text, p_season_id text, p_anilist_ids bigint[], p_tmdb_id bigint DEFAULT NULL::bigint, p_tmdb_season integer DEFAULT NULL::integer, p_episode_offset integer DEFAULT 0, p_note text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_season text := nullif(trim(coalesce(p_season_id, '')), '');
  v_ids bigint[];
  v_ancienne jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if v_slug is null or v_season is null then raise exception 'cible_invalide'; end if;

  -- Un tableau vide ferait ignorer la ligne au chargement du registre : un verrou vide serait
  -- silencieusement sans effet.
  select array_agg(distinct x order by x) into v_ids
  from unnest(coalesce(p_anilist_ids, '{}'::bigint[])) as x
  where x is not null and x > 0;
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'anilist_ids_vide';
  end if;

  if p_episode_offset is not null and p_episode_offset < 0 then
    raise exception 'decalage_negatif';
  end if;
  -- `tmdb_season = 0` est la catégorie « spéciaux » de TMDB, où sont rangées les parodies et
  -- les récapitulatifs : la cibler donnerait presque toujours le mauvais épisode.
  if p_tmdb_season is not null and p_tmdb_season < 1 then
    raise exception 'saison_tmdb_invalide';
  end if;

  -- Trace du résultat du résolveur : seule façon de savoir plus tard si un verrou peut être levé.
  select i.evidence into v_ancienne
  from public.anime_identity i
  where i.slug = v_slug and i.season_id = v_season;

  insert into public.anime_identity as ai (
    slug, season_id, anilist_ids, tmdb_id, tmdb_season, episode_offset,
    confidence, evidence, source, updated_at
  )
  values (
    v_slug, v_season, v_ids, p_tmdb_id, p_tmdb_season, coalesce(p_episode_offset, 0),
    100,
    jsonb_strip_nulls(jsonb_build_object(
      'verrou', jsonb_build_object(
        'par', v_me,
        'le', now(),
        'note', nullif(trim(coalesce(p_note, '')), '')
      ),
      'avantVerrou', v_ancienne
    )),
    'locked', now()
  )
  on conflict (slug, season_id) do update set
    anilist_ids = excluded.anilist_ids,
    tmdb_id = excluded.tmdb_id,
    tmdb_season = excluded.tmdb_season,
    episode_offset = excluded.episode_offset,
    confidence = 100,
    evidence = excluded.evidence,
    source = 'locked',
    updated_at = now();

  return json_build_object('ok', true, 'slug', v_slug, 'season_id', v_season);
end; $$;

ALTER FUNCTION public.admin_set_anime_identity(p_slug text, p_season_id text, p_anilist_ids bigint[], p_tmdb_id bigint, p_tmdb_season integer, p_episode_offset integer, p_note text) OWNER TO postgres;

CREATE FUNCTION public.admin_set_banned(target_id uuid, value boolean, p_reason text DEFAULT NULL::text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor  uuid    := auth.uid();
  v_admin  boolean := is_admin();
  v_recent int;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if target_id = v_actor then raise exception 'cannot ban yourself'; end if;

  if value then
    -- Garde-fous propres au staff (les admins ne sont pas limités).
    if not v_admin then
      -- Un staff ne peut pas bannir un autre staff ni un admin.
      if exists (select 1 from public.profiles where id = target_id and role in ('staff', 'admin')) then
        raise exception 'forbidden_target';
      end if;
      -- Quota : 2 bans / 24 h. Au 3ᵉ → auto-rétrogradation + refus.
      select count(*) into v_recent
        from public.staff_ban_events
        where actor_id = v_actor and created_at > now() - interval '24 hours';
      if v_recent >= 2 then
        update public.profiles set role = 'user' where id = v_actor;
        return json_build_object('ok', false, 'deranked', true);
      end if;
    end if;

    update public.profiles
       set banned = true,
           ban_reason = nullif(trim(coalesce(p_reason, '')), ''),
           banned_until = p_until,
           banned_at = now(),
           banned_by = v_actor
     where id = target_id;

    insert into public.staff_ban_events (actor_id, target_id) values (v_actor, target_id);
  else
    -- Déban. Le nettoyage du ban MACHINE reste réservé aux admins ; un staff ne lève que le
    -- ban de compte.
    if v_admin then
      delete from public.banned_machines
        where machine_id = (select machine_id from public.profiles where id = target_id);
    end if;
    update public.profiles
       set banned = false, ban_reason = null, banned_until = null, banned_at = null, banned_by = null
     where id = target_id;
  end if;

  return json_build_object('ok', true, 'deranked', false);
end; $$;

ALTER FUNCTION public.admin_set_banned(target_id uuid, value boolean, p_reason text, p_until timestamp with time zone) OWNER TO postgres;

CREATE FUNCTION public.admin_set_blocked_word(p_word text, p_add boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_w text := public.comment_normalize(trim(coalesce(p_word, '')));
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if length(v_w) < 2 or length(v_w) > 40 then raise exception 'mot_invalide'; end if;
  if p_add then
    insert into public.comment_blocked_words (word) values (v_w) on conflict do nothing;
  else
    delete from public.comment_blocked_words where word = v_w;
  end if;
end; $$;

ALTER FUNCTION public.admin_set_blocked_word(p_word text, p_add boolean) OWNER TO postgres;

CREATE FUNCTION public.admin_set_comment_report_status(p_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if p_status not in ('open', 'resolved', 'rejected') then raise exception 'invalid_status'; end if;
  update public.comment_reports set status = p_status where id = p_id;
end; $$;

ALTER FUNCTION public.admin_set_comment_report_status(p_id uuid, p_status text) OWNER TO postgres;

CREATE FUNCTION public.admin_set_premium(target_id uuid, p_tier text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_tier is not null and p_tier not in ('plus', 'ultimate') then raise exception 'invalid_tier'; end if;
  update public.profiles
    set premium_tier  = p_tier,
        premium_until = case when p_tier is null then null else p_until end
    where id = target_id;
end; $$;

ALTER FUNCTION public.admin_set_premium(target_id uuid, p_tier text, p_until timestamp with time zone) OWNER TO postgres;

CREATE FUNCTION public.admin_set_role(target_id uuid, new_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if new_role not in ('user', 'staff', 'admin', 'developer') then raise exception 'invalid role'; end if;
  if target_id = auth.uid() then raise exception 'cannot change own role'; end if;
  update profiles set role = new_role where id = target_id;
end; $$;

ALTER FUNCTION public.admin_set_role(target_id uuid, new_role text) OWNER TO postgres;

CREATE FUNCTION public.admin_set_scan_offset(p_oeuvre text, p_offset integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_oeuvre text := coalesce(p_oeuvre, '');
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if length(trim(v_oeuvre)) = 0 then raise exception 'oeuvre_vide'; end if;
  if p_offset is null or abs(p_offset) > 1000 then raise exception 'offset_invalide'; end if;

  if p_offset = 0 then
    delete from public.scan_offsets where oeuvre = v_oeuvre;
  else
    insert into public.scan_offsets (oeuvre, chapter_offset, updated_at, updated_by)
    values (v_oeuvre, p_offset, now(), auth.uid())
    on conflict (oeuvre) do update
      set chapter_offset = excluded.chapter_offset, updated_at = now(), updated_by = auth.uid();
  end if;
end; $$;

ALTER FUNCTION public.admin_set_scan_offset(p_oeuvre text, p_offset integer) OWNER TO postgres;

CREATE FUNCTION public.admin_signups_daily(days integer DEFAULT 30) RETURNS TABLE(day date, count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  days := least(greatest(coalesce(days, 30), 1), 30);
  return query
  select (x.item->>'day')::date, coalesce((x.item->>'count')::bigint, 0)
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'signups') with ordinality as x(item, ord)
  where s.key = 'admin_dashboard'
    and (x.item->>'day')::date >= current_date - (days - 1)
  order by x.ord;
end;
$$;

ALTER FUNCTION public.admin_signups_daily(days integer) OWNER TO postgres;

CREATE FUNCTION public.admin_top_animes(lim integer DEFAULT 10) RETURNS TABLE(anime_slug text, anime_title text, anime_cover text, total_plays bigint, unique_viewers bigint, watch_seconds double precision, trusted_seconds double precision, completions bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  lim := least(greatest(coalesce(lim, 10), 1), 10);
  return query
  select x.item->>'slug', x.item->>'title', x.item->>'cover',
         coalesce((x.item->>'plays')::bigint, 0),
         coalesce((x.item->>'viewers')::bigint, 0),
         coalesce((x.item->>'watchSeconds')::double precision, 0),
         coalesce((x.item->>'trustedSeconds')::double precision, 0),
         coalesce((x.item->>'completions')::bigint, 0)
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'topAnimes') with ordinality as x(item, ord)
  where s.key = 'admin_dashboard'
  order by x.ord
  limit lim;
end;
$$;

ALTER FUNCTION public.admin_top_animes(lim integer) OWNER TO postgres;

CREATE FUNCTION public.admin_top_watchers(lim integer DEFAULT 10) RETURNS TABLE(user_id uuid, username text, avatar text, discord_id text, premium_tier text, trusted_seconds bigint, episodes bigint, animes bigint, last_watch_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  lim := least(greatest(coalesce(lim, 10), 1), 10);
  return query
  select (x.item->>'id')::uuid, x.item->>'username', x.item->>'avatar',
         x.item->>'discordId', x.item->>'premiumTier',
         coalesce((x.item->>'trustedSeconds')::bigint, 0),
         coalesce((x.item->>'episodes')::bigint, 0),
         coalesce((x.item->>'animes')::bigint, 0),
         (x.item->>'lastWatchAt')::timestamptz
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'topWatchers') with ordinality as x(item, ord)
  where s.key = 'admin_dashboard'
  order by x.ord
  limit lim;
end;
$$;

ALTER FUNCTION public.admin_top_watchers(lim integer) OWNER TO postgres;

CREATE FUNCTION public.admin_watch_by_hour(days integer DEFAULT 30) RETURNS TABLE(dow integer, hour integer, plays bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return query
  select coalesce((x.item->>'dow')::integer, 0),
         coalesce((x.item->>'hour')::integer, 0),
         coalesce((x.item->>'plays')::bigint, 0)
  from public.stats_snapshot s,
       jsonb_array_elements(s.payload->'hours') as x(item)
  where s.key = 'admin_dashboard';
end;
$$;

ALTER FUNCTION public.admin_watch_by_hour(days integer) OWNER TO postgres;

CREATE FUNCTION public.anime_rating_min_votes() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 5 $$;

ALTER FUNCTION public.anime_rating_min_votes() OWNER TO supabase_admin;

CREATE FUNCTION public.api_account_banned(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = p_user and banned and (banned_until is null or banned_until > now())
  );
$$;

ALTER FUNCTION public.api_account_banned(p_user uuid) OWNER TO postgres;

CREATE FUNCTION public.api_key_owner(p_hash text) RETURNS TABLE(key_id uuid, user_id uuid, banned boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select k.id, k.user_id,
         coalesce(p.banned and (p.banned_until is null or p.banned_until > now()), false)
  from public.api_keys k
  left join public.profiles p on p.id = k.user_id
  where k.key_hash = p_hash and k.revoked_at is null;
$$;

ALTER FUNCTION public.api_key_owner(p_hash text) OWNER TO postgres;

CREATE FUNCTION public.api_usage_add(p_rows jsonb, p_keys uuid[] DEFAULT '{}'::uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.api_usage as u (user_id, day, via, requests, streams)
  select (r ->> 'user_id')::uuid, (r ->> 'day')::date, r ->> 'via',
         sum(coalesce((r ->> 'requests')::int, 0)), sum(coalesce((r ->> 'streams')::int, 0))
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  group by 1, 2, 3
  on conflict (user_id, day, via) do update
    set requests = u.requests + excluded.requests,
        streams = u.streams + excluded.streams;

  update public.api_keys set last_used_at = now()
  where id = any (coalesce(p_keys, '{}')) and revoked_at is null;
end;
$$;

ALTER FUNCTION public.api_usage_add(p_rows jsonb, p_keys uuid[]) OWNER TO postgres;

CREATE FUNCTION public.bug_report_cooldown_seconds() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 300 $$;

ALTER FUNCTION public.bug_report_cooldown_seconds() OWNER TO postgres;

CREATE FUNCTION public.bug_report_message_cooldown_seconds() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 10 $$;

ALTER FUNCTION public.bug_report_message_cooldown_seconds() OWNER TO supabase_admin;

CREATE FUNCTION public.check_ban(p_machine_id text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_mid text := nullif(trim(coalesce(p_machine_id, '')), '');
  bm public.banned_machines;
  pr record;
begin
  -- 1) Ban machine (prioritaire : indépendant du compte).
  if v_mid is not null then
    select * into bm from public.banned_machines where machine_id = v_mid;
    if found and (bm.banned_until is null or bm.banned_until > now()) then
      return json_build_object('banned', true, 'kind', 'machine',
        'reason', bm.reason, 'until', bm.banned_until);
    end if;
  end if;
  -- 2) Ban de compte (si connecté).
  if v_me is not null then
    select banned, ban_reason, banned_until into pr from public.profiles where id = v_me;
    if pr.banned and (pr.banned_until is null or pr.banned_until > now()) then
      return json_build_object('banned', true, 'kind', 'account',
        'reason', pr.ban_reason, 'until', pr.banned_until);
    end if;
  end if;
  return json_build_object('banned', false);
end; $$;

ALTER FUNCTION public.check_ban(p_machine_id text) OWNER TO postgres;

CREATE FUNCTION public.claim_campaign(p_campaign text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid     uuid := auth.uid();
  v_c       public.campaigns%rowtype;
  v_created timestamptz;
  v_anon    boolean;
  v_tier    text;
  v_until   timestamptz;
  v_base    timestamptz;
  v_new     timestamptz;
  v_newtier text;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;

  select * into v_c from public.campaigns where id = p_campaign and active for share;
  if not found then raise exception 'unknown_campaign'; end if;
  if now() < v_c.opens_at or now() > v_c.closes_at then raise exception 'campaign_closed'; end if;

  select is_anonymous into v_anon from auth.users where id = v_uid;
  if coalesce(v_anon, false) then raise exception 'guest_not_eligible'; end if;

  select created_at into v_created from public.profiles where id = v_uid;
  if v_c.eligible_before is not null and (v_created is null or v_created >= v_c.eligible_before) then
    raise exception 'account_too_recent';
  end if;

  -- Verrou sur la ligne profil : deux clics concurrents sérialisent ici, et le second
  -- butera de toute façon sur la clé primaire de campaign_claims.
  select premium_tier, premium_until into v_tier, v_until
    from public.profiles where id = v_uid for update;

  -- Premium « à vie » (échéance null) : rien à prolonger, mais on trace la réclamation pour
  -- que l'annonce disparaisse et ne soit pas rejouée à chaque lancement.
  if v_tier is not null and v_until is null then
    insert into public.campaign_claims (campaign_id, user_id, granted_tier, granted_until)
      values (p_campaign, v_uid, v_tier, 'infinity'::timestamptz)
      on conflict do nothing;
    if not found then raise exception 'already_claimed'; end if;
    return jsonb_build_object('ok', true, 'tier', v_tier, 'until', null, 'lifetime', true);
  end if;

  if v_tier is not null and v_until > now() then
    -- Abonnement actif : on cumule depuis son échéance et on garde son palier.
    v_base    := v_until;
    v_newtier := v_tier;
  else
    v_base    := now();                                      -- expiré ou inexistant
    v_newtier := v_c.tier;
  end if;
  v_new := v_base + make_interval(days => v_c.duration_days);

  insert into public.campaign_claims (campaign_id, user_id, granted_tier, granted_until)
    values (p_campaign, v_uid, v_newtier, v_new)
    on conflict do nothing;
  if not found then raise exception 'already_claimed'; end if;

  update public.profiles
    set premium_tier = v_newtier, premium_until = v_new
    where id = v_uid;

  return jsonb_build_object('ok', true, 'tier', v_newtier, 'until', v_new, 'lifetime', false);
end; $$;

ALTER FUNCTION public.claim_campaign(p_campaign text) OWNER TO postgres;

CREATE FUNCTION public.claim_device_slot(p_machine_id text, p_platform text DEFAULT NULL::text, p_version text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me   uuid := auth.uid();
  v_mid  text := nullif(trim(coalesce(p_machine_id, '')), '');
  v_win  interval := interval '2 minutes';
  v_tier text;
  v_has boolean;
begin
  -- Non connecté ou pas de machine_id (web/dev) → rien à suivre.
  if v_me is null or v_mid is null then
    return json_build_object('allowed', true, 'applicable', false);
  end if;

  -- Offre effective (palier non expiré), renvoyée telle quelle aux clients.
  select case when premium_tier is not null and (premium_until is null or premium_until > now())
              then premium_tier else null end
    into v_tier
    from public.profiles where id = v_me;

  -- Un DELETE qui ne correspond à rien n'écrit pas de WAL.
  delete from public.active_sessions
    where user_id = v_me and last_seen < now() - v_win;

  -- Cet appareil détient-il déjà un créneau ?
  select exists(
    select 1 from public.active_sessions where user_id = v_me and machine_id = v_mid
  ) into v_has;

  if v_has then
    update public.active_sessions
       set last_seen   = now(),
           platform    = coalesce(left(p_platform, 20), platform),
           app_version = coalesce(left(p_version, 20), app_version)
     -- Seuil temporel : les métadonnées n'ont aucune urgence.
     where user_id = v_me and machine_id = v_mid
       and last_seen < now() - interval '45 seconds';
  else
    insert into public.active_sessions (user_id, machine_id, platform, app_version)
    values (v_me, v_mid, left(p_platform, 20), left(p_version, 20));
  end if;

  return json_build_object(
    'allowed', true,
    'applicable', true,
    'limit', 99,
    'tier', v_tier,
    'active', (select count(*) from public.active_sessions where user_id = v_me)
  );
end;
$$;

ALTER FUNCTION public.claim_device_slot(p_machine_id text, p_platform text, p_version text) OWNER TO postgres;

CREATE FUNCTION public.clamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := least(new.updated_at, now());
  return new;
end;
$$;

ALTER FUNCTION public.clamp_updated_at() OWNER TO postgres;

CREATE FUNCTION public.client_heartbeat(p_machine_id text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_version text DEFAULT NULL::text, p_app text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ban    json;
  v_device json;
begin
  if nullif(trim(coalesce(p_app, '')), '') is null then
    perform public.touch_presence(p_version, p_platform, p_machine_id);
  else
    perform public.touch_app_presence(p_app, p_version, p_platform, p_machine_id);
  end if;

  v_ban := public.check_ban(p_machine_id);

  if coalesce((v_ban->>'banned')::boolean, false) then
    return json_build_object(
      'ban', v_ban,
      'device', json_build_object('allowed', false, 'applicable', false)
    );
  end if;

  v_device := public.claim_device_slot(p_machine_id, p_platform, p_version);
  return json_build_object('ban', v_ban, 'device', v_device);
end; $$;

ALTER FUNCTION public.client_heartbeat(p_machine_id text, p_platform text, p_version text, p_app text) OWNER TO postgres;

CREATE FUNCTION public.client_log_retention_days() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 30 $$;

ALTER FUNCTION public.client_log_retention_days() OWNER TO supabase_admin;

CREATE FUNCTION public.client_log_ring_size() RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$ select 100 $$;

ALTER FUNCTION public.client_log_ring_size() OWNER TO supabase_admin;

CREATE FUNCTION public.comment_cooldown_seconds() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 20 $$;

ALTER FUNCTION public.comment_cooldown_seconds() OWNER TO postgres;

CREATE FUNCTION public.comment_daily_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 40 $$;

ALTER FUNCTION public.comment_daily_cap() OWNER TO postgres;

CREATE FUNCTION public.comment_has_blocked_word(p_text text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  select exists (
    select 1 from public.comment_blocked_words w
     where public.comment_normalize(p_text) ~
           ('\m' || regexp_replace(public.comment_normalize(w.word),
                                   '([\\^$.|?*+()\[\]{}])', '\\\1', 'g') || '\M')
  );
$_$;

ALTER FUNCTION public.comment_has_blocked_word(p_text text) OWNER TO postgres;

CREATE FUNCTION public.comment_hourly_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 10 $$;

ALTER FUNCTION public.comment_hourly_cap() OWNER TO postgres;

CREATE FUNCTION public.comment_like_hourly_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 100 $$;

ALTER FUNCTION public.comment_like_hourly_cap() OWNER TO postgres;

CREATE FUNCTION public.comment_min_account_minutes() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 30 $$;

ALTER FUNCTION public.comment_min_account_minutes() OWNER TO postgres;

CREATE FUNCTION public.comment_normalize(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select lower(translate(coalesce(p_text, ''),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'));
$$;

ALTER FUNCTION public.comment_normalize(p_text text) OWNER TO postgres;

CREATE FUNCTION public.comment_report_daily_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 20 $$;

ALTER FUNCTION public.comment_report_daily_cap() OWNER TO postgres;

CREATE FUNCTION public.comment_threads_per_target_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 5 $$;

ALTER FUNCTION public.comment_threads_per_target_cap() OWNER TO postgres;

CREATE FUNCTION public.cosmetic_min_tier(p_slot text, p_item text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_slot in ('ornament', 'banner') and p_item in ('kurotsuki', 'transmutation', 'raijin', 'grand_line') then 'ultimate'
    when p_slot = 'particles' and p_item in ('storm', 'rain', 'snow', 'autumn', 'phantom', 'sakura_fall', 'alchemy', 'ocean') then 'ultimate'
    when p_item in ('sakura', 'hotaru', 'momiji', 'tsuki') then 'ultimate'
    when p_slot = 'ornament' and p_item = 'chronos' then 'ultimate'
    when p_item in ('yuki', 'forest', 'ember', 'kai') then 'plus'
    else null
  end;
$$;

ALTER FUNCTION public.cosmetic_min_tier(p_slot text, p_item text) OWNER TO postgres;

CREATE FUNCTION public.cosmetic_ok(p_slot text, p_item text, p_tier text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_item is null then true
    when p_item = 'none' then p_tier is not null
    when public.cosmetic_min_tier(p_slot, p_item) is null then false
    when public.cosmetic_min_tier(p_slot, p_item) = 'ultimate' then p_tier = 'ultimate'
    else p_tier is not null
  end;
$$;

ALTER FUNCTION public.cosmetic_ok(p_slot text, p_item text, p_tier text) OWNER TO postgres;

CREATE FUNCTION public.count_comments(p_kind text, p_key text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int from public.comments
   where target_kind = p_kind
     and target_key = trim(coalesce(p_key, ''))
     and deleted_at is null;
$$;

ALTER FUNCTION public.count_comments(p_kind text, p_key text) OWNER TO postgres;

CREATE FUNCTION public.count_pending_friend_requests() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int from public.friendships
   where addressee_id = auth.uid() and status = 'pending';
$$;

ALTER FUNCTION public.count_pending_friend_requests() OWNER TO postgres;

CREATE FUNCTION public.create_api_key(p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  max_keys constant integer := 5;
  v_me      uuid := auth.uid();
  v_name    text := left(trim(coalesce(p_name, '')), 40);
  v_discord text;
  v_key     text;
  v_row     public.api_keys;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (auth.jwt() ->> 'is_anonymous')::boolean is true then raise exception 'guest_not_allowed'; end if;
  if public.is_banned() then raise exception 'account_banned'; end if;

  select i.provider_id into v_discord
  from auth.identities i
  where i.user_id = v_me and i.provider = 'discord'
  limit 1;
  if v_discord is null then raise exception 'discord_requis'; end if;
  if exists (
    select 1 from public.profiles
    where discord_id = v_discord and id <> v_me
      and banned and (banned_until is null or banned_until > now())
  ) then
    raise exception 'account_banned';
  end if;

  if v_name = '' then raise exception 'nom_requis'; end if;
  if (select count(*) from public.api_keys where user_id = v_me and revoked_at is null) >= max_keys then
    raise exception 'trop_de_cles';
  end if;

  v_key := 'nk_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (user_id, name, prefix, key_hash)
  values (v_me, v_name, left(v_key, 10), encode(extensions.digest(v_key, 'sha256'), 'hex'))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'prefix', v_row.prefix,
    'created_at', v_row.created_at,
    'key', v_key
  );
end;
$$;

ALTER FUNCTION public.create_api_key(p_name text) OWNER TO postgres;

CREATE FUNCTION public.delete_anime_rating(p_slug text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  delete from public.anime_ratings
   where user_id = v_me and anime_slug = trim(coalesce(p_slug, ''));
  return found;
end;
$$;

ALTER FUNCTION public.delete_anime_rating(p_slug text) OWNER TO supabase_admin;

CREATE FUNCTION public.delete_comment(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me  uuid := auth.uid();
  v_row public.comments;
begin
  if v_me is null then raise exception 'forbidden'; end if;

  select * into v_row from public.comments where id = p_id;
  if not found then return; end if;
  if v_row.user_id <> v_me and not is_staff() then raise exception 'forbidden'; end if;

  -- Suppression réelle. Racine → ses réponses partent en cascade (FK on delete cascade).
  delete from public.comments where id = p_id;

  -- Réponse → on décrémente le compteur dénormalisé de sa racine.
  if v_row.parent_id is not null then
    update public.comments
       set replies_count = greatest(0, replies_count - 1)
     where id = v_row.parent_id;
  end if;
end; $$;

ALTER FUNCTION public.delete_comment(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.discord_account_age_days(p_discord_id text) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select case when p_discord_id ~ '^[0-9]+$'
    then extract(epoch from (now() - to_timestamp(
           (((p_discord_id::bigint) >> 22) + 1420070400000) / 1000.0))) / 86400.0
    else null end;
$_$;

ALTER FUNCTION public.discord_account_age_days(p_discord_id text) OWNER TO postgres;

CREATE FUNCTION public.dismiss_announcement(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  insert into public.announcement_dismissals (announcement_id, user_id)
  values (p_id, v_me)
  on conflict (announcement_id, user_id) do nothing;
end; $$;

ALTER FUNCTION public.dismiss_announcement(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.edit_comment(p_id uuid, p_body text, p_spoiler boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me   uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_row  public.comments;
begin
  perform public._comment_assert_can_write(v_me);

  select * into v_row from public.comments where id = p_id;
  if not found or v_row.deleted_at is not null then raise exception 'introuvable'; end if;
  if v_row.user_id <> v_me then raise exception 'forbidden'; end if;

  v_body := regexp_replace(v_body, '[ \t]+', ' ', 'g');
  v_body := regexp_replace(v_body, E'\n{3,}', E'\n\n', 'g');
  if length(v_body) < 2    then raise exception 'message_vide'; end if;
  if length(v_body) > 1500 then raise exception 'message_trop_long'; end if;
  if public.comment_has_blocked_word(v_body) then raise exception 'mot_interdit'; end if;

  update public.comments
     set body = v_body,
         is_spoiler = coalesce(p_spoiler, is_spoiler),
         edited_at = now()
   where id = p_id;
end; $$;

ALTER FUNCTION public.edit_comment(p_id uuid, p_body text, p_spoiler boolean) OWNER TO postgres;

CREATE FUNCTION public.enforce_pin_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tier  text;
  v_role  text;
  v_limit int;
  v_count int;
begin
  -- Seulement à la transition « on épingle » (null → non null). Dépinglage / refresh : rien.
  if new.pinned_at is null or old.pinned_at is not null then
    return new;
  end if;

  select role,
         case when premium_tier is not null and (premium_until is null or premium_until > now())
              then premium_tier else null end
    into v_role, v_tier
    from public.profiles where id = new.user_id;

  if v_role in ('admin', 'staff') then return new; end if; -- exemptés

  v_limit := case
    when v_tier = 'ultimate' then 2147483647  -- illimité
    when v_tier = 'plus'     then 30
    else 12
  end;

  select count(*) into v_count
    from public.favorites
    where user_id = new.user_id and pinned_at is not null and anime_slug <> new.anime_slug;

  if v_count >= v_limit then
    raise exception 'pin_limit' using detail = v_limit::text;
  end if;

  return new;
end; $$;

ALTER FUNCTION public.enforce_pin_limit() OWNER TO postgres;

CREATE FUNCTION public.equip_credit_item(p_category text, p_item_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_owned text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_category not in ('avatar_frame', 'comment_flair', 'name_color') then
    raise exception 'invalid_category';
  end if;

  if p_item_id is not null then
    if not exists (
      select 1 from public.credit_shop_items
      where id = p_item_id and active and category = p_category
    ) then
      raise exception 'item_not_found';
    end if;

    select case p_category
      when 'avatar_frame' then owned_avatar_frames
      when 'comment_flair' then owned_comment_flairs
      else owned_name_colors
    end into v_owned
    from public.profiles where id = v_uid;

    if not (p_item_id = any(v_owned)) then
      raise exception 'not_owned';
    end if;
  end if;

  if p_category = 'avatar_frame' then
    update public.profiles set equipped_avatar_frame = p_item_id where id = v_uid;
  elsif p_category = 'comment_flair' then
    update public.profiles set equipped_comment_flair = p_item_id where id = v_uid;
  else
    update public.profiles set equipped_name_color = p_item_id where id = v_uid;
  end if;
end;
$$;

ALTER FUNCTION public.equip_credit_item(p_category text, p_item_id text) OWNER TO postgres;

CREATE FUNCTION public.friend_status(p_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_row public.friendships;
begin
  if v_me is null or p_id is null then return 'none'; end if;
  if v_me = p_id then return 'self'; end if;
  select * into v_row from public.friendships
   where least(requester_id, addressee_id) = least(v_me, p_id)
     and greatest(requester_id, addressee_id) = greatest(v_me, p_id);
  if not found then return 'none'; end if;
  if v_row.status = 'accepted' then return 'friends'; end if;
  if v_row.requester_id = v_me then return 'pending_out'; else return 'pending_in'; end if;
end; $$;

ALTER FUNCTION public.friend_status(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.gen_support_code(p_username text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_prefix text;
  v_code   text;
  v_tries  int := 0;
  v_digits int := 6;
begin
  v_prefix := lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_prefix := left(v_prefix, 3);
  if length(v_prefix) < 3 then
    v_prefix := rpad(v_prefix, 3, 'x');
  end if;

  loop
    v_code := v_prefix || lpad(floor(random() * power(10, v_digits))::bigint::text, v_digits, '0');
    exit when not exists (select 1 from public.profiles where support_code = v_code);
    v_tries := v_tries + 1;
    if v_tries = 50 then v_digits := 8; end if;
    if v_tries > 200 then
      raise exception 'support_code_exhausted';
    end if;
  end loop;

  return v_code;
end; $$;

ALTER FUNCTION public.gen_support_code(p_username text) OWNER TO supabase_admin;

CREATE FUNCTION public.gen_unique_handle(p_seed text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  base text := nullif(regexp_replace(lower(coalesce(p_seed, '')), '[^a-z0-9_]', '', 'g'), '');
  cand text;
  n int := 0;
begin
  if base is null or length(base) < 3 then base := 'nartya'; end if;
  base := left(base, 18);
  cand := base;
  while exists (select 1 from public.profiles where lower(handle) = lower(cand)) loop
    n := n + 1;
    cand := left(base, 15) || '_' || n::text;
  end loop;
  return cand;
end; $$;

ALTER FUNCTION public.gen_unique_handle(p_seed text) OWNER TO postgres;

CREATE FUNCTION public.get_achievements() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'trustedSeconds',   coalesce((select sum(trusted_seconds) from public.watch_time where user_id = auth.uid()), 0),
    'nightEpisodes',    coalesce(s.night_episodes, 0),
    'bestDayEpisodes',  coalesce(s.best_day_episodes, 0),
    'completedSeasons', coalesce(s.completed_seasons, 0),
    'unlocked',         coalesce((select jsonb_object_agg(achievement_id, unlocked_at)
                                  from public.user_achievements where user_id = auth.uid()), '{}'::jsonb)
  )
  -- LEFT JOIN sur une ligne fantôme : un membre qui n'a encore rien regardé n'a pas de ligne
  -- d'agrégat (une lecture ne doit rien écrire) et doit quand même recevoir des zéros.
  from (select 1) _
  left join public.user_achievement_stats s on s.user_id = auth.uid();
$$;

ALTER FUNCTION public.get_achievements() OWNER TO postgres;

CREATE FUNCTION public.get_anime_rating_summary(p_slug text) RETURNS TABLE(average_rating numeric, ratings_count bigint, my_rating smallint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with scoped as (
    select user_id, rating
      from public.anime_ratings
     where anime_slug = trim(coalesce(p_slug, ''))
  )
  select
    case when count(*) >= public.anime_rating_min_votes()
         then round(avg(rating)::numeric, 1)
         else null end,
    count(*),
    max(rating) filter (where user_id = auth.uid())::smallint
  from scoped;
$$;

ALTER FUNCTION public.get_anime_rating_summary(p_slug text) OWNER TO supabase_admin;

CREATE FUNCTION public.get_campaign_status(p_campaign text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid      uuid := auth.uid();
  v_c        public.campaigns%rowtype;
  v_claimed  timestamptz;
  v_created  timestamptz;
  v_anon     boolean;
begin
  if v_uid is null then return jsonb_build_object('available', false, 'reason', 'unauthenticated'); end if;

  select * into v_c from public.campaigns where id = p_campaign and active;
  if not found then return jsonb_build_object('available', false, 'reason', 'unknown'); end if;

  select claimed_at into v_claimed
    from public.campaign_claims where campaign_id = p_campaign and user_id = v_uid;
  select created_at into v_created from public.profiles where id = v_uid;
  select is_anonymous into v_anon from auth.users where id = v_uid;

  return jsonb_build_object(
    'campaign',      v_c.id,
    'title',         v_c.title,
    'message',       v_c.message,
    'tier',          v_c.tier,
    'durationDays',  v_c.duration_days,
    'closesAt',      v_c.closes_at,
    'claimed',       v_claimed is not null,
    'claimedAt',     v_claimed,
    -- `available` : bouton Réclamer actif. Raisons distinctes pour expliquer un refus ; coalesce
    -- pour qu'un profil sans `created_at` donne false plutôt que NULL.
    'available',     coalesce(
                       v_claimed is null
                       and not coalesce(v_anon, false)
                       and now() between v_c.opens_at and v_c.closes_at
                       and (v_c.eligible_before is null or v_created < v_c.eligible_before),
                       false
                     ),
    'reason',        case
                       when v_claimed is not null then 'already_claimed'
                       when coalesce(v_anon, false) then 'guest'
                       when now() > v_c.closes_at then 'closed'
                       when now() < v_c.opens_at then 'not_open'
                       when v_c.eligible_before is not null and v_created >= v_c.eligible_before
                         then 'account_too_recent'
                       else 'ok'
                     end
  );
end; $$;

ALTER FUNCTION public.get_campaign_status(p_campaign text) OWNER TO postgres;

CREATE FUNCTION public.get_leaderboard(p_metric text DEFAULT 'watch_time'::text, lim integer DEFAULT 50, p_period text DEFAULT 'all'::text) RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, profile_emblem text, role text, total_watch_seconds double precision, total_episodes bigint, total_animes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_metric is null or p_metric not in ('watch_time', 'episodes', 'animes') then
    p_metric := 'watch_time';
  end if;
  if p_period is null or p_period not in ('all', 'week') then
    p_period := 'all';
  end if;
  lim := least(greatest(coalesce(lim, 50), 1), 100);

  return query
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom, p.accent_color,
    case when p.premium_tier is not null and (p.premium_until is null or p.premium_until > now())
         then p.premium_tier else null end,
    p.profile_emblem, p.role,
    t.secs, t.eps, t.animes
  from public.leaderboard_totals t
  join public.profiles p on p.id = t.user_id
  where t.period = p_period
    and p.is_public = true
    and coalesce(p.banned, false) = false
    and p.handle is not null
    and (case p_metric
           when 'episodes' then t.eps
           when 'animes'   then t.animes
           else t.secs::bigint
         end) > 0
  order by (case p_metric
              when 'episodes' then t.eps
              when 'animes'   then t.animes
              else t.secs::bigint
            end) desc,
           p.created_at asc
  limit lim;
end;
$$;

ALTER FUNCTION public.get_leaderboard(p_metric text, lim integer, p_period text) OWNER TO postgres;

CREATE FUNCTION public.get_my_announcements(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, title text, body text, type text, buttons jsonb, created_at timestamp with time zone, is_global boolean, author_name text, author_avatar text, is_read boolean, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  return query
  with mine as (
    select a.* from public.announcements a
    where (a.target_user_id is null or a.target_user_id = v_me)
      and not a.is_draft
      and not exists (
        select 1 from public.announcement_dismissals d
        where d.announcement_id = a.id and d.user_id = v_me
      )
  )
  select
    m.id, m.title, m.body, m.type, m.buttons, m.published_at as created_at,
    (m.target_user_id is null) as is_global,
    au.username, au.avatar,
    exists (select 1 from public.announcement_reads r where r.announcement_id = m.id and r.user_id = v_me) as is_read,
    (select count(*) from mine) as total_count
  from mine m
  left join public.profiles au on au.id = m.author_id
  order by m.published_at desc
  limit greatest(1, least(p_limit, 50)) offset greatest(0, p_offset);
end; $$;

ALTER FUNCTION public.get_my_announcements(p_limit integer, p_offset integer) OWNER TO postgres;

CREATE FUNCTION public.get_profile_extra_stats() RETURNS TABLE(rank bigint, total_members bigint, best_rank integer, rank_badge smallint, streak_days integer, night_episodes integer, season_spring bigint, season_summer bigint, season_autumn bigint, season_winter bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me      uuid := auth.uid();
  v_rank    bigint;
  v_total   bigint;
  v_streak  integer := 0;
  v_cursor  date;
begin
  if v_me is null then raise exception 'forbidden'; end if;

  with totals as (
    select p.id, coalesce((select sum(trusted_seconds) from public.watch_time where user_id = p.id), 0) as secs
    from public.profiles p
    where p.is_public or p.id = v_me
  ),
  ranked as (
    select id, rank() over (order by secs desc) as rnk from totals
  )
  select r.rnk, (select count(*) from totals) into v_rank, v_total
  from ranked r where r.id = v_me;

  select max(d) into v_cursor from (
    select distinct ((truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0)))::date as d
    from public.watch_time
    where user_id = v_me and truly_watched_at is not null
  ) days;

  if v_cursor is not null and v_cursor >= current_date - 1 then
    v_cursor := least(v_cursor, current_date);
    while exists (
      select 1 from public.watch_time
      where user_id = v_me and truly_watched_at is not null
        and ((truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0)))::date = v_cursor
    ) loop
      v_streak := v_streak + 1;
      v_cursor := v_cursor - 1;
    end loop;
  end if;

  return query
  select
    v_rank, v_total,
    (select best_rank from public.leaderboard_rank_records where user_id = v_me),
    (select case when current_rank <= 10 then current_rank::smallint else null end
       from public.leaderboard_rank_records where user_id = v_me),
    v_streak,
    coalesce((select night_episodes from public.user_achievement_stats where user_id = v_me), 0),
    (select count(*) from public.watch_time where user_id = v_me and truly_watched
       and extract(month from (truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0))) in (3, 4, 5)),
    (select count(*) from public.watch_time where user_id = v_me and truly_watched
       and extract(month from (truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0))) in (6, 7, 8)),
    (select count(*) from public.watch_time where user_id = v_me and truly_watched
       and extract(month from (truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0))) in (9, 10, 11)),
    (select count(*) from public.watch_time where user_id = v_me and truly_watched
       and extract(month from (truly_watched_at at time zone 'utc') + make_interval(mins => coalesce(tz_offset_minutes, 0))) in (12, 1, 2));
end; $$;

ALTER FUNCTION public.get_profile_extra_stats() OWNER TO postgres;

CREATE FUNCTION public.get_public_activity(p_id uuid, lim integer DEFAULT 20) RETURNS TABLE(kind text, anime_slug text, anime_title text, anime_cover text, season_id text, episode_number integer, chapter integer, label text, ts timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_id and (p.activity_public or p.id = v_me or is_admin())
  ) then return; end if;

  return query
  with watches as (
    select distinct on (ep.anime_slug, ep.season_id, ep.episode_number)
           'watch'::text as kind, ep.anime_slug, ep.anime_title, ep.anime_cover,
           ep.season_id, ep.episode_number, null::int as chapter, null::text as label,
           ep.updated_at as ts
    from public.episode_progress ep
    where ep.user_id = p_id
      and (
        coalesce(ep.position_seconds, 0) > 0
        or exists (
          select 1 from public.watch_time wt
          where wt.user_id = ep.user_id and wt.episode_key = ep.episode_key
        )
      )
    order by ep.anime_slug, ep.season_id, ep.episode_number, ep.updated_at desc
  ),
  scans as (
    select distinct on (sp.anime_slug, sp.chapter)
           'scan'::text, sp.anime_slug, sp.anime_title, sp.anime_cover,
           null::text, null::int, sp.chapter, coalesce(sp.oeuvre_label, sp.oeuvre),
           sp.updated_at
    from public.scan_progress sp
    where sp.user_id = p_id
      and (coalesce(sp.total_pages, 0) > 0 or coalesce(sp.page, 0) > 0 or sp.completed)
    order by sp.anime_slug, sp.chapter, sp.updated_at desc
  ),
  own_comments as (
    select
      'comment'::text, c.target_key, coalesce(f.anime_title, ep2.anime_title), coalesce(f.anime_cover, ep2.anime_cover),
      null::text, null::int, null::int,
      left(c.body, 140),
      c.created_at
    from public.comments c
    left join lateral (
      select fa.anime_title, fa.anime_cover from public.favorites fa
      where fa.user_id = p_id and fa.anime_slug = c.target_key limit 1
    ) f on true
    left join lateral (
      select epp.anime_title, epp.anime_cover from public.episode_progress epp
      where epp.user_id = p_id and epp.anime_slug = c.target_key limit 1
    ) ep2 on true
    where c.user_id = p_id and c.target_kind = 'anime'
      and c.parent_id is null and c.deleted_at is null
  ),
  own_ratings as (
    select
      'rating'::text, ar.anime_slug, coalesce(f2.anime_title, ep3.anime_title), coalesce(f2.anime_cover, ep3.anime_cover),
      null::text, null::int, null::int,
      ar.rating::text,
      ar.updated_at
    from public.anime_ratings ar
    left join lateral (
      select fa2.anime_title, fa2.anime_cover from public.favorites fa2
      where fa2.user_id = p_id and fa2.anime_slug = ar.anime_slug limit 1
    ) f2 on true
    left join lateral (
      select epp2.anime_title, epp2.anime_cover from public.episode_progress epp2
      where epp2.user_id = p_id and epp2.anime_slug = ar.anime_slug limit 1
    ) ep3 on true
    where ar.user_id = p_id
  )
  select * from (
    select * from watches
    union all
    select * from scans
    union all
    select * from own_comments
    union all
    select * from own_ratings
    union all
    select 'favorite'::text, fa.anime_slug, fa.anime_title, fa.anime_cover,
           null::text, null::int, null::int, null::text, fa.added_at
    from public.favorites fa
    where fa.user_id = p_id
  ) evt
  order by evt.ts desc
  limit greatest(1, least(lim, 50));
end; $$;

ALTER FUNCTION public.get_public_activity(p_id uuid, lim integer) OWNER TO postgres;

CREATE FUNCTION public.get_public_favorites(p_id uuid) RETURNS TABLE(anime_slug text, anime_title text, anime_cover text, pinned_at timestamp with time zone, episodes_watched bigint, watch_seconds double precision)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_id and (p.favorites_public or p.id = v_me or is_admin())
  ) then return; end if;
  return query
  select
    f.anime_slug, f.anime_title, f.anime_cover, f.pinned_at,
    coalesce(ep.eps, 0), coalesce(wt.secs, 0)::double precision
  from public.favorites f
  left join lateral (
    select count(*) filter (where completed) as eps
    from public.episode_progress ep2 where ep2.user_id = p_id and ep2.anime_slug = f.anime_slug
  ) ep on true
  left join lateral (
    select sum(trusted_seconds) as secs
    from public.watch_time wt2
    where wt2.user_id = p_id and split_part(wt2.episode_key, ':', 1) = f.anime_slug
  ) wt on true
  where f.user_id = p_id and f.pinned_at is not null
  order by f.pinned_at desc
  limit 12;
end; $$;

ALTER FUNCTION public.get_public_favorites(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.get_public_friends(p_id uuid, lim integer DEFAULT 24) RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, ambient_theme text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_visible boolean;
begin
  select (p.friends_public or p.id = v_me or is_admin())
    into v_visible
    from public.profiles p where p.id = p_id;
  if not coalesce(v_visible, false) then return; end if;

  return query
  select
    fr.id, fr.handle, fr.username, fr.avatar, fr.avatar_custom,
    fr.accent_color, fr.premium_tier, fr.premium_until, fr.role, fr.ambient_theme
  from public.friendships f
  join public.profiles fr
    on fr.id = case when f.requester_id = p_id then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = p_id or f.addressee_id = p_id)
    and coalesce(fr.banned, false) = false
  order by coalesce(f.responded_at, f.created_at) desc
  limit greatest(1, least(lim, 60));
end; $$;

ALTER FUNCTION public.get_public_friends(p_id uuid, lim integer) OWNER TO postgres;

CREATE FUNCTION public.get_public_profile(p_handle text) RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, banner text, page_background text, bio text, role text, accent_color text, created_at timestamp with time zone, is_self boolean, activity_public boolean, favorites_public boolean, total_watch_seconds double precision, total_episodes bigint, total_animes bigint, premium_tier text, profile_emblem text, ambient_theme text, cosmetic_ornament text, cosmetic_banner text, cosmetic_particles text, friends_count bigint, last_active timestamp with time zone, views_count integer, achievements jsonb, rank_badge smallint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  return query
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom,
    p.banner, p.page_background, p.bio, p.role, p.accent_color, p.created_at,
    (p.id = v_me) as is_self, p.activity_public, p.favorites_public,
    coalesce(wt.secs, 0), coalesce(st.eps, 0), coalesce(st.animes, 0),
    eff.tier as premium_tier,
    p.profile_emblem,
    case when public.cosmetic_ok('particles', p.ambient_theme, eff.tier)
         then p.ambient_theme else null end as ambient_theme,
    case when public.cosmetic_ok('ornament', p.cosmetic_ornament, eff.tier)
         then p.cosmetic_ornament else null end as cosmetic_ornament,
    case when public.cosmetic_ok('banner', p.cosmetic_banner, eff.tier)
         then p.cosmetic_banner else null end as cosmetic_banner,
    case when public.cosmetic_ok('particles', p.cosmetic_particles, eff.tier)
         then p.cosmetic_particles else null end as cosmetic_particles,
    coalesce(fc.n, 0) as friends_count,
    case when (p.presence_public or p.id = v_me or is_admin()) then p.last_login else null end as last_active,
    p.views_count,
    coalesce(ac.tiers, '{}'::jsonb) as achievements,
    rk.badge as rank_badge
  from public.profiles p
  cross join lateral (
    select case when p.premium_tier is not null
                     and (p.premium_until is null or p.premium_until > now())
                then p.premium_tier else null end as tier
  ) eff
  left join lateral (
    select sum(trusted_seconds)::double precision as secs
    from public.watch_time where user_id = p.id
  ) wt on true
  left join lateral (
    select count(*) filter (where completed) as eps,
           count(distinct anime_slug) as animes
    from public.episode_progress where user_id = p.id
  ) st on true
  left join lateral (
    select count(*) as n from public.friendships f
    where f.status = 'accepted' and (f.requester_id = p.id or f.addressee_id = p.id)
  ) fc on true
  left join lateral (
    select jsonb_build_object('night_owl', s.night_owl_tier, 'marathon', s.marathon_tier,
                              'watch_time', s.watch_time_tier, 'completion', s.completion_tier) as tiers
    from public.user_achievement_stats s where s.user_id = p.id
  ) ac on true
  left join lateral (
    select case when lr.current_rank <= 10 then lr.current_rank::smallint else null end as badge
    from public.leaderboard_rank_records lr where lr.user_id = p.id
  ) rk on true
  where lower(p.handle) = lower(trim(coalesce(p_handle, '')))
    and (p.is_public or p.id = v_me or is_admin());
end; $$;

ALTER FUNCTION public.get_public_profile(p_handle text) OWNER TO postgres;

CREATE FUNCTION public.get_team_roster() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'handle', p.handle,
    'username', p.username,
    'avatar', p.avatar,
    'avatarCustom', p.avatar_custom,
    'bio', p.bio,
    'role', p.role,
    'createdAt', p.created_at
  ) order by
    case p.role when 'developer' then 0 when 'admin' then 1 when 'staff' then 2 else 3 end,
    p.username asc), '[]'::jsonb)
  into v_out
  from public.profiles p
  where p.role in ('staff', 'admin', 'developer');

  return v_out;
end;
$$;

ALTER FUNCTION public.get_team_roster() OWNER TO postgres;

CREATE FUNCTION public.get_unread_announcements_count() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int from public.announcements a
  where (a.target_user_id is null or a.target_user_id = auth.uid())
    and not a.is_draft
    and not exists (
      select 1 from public.announcement_reads r
      where r.announcement_id = a.id and r.user_id = auth.uid()
    )
    and not exists (
      select 1 from public.announcement_dismissals d
      where d.announcement_id = a.id and d.user_id = auth.uid()
    );
$$;

ALTER FUNCTION public.get_unread_announcements_count() OWNER TO postgres;

CREATE FUNCTION public.get_user_stats() RETURNS TABLE(total_watch_seconds double precision, total_episodes bigint, total_animes bigint, achievements jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    coalesce((select sum(trusted_seconds) from public.watch_time where user_id = auth.uid()), 0)::double precision,
    coalesce((select count(*) filter (where completed) from public.episode_progress where user_id = auth.uid()), 0)::bigint,
    coalesce((select count(distinct anime_slug) from public.episode_progress where user_id = auth.uid()), 0)::bigint,
    coalesce((select jsonb_build_object('night_owl', night_owl_tier, 'marathon', marathon_tier,
                                        'watch_time', watch_time_tier, 'completion', completion_tier)
              from public.user_achievement_stats where user_id = auth.uid()), '{}'::jsonb);
$$;

ALTER FUNCTION public.get_user_stats() OWNER TO postgres;

CREATE FUNCTION public.get_watch_calendar(p_id uuid, p_days integer DEFAULT 119) RETURNS TABLE(day date, count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_days int := greatest(7, least(p_days, 371));
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_id and (p.activity_public or p.id = v_me or is_admin())
  ) then return; end if;
  return query
  select d::date as day, coalesce(c.cnt, 0)::int as count
  from generate_series((current_date - (v_days - 1)), current_date, interval '1 day') d
  left join (
    select updated_at::date as day, count(*)::int as cnt
    from public.episode_progress
    where user_id = p_id and updated_at >= current_date - (v_days - 1)
    group by 1
  ) c on c.day = d::date
  order by day;
end; $$;

ALTER FUNCTION public.get_watch_calendar(p_id uuid, p_days integer) OWNER TO postgres;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name'
  );
begin
  insert into public.profiles (id, discord_id, username, avatar, handle)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    public.gen_unique_handle(v_name)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE FUNCTION public.heartbeat_watch(p_episode_key text, p_position double precision DEFAULT NULL::double precision, p_duration double precision DEFAULT NULL::double precision, p_tz_offset integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select (public.watch_credit(p_episode_key, p_duration, p_tz_offset, null)->>'total')::integer;
$$;

ALTER FUNCTION public.heartbeat_watch(p_episode_key text, p_position double precision, p_duration double precision, p_tz_offset integer) OWNER TO postgres;

CREATE FUNCTION public.hub_activity_daily(p_days integer DEFAULT 30) RETURNS TABLE(day date, active_users bigint, plays bigint, episodes_completed bigint, watch_seconds bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_days  integer;
  v_start timestamptz;
begin
  v_days  := least(greatest(coalesce(p_days, 30), 1), 365);
  v_start := date_trunc('day', now()) - make_interval(days => v_days - 1);

  return query
  with days as (
    select generate_series(v_start, date_trunc('day', now()), interval '1 day')::date as d
  ),
  ep as (
    select date(e.updated_at) as d,
           count(distinct e.user_id) as users,
           count(*) as plays,
           count(*) filter (where e.completed) as done
    from episode_progress e
    where e.updated_at >= v_start
    group by 1
  ),
  wt as (
    select date(w.updated_at) as d, sum(w.trusted_seconds)::bigint as secs
    from watch_time w
    where w.updated_at >= v_start
    group by 1
  )
  select d.d,
         coalesce(ep.users, 0),
         coalesce(ep.plays, 0),
         coalesce(ep.done,  0),
         coalesce(wt.secs,  0)
  from days d
  left join ep on ep.d = d.d
  left join wt on wt.d = d.d
  order by d.d;
end;
$$;

ALTER FUNCTION public.hub_activity_daily(p_days integer) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_activity_daily(p_days integer) IS 'Serie quotidienne sur p_days jours, trous combles. Jours en UTC. Approximatif sur le passe (episode_progress est une table d''upsert). service_role uniquement.';

CREATE FUNCTION public.hub_app_overview() RETURNS TABLE(total_users bigint, total_admins bigint, total_banned bigint, active_today bigint, active_7d bigint, active_30d bigint, new_today bigint, new_7d bigint, online_now bigint, premium_active bigint, total_watch_seconds double precision, trusted_watch_seconds double precision, total_episodes bigint, computed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v jsonb;
  v_at timestamptz;
begin
  select payload, s.computed_at into v, v_at from stats_snapshot s where s.key = 'overview';
  v := coalesce(v, '{}'::jsonb);

  return query select
    (select count(*) from profiles),
    (select count(*) from profiles where role = 'admin'),
    (select count(*) from profiles where banned),
    coalesce((v->>'active_today')::bigint, 0),
    coalesce((v->>'active_7d')::bigint, 0),
    coalesce((v->>'active_30d')::bigint, 0),
    (select count(*) from profiles where created_at > now() - interval '1 day'),
    (select count(*) from profiles where created_at > now() - interval '7 days'),
    (select count(*) from profiles where last_seen_at > now() - interval '3 minutes'),
    (select count(*) from profiles
       where premium_tier is not null and (premium_until is null or premium_until > now())),
    coalesce((v->>'watch_seconds')::double precision, 0),
    coalesce((v->>'trusted_secs')::double precision, 0),
    coalesce((v->>'episodes')::bigint, 0),
    v_at;
end;
$$;

ALTER FUNCTION public.hub_app_overview() OWNER TO postgres;

COMMENT ON FUNCTION public.hub_app_overview() IS 'Vue d''ensemble app pour le bot Discord. Lit stats_snapshot (pg_cron, 30 min) — ne scanne pas episode_progress. service_role uniquement.';

CREATE FUNCTION public.hub_leaderboard(p_metric text DEFAULT 'watch_time'::text, p_limit integer DEFAULT 10, p_period text DEFAULT 'all'::text) RETURNS TABLE(rank_position bigint, id uuid, discord_id text, handle text, username text, avatar text, avatar_custom text, premium_tier text, role text, total_watch_seconds double precision, total_episodes bigint, total_animes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_metric is null or p_metric not in ('watch_time', 'episodes', 'animes') then
    p_metric := 'watch_time';
  end if;
  if p_period is null or p_period not in ('all', 'week') then
    p_period := 'all';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 10), 1), 100);

  return query
  select * from (
    select
      row_number() over (
        order by (case p_metric
                    when 'episodes' then t.eps
                    when 'animes'   then t.animes
                    else t.secs::bigint
                  end) desc, p.created_at asc
      ) as rn,
      p.id, p.discord_id, p.handle, p.username, p.avatar, p.avatar_custom,
      case when p.premium_tier is not null and (p.premium_until is null or p.premium_until > now())
           then p.premium_tier else null end,
      p.role, t.secs, t.eps, t.animes
    from leaderboard_totals t
    join profiles p on p.id = t.user_id
    where t.period = p_period
      and p.is_public = true
      and coalesce(p.banned, false) = false
      and p.handle is not null
      and (case p_metric
             when 'episodes' then t.eps
             when 'animes'   then t.animes
             else t.secs::bigint
           end) > 0
  ) ranked
  order by ranked.rn
  limit p_limit;
end;
$$;

ALTER FUNCTION public.hub_leaderboard(p_metric text, p_limit integer, p_period text) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_leaderboard(p_metric text, p_limit integer, p_period text) IS 'Classement avec discord_id, memes filtres que get_leaderboard. p_metric = watch_time|episodes|animes, p_period = all|week. service_role uniquement.';

CREATE FUNCTION public.hub_recommend_for_user(p_user_id uuid, p_limit integer DEFAULT 5) RETURNS TABLE(anime_slug text, anime_title text, anime_cover text, shared_viewers bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  p_limit := least(greatest(coalesce(p_limit, 5), 1), 50);
  if p_user_id is null then return; end if;

  return query
  with seen as (
    select distinct e.anime_slug as slug
    from episode_progress e
    where e.user_id = p_user_id
  ),
  neighbours as (
    select distinct e.user_id as uid
    from episode_progress e
    join seen s on s.slug = e.anime_slug
    where e.user_id <> p_user_id
  )
  select
    ep.anime_slug,
    coalesce(
      (array_agg(ep.anime_title order by ep.updated_at desc)
         filter (where ep.anime_title is not null and ep.anime_title <> 'Sans titre'))[1],
      ep.anime_slug
    ),
    (array_agg(ep.anime_cover order by ep.updated_at desc)
       filter (where ep.anime_cover is not null and ep.anime_cover <> ''))[1],
    count(distinct ep.user_id)
  from episode_progress ep
  join neighbours n on n.uid = ep.user_id
  where not exists (select 1 from seen s where s.slug = ep.anime_slug)
  group by ep.anime_slug
  order by count(distinct ep.user_id) desc, ep.anime_slug asc
  limit p_limit;
end;
$$;

ALTER FUNCTION public.hub_recommend_for_user(p_user_id uuid, p_limit integer) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_recommend_for_user(p_user_id uuid, p_limit integer) IS 'Reco collaborative a partir du profil p_user_id. 0 ligne si aucun historique -> retomber sur hub_top_animes. service_role uniquement.';

CREATE FUNCTION public.hub_related_animes(p_slug text, p_limit integer DEFAULT 5) RETURNS TABLE(anime_slug text, anime_title text, anime_cover text, shared_viewers bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  p_limit := least(greatest(coalesce(p_limit, 5), 1), 50);
  if p_slug is null or p_slug = '' then return; end if;

  return query
  with viewers as (
    select distinct ep.user_id
    from episode_progress ep
    where ep.anime_slug = p_slug
  )
  select
    ep.anime_slug,
    coalesce(
      (array_agg(ep.anime_title order by ep.updated_at desc)
         filter (where ep.anime_title is not null and ep.anime_title <> 'Sans titre'))[1],
      ep.anime_slug
    ),
    (array_agg(ep.anime_cover order by ep.updated_at desc)
       filter (where ep.anime_cover is not null and ep.anime_cover <> ''))[1],
    count(distinct ep.user_id)
  from episode_progress ep
  join viewers v on v.user_id = ep.user_id
  where ep.anime_slug <> p_slug
  group by ep.anime_slug
  order by count(distinct ep.user_id) desc, ep.anime_slug asc
  limit p_limit;
end;
$$;

ALTER FUNCTION public.hub_related_animes(p_slug text, p_limit integer) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_related_animes(p_slug text, p_limit integer) IS 'Co-visionnage : animes les plus regardés par le public de p_slug. service_role uniquement.';

CREATE FUNCTION public.hub_support_dossier(p_code text, p_scope text DEFAULT 'public'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_code    text := lower(trim(coalesce(p_code, '')));
  v_staff   boolean := (p_scope = 'staff');
  p         record;
  v_apps    jsonb;
  v_devices jsonb;
  v_anime   jsonb;
  v_errors  jsonb;
  v_reports jsonb;
  v_titles  boolean;
  v_out     jsonb;
begin
  select * into p from public.profiles where support_code = v_code;
  if not found then
    return jsonb_build_object('found', false, 'code', v_code);
  end if;

  -- Partage coupé par l'utilisateur : on le dit au bot plutôt que « introuvable ».
  if not p.support_optin then
    return jsonb_build_object(
      'found', true, 'optedOut', true, 'code', v_code, 'username', p.username
    );
  end if;

  -- En salon public, les titres regardés ne sortent que si l'activité du profil est publique.
  -- Le staff voit tout.
  v_titles := v_staff or coalesce(p.activity_public, false);

  -- ── Apps installées, versions, plateformes ────────────────────────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'app', ap.app_id,
           'version', ap.app_version,
           'platform', ap.platform,
           'lastSeenAt', ap.last_seen_at,
           'online', ap.last_seen_at > now() - interval '3 minutes'
         ) order by ap.app_id), '[]'::jsonb)
    into v_apps
    from public.app_presence ap
   where ap.user_id = p.id;

  -- ── Appareils ─────────────────────────────────────────────────────────────────────────
  -- En public, le `machine_id` est haché et tronqué : ça suffit à distinguer « c'est le même
  -- poste qu'hier » sans publier un identifiant matériel stable dans un salon Discord.
  select coalesce(jsonb_agg(jsonb_build_object(
           'device', case when v_staff then s.machine_id else left(md5(s.machine_id), 8) end,
           'platform', s.platform,
           'version', s.app_version,
           'lastSeen', s.last_seen,
           'online', s.last_seen > now() - interval '2 minutes'
         ) order by s.last_seen desc), '[]'::jsonb)
    into v_devices
    from public.active_sessions s
   where s.user_id = p.id;

  -- ── Activité anime ────────────────────────────────────────────────────────────────────
  select jsonb_build_object(
           'episodesCompleted', (
             select count(*) from public.episode_progress e
              where e.user_id = p.id and e.completed
           ),
           'watchSeconds', (
             select coalesce(sum(e.position_seconds), 0) from public.episode_progress e
              where e.user_id = p.id
           ),
           'favorites', (select count(*) from public.favorites f where f.user_id = p.id),
           'recent', case when v_titles then coalesce((
             select jsonb_agg(jsonb_build_object(
                      'title', e.anime_title,
                      'slug', e.anime_slug,
                      'episode', e.episode_number,
                      'language', e.language,
                      'percent', round(coalesce(e.progress_percent, 0)::numeric, 1),
                      'at', e.updated_at
                    ) order by e.updated_at desc)
               from (
                 select * from public.episode_progress
                  where user_id = p.id
                  order by updated_at desc
                  limit case when v_staff then 10 else 3 end
               ) e
           ), '[]'::jsonb) else null end
         )
    into v_anime;

  -- ── Erreurs client ────────────────────────────────────────────────────────────────────
  -- Le `detail` (provider, code HTTP, pile) ne sort qu'en staff : c'est le champ le plus
  -- susceptible de contenir par accident quelque chose qu'on n'avait pas prévu d'y mettre.
  select coalesce(jsonb_agg(jsonb_build_object(
           'at', l.created_at,
           'app', l.app,
           'level', l.level,
           'event', l.event,
           'message', l.message,
           'version', l.app_version,
           'platform', l.platform,
           'detail', case when v_staff then l.detail else null end
         ) order by l.created_at desc), '[]'::jsonb)
    into v_errors
    from (
      select * from public.client_logs
       where user_id = p.id
       order by created_at desc
       limit case when v_staff then 50 else 10 end
    ) l;

  -- Signalements de bug déjà déposés : staff uniquement (le message est écrit à main levée
  -- par l'utilisateur, on ne le rediffuse pas dans un salon ouvert).
  if v_staff then
    select coalesce(jsonb_agg(jsonb_build_object(
             'at', b.created_at,
             'category', b.category,
             'status', b.status,
             'message', b.message,
             'version', b.app_version,
             'platform', b.platform,
             'context', b.context
           ) order by b.created_at desc), '[]'::jsonb)
      into v_reports
      from (
        select * from public.bug_reports
         where user_id = p.id
         order by created_at desc
         limit 10
      ) b;
  end if;

  -- ── Assemblage ────────────────────────────────────────────────────────────────────────
  v_out := jsonb_build_object(
    'found', true,
    'scope', case when v_staff then 'staff' else 'public' end,
    'code', p.support_code,
    'generatedAt', now(),
    'account', jsonb_build_object(
      'username', p.username,
      'handle', p.handle,
      'avatar', coalesce(p.avatar_custom, p.avatar),
      'memberSince', p.created_at::date,
      'role', p.role,
      'premium', p.premium_tier,
      'blocked', coalesce(p.banned, false)
    ),
    -- Dernier battement de l'app anime (colonnes de profiles), à part de `apps` (app_presence) :
    -- une app pas encore passée à touch_app_presence n'alimente que lui.
    'lastClient', jsonb_build_object(
      'version', p.app_version,
      'platform', p.platform,
      'lastSeenAt', p.last_seen_at,
      'online', p.last_seen_at > now() - interval '3 minutes'
    ),
    'apps', v_apps,
    'devices', v_devices,
    'activity', jsonb_build_object('anime', v_anime),
    'errors', v_errors
  );

  if v_staff then
    v_out := v_out || jsonb_build_object(
      'staff', jsonb_build_object(
        'userId', p.id,
        'discordId', p.discord_id,
        'machineId', p.machine_id,
        'lastLogin', p.last_login,
        'premiumUntil', p.premium_until,
        'ban', case when coalesce(p.banned, false) then jsonb_build_object(
                 'reason', p.ban_reason,
                 'until', p.banned_until,
                 'at', p.banned_at
               ) else null end,
        'codeRotatedAt', p.support_code_rotated_at,
        'bugReports', coalesce(v_reports, '[]'::jsonb)
      )
    );
  end if;

  return v_out;
end; $$;

ALTER FUNCTION public.hub_support_dossier(p_code text, p_scope text) OWNER TO supabase_admin;

CREATE FUNCTION public.hub_top_animes(p_limit integer DEFAULT 3, p_period text DEFAULT 'all'::text, p_sort text DEFAULT 'plays'::text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(anime_slug text, anime_title text, anime_cover text, total_plays bigint, unique_viewers bigint, watch_seconds double precision, trusted_seconds double precision, completions bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_since timestamptz;
  v_until timestamptz;
  v_sort  text;
begin
  p_limit := least(greatest(coalesce(p_limit, 3), 1), 50);

  v_sort := lower(coalesce(p_sort, 'plays'));
  if v_sort not in ('plays', 'viewers', 'watch_seconds', 'trusted_seconds', 'completions') then
    v_sort := 'plays';
  end if;

  -- Des bornes explicites l'emportent sur `p_period` ; sinon on retombe sur la fenêtre
  -- nommée. 'week'/'month' sont alignées sur le calendrier (comme refresh_stats_snapshot),
  -- 'rolling7'/'rolling30' sont glissantes.
  v_since := p_since;
  v_until := p_until;
  if v_since is null and v_until is null then
    v_since := case lower(coalesce(p_period, 'all'))
                 when 'day'       then date_trunc('day',   now())
                 when 'week'      then date_trunc('week',  now())
                 when 'month'     then date_trunc('month', now())
                 when 'rolling7'  then now() - interval '7 days'
                 when 'rolling30' then now() - interval '30 days'
                 else null
               end;
  end if;

  return query
  with wt as (
    select split_part(w.episode_key, ':', 1) as slug, sum(w.trusted_seconds) as secs
    from watch_time w
    where (v_since is null or w.updated_at >= v_since)
      and (v_until is null or w.updated_at <  v_until)
    group by 1
  )
  select
    ep.anime_slug,
    coalesce(
      (array_agg(ep.anime_title order by ep.updated_at desc)
         filter (where ep.anime_title is not null and ep.anime_title <> 'Sans titre'))[1],
      ep.anime_slug
    ),
    (array_agg(ep.anime_cover order by ep.updated_at desc)
       filter (where ep.anime_cover is not null and ep.anime_cover <> ''))[1],
    count(*),
    count(distinct ep.user_id),
    coalesce(sum(ep.position_seconds), 0),
    coalesce(max(wt.secs), 0)::double precision,
    count(*) filter (where ep.completed)
  from episode_progress ep
  left join wt on wt.slug = ep.anime_slug
  where (v_since is null or ep.updated_at >= v_since)
    and (v_until is null or ep.updated_at <  v_until)
  group by ep.anime_slug
  order by
    case v_sort
      when 'viewers'         then count(distinct ep.user_id)::double precision
      when 'watch_seconds'   then coalesce(sum(ep.position_seconds), 0)::double precision
      when 'trusted_seconds' then coalesce(max(wt.secs), 0)::double precision
      when 'completions'     then (count(*) filter (where ep.completed))::double precision
      else count(*)::double precision
    end desc,
    count(*) desc,
    ep.anime_slug asc
  limit p_limit;
end;
$$;

ALTER FUNCTION public.hub_top_animes(p_limit integer, p_period text, p_sort text, p_since timestamp with time zone, p_until timestamp with time zone) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_top_animes(p_limit integer, p_period text, p_sort text, p_since timestamp with time zone, p_until timestamp with time zone) IS 'Top animes. p_period = all|day|week|month|rolling7|rolling30, ou bornes libres p_since/p_until (prioritaires). p_sort = plays|viewers|watch_seconds|trusted_seconds|completions. service_role uniquement.';

CREATE FUNCTION public.hub_user_rank(p_user_id uuid, p_metric text DEFAULT 'watch_time'::text, p_period text DEFAULT 'all'::text) RETURNS TABLE(rank_position bigint, total_ranked bigint, total_watch_seconds double precision, total_episodes bigint, total_animes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_metric is null or p_metric not in ('watch_time', 'episodes', 'animes') then
    p_metric := 'watch_time';
  end if;
  if p_period is null or p_period not in ('all', 'week') then
    p_period := 'all';
  end if;
  if p_user_id is null then return; end if;

  return query
  with ranked as (
    select
      t.user_id as uid,
      row_number() over (
        order by (case p_metric
                    when 'episodes' then t.eps
                    when 'animes'   then t.animes
                    else t.secs::bigint
                  end) desc, p.created_at asc
      ) as rn,
      count(*) over () as total,
      t.secs, t.eps, t.animes
    from leaderboard_totals t
    join profiles p on p.id = t.user_id
    where t.period = p_period
      and p.is_public = true
      and coalesce(p.banned, false) = false
      and p.handle is not null
      and (case p_metric
             when 'episodes' then t.eps
             when 'animes'   then t.animes
             else t.secs::bigint
           end) > 0
  )
  select r.rn, r.total, r.secs, r.eps, r.animes
  from ranked r
  where r.uid = p_user_id;
end;
$$;

ALTER FUNCTION public.hub_user_rank(p_user_id uuid, p_metric text, p_period text) OWNER TO postgres;

COMMENT ON FUNCTION public.hub_user_rank(p_user_id uuid, p_metric text, p_period text) IS 'Rang d''un utilisateur dans la meme population que hub_leaderboard. 0 ligne si non classe. service_role uniquement.';

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'developer')
  );
$$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;

COMMENT ON FUNCTION public.is_admin() IS 'Garde des RPC admin_*. Lit profiles.role via auth.uid() (pas un claim JWT). Depuis 0075, les admin_* ne sont plus exécutables par anon/PUBLIC : la garde reste le vrai contrôle, le revoke est une défense en profondeur.';

CREATE FUNCTION public.is_banned() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and banned
      and (banned_until is null or banned_until > now())
  );
$$;

ALTER FUNCTION public.is_banned() OWNER TO postgres;

CREATE FUNCTION public.is_premium(uid uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and premium_tier is not null
      and (premium_until is null or premium_until > now())
  );
$$;

ALTER FUNCTION public.is_premium(uid uuid) OWNER TO postgres;

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

ALTER FUNCTION public.is_staff() OWNER TO postgres;

CREATE FUNCTION public.list_comment_replies(p_parent uuid, lim integer DEFAULT 20, off integer DEFAULT 0) RETURNS TABLE(id uuid, user_id uuid, body text, is_spoiler boolean, likes_count integer, liked_by_me boolean, edited_at timestamp with time zone, created_at timestamp with time zone, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, can_moderate boolean, anime_rating smallint, flair_icon text, name_color text, frame_gradient text, rank_badge smallint, cosmetic_ornament text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  return query
  select
    c.id, c.user_id, c.body, c.is_spoiler, c.likes_count,
    (v_me is not null and exists (
      select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = v_me
    )) as liked_by_me,
    c.edited_at, c.created_at,
    p.handle, p.username, p.avatar, p.avatar_custom,
    p.accent_color, p.premium_tier, p.premium_until, p.role,
    (v_me is not null and (c.user_id = v_me or is_staff())) as can_moderate,
    r.rating as anime_rating,
    cf.value as flair_icon, nc.value as name_color, fr.value as frame_gradient,
    case when lr.current_rank <= 10 then lr.current_rank::smallint else null end as rank_badge,
    case when public.cosmetic_ok('ornament', p.cosmetic_ornament, eff.tier)
         then p.cosmetic_ornament else null end as cosmetic_ornament
  from public.comments c
  join public.profiles p on p.id = c.user_id
  cross join lateral (
    select case when p.premium_tier is not null
                     and (p.premium_until is null or p.premium_until > now())
                then p.premium_tier else null end as tier
  ) eff
  left join public.anime_ratings r
    on c.target_kind = 'anime'
   and r.anime_slug = c.target_key
   and r.user_id = c.user_id
  left join public.credit_shop_items cf on cf.id = p.equipped_comment_flair
  left join public.credit_shop_items nc on nc.id = p.equipped_name_color
  left join public.credit_shop_items fr on fr.id = p.equipped_avatar_frame
  left join public.leaderboard_rank_records lr on lr.user_id = c.user_id
  where c.parent_id = p_parent and c.deleted_at is null
  order by c.created_at, c.id
  limit greatest(1, least(lim, 50)) offset greatest(0, least(off, 500));
end;
$$;

ALTER FUNCTION public.list_comment_replies(p_parent uuid, lim integer, off integer) OWNER TO postgres;

CREATE FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, lim integer DEFAULT 15) RETURNS TABLE(id uuid, user_id uuid, body text, is_spoiler boolean, likes_count integer, replies_count integer, liked_by_me boolean, edited_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, can_moderate boolean, anime_rating smallint, flair_icon text, name_color text, frame_gradient text, rank_badge smallint, cosmetic_ornament text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  return query
  select
    c.id, c.user_id, c.body, c.is_spoiler,
    c.likes_count, c.replies_count,
    (v_me is not null and exists (
      select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = v_me
    )) as liked_by_me,
    c.edited_at, c.deleted_at, c.created_at,
    p.handle, p.username, p.avatar, p.avatar_custom,
    p.accent_color, p.premium_tier, p.premium_until, p.role,
    (v_me is not null and (c.user_id = v_me or is_staff())) as can_moderate,
    r.rating as anime_rating,
    cf.value as flair_icon, nc.value as name_color, fr.value as frame_gradient,
    case when lr.current_rank <= 10 then lr.current_rank::smallint else null end as rank_badge,
    case when public.cosmetic_ok('ornament', p.cosmetic_ornament, eff.tier)
         then p.cosmetic_ornament else null end as cosmetic_ornament
  from public.comments c
  join public.profiles p on p.id = c.user_id
  cross join lateral (
    select case when p.premium_tier is not null
                     and (p.premium_until is null or p.premium_until > now())
                then p.premium_tier else null end as tier
  ) eff
  left join public.anime_ratings r
    on p_kind = 'anime'
   and r.anime_slug = trim(coalesce(p_key, ''))
   and r.user_id = c.user_id
  left join public.credit_shop_items cf on cf.id = p.equipped_comment_flair
  left join public.credit_shop_items nc on nc.id = p.equipped_name_color
  left join public.credit_shop_items fr on fr.id = p.equipped_avatar_frame
  left join public.leaderboard_rank_records lr on lr.user_id = c.user_id
  where c.target_kind = p_kind
    and c.target_key = trim(coalesce(p_key, ''))
    and c.parent_id is null
    and (c.deleted_at is null or c.replies_count > 0)
    and (
      p_before_at is null
      or (c.created_at, c.id) < (p_before_at, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by c.created_at desc, c.id desc
  limit greatest(1, least(lim, 30));
end;
$$;

ALTER FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone, p_before_id uuid, lim integer) OWNER TO postgres;

CREATE FUNCTION public.list_friend_requests() RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, ambient_theme text, direction text, requested_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom,
    p.accent_color, p.premium_tier, p.premium_until, p.role, p.ambient_theme,
    case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end as direction,
    f.created_at as requested_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.created_at desc;
$$;

ALTER FUNCTION public.list_friend_requests() OWNER TO postgres;

CREATE FUNCTION public.list_friends() RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, ambient_theme text, since timestamp with time zone, last_active timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom,
    p.accent_color, p.premium_tier, p.premium_until, p.role, p.ambient_theme,
    coalesce(f.responded_at, f.created_at) as since,
    case when p.presence_public then p.last_login else null end as last_active
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by (case when p.presence_public then p.last_login else null end) desc nulls last,
           coalesce(f.responded_at, f.created_at) desc;
$$;

ALTER FUNCTION public.list_friends() OWNER TO postgres;

CREATE FUNCTION public.list_my_api_keys() RETURNS TABLE(id uuid, name text, prefix text, created_at timestamp with time zone, last_used_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select k.id, k.name, k.prefix, k.created_at, k.last_used_at
  from public.api_keys k
  where k.user_id = auth.uid() and k.revoked_at is null
  order by k.created_at desc;
$$;

ALTER FUNCTION public.list_my_api_keys() OWNER TO postgres;

CREATE FUNCTION public.log_client_event(p_app text, p_event text, p_level text DEFAULT 'error'::text, p_message text DEFAULT NULL::text, p_detail jsonb DEFAULT NULL::jsonb, p_app_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me     uuid := auth.uid();
  v_recent int;
  v_id     bigint;
  v_ring   int := public.client_log_ring_size();
begin
  if v_me is null then return null; end if;
  if nullif(trim(coalesce(p_event, '')), '') is null then return null; end if;

  -- Limiteur de débit : 30 lignes par minute et par compte. Au-delà, on jette.
  select count(*) into v_recent
    from public.client_logs
   where user_id = v_me and created_at > now() - interval '1 minute';
  if v_recent >= 30 then return null; end if;

  insert into public.client_logs (user_id, app, level, event, message, detail, app_version, platform)
  values (
    v_me,
    left(coalesce(nullif(trim(p_app), ''), 'inconnu'), 32),
    case when p_level in ('error', 'warn', 'info') then p_level else 'error' end,
    left(trim(p_event), 64),
    left(nullif(trim(coalesce(p_message, '')), ''), 500),
    -- Garde-fou de taille : un `detail` obèse est de toute façon illisible dans un embed.
    case when p_detail is not null and length(p_detail::text) <= 2000 then p_detail else null end,
    left(nullif(trim(coalesce(p_app_version, '')), ''), 20),
    left(nullif(trim(coalesce(p_platform, '')), ''), 20)
  )
  returning id into v_id;

  -- Purge opportuniste : anneau borné + rétention, à la charge de l'écrivain. Pas de
  -- pg_cron à programmer, et le coût reste sur le compte qui produit les lignes.
  delete from public.client_logs
   where user_id = v_me
     and (
       created_at < now() - make_interval(days => public.client_log_retention_days())
       or id < (
         select min(id) from (
           select id from public.client_logs
            where user_id = v_me
            order by id desc
            limit v_ring
         ) keep
       )
     );

  return v_id;
end; $$;

ALTER FUNCTION public.log_client_event(p_app text, p_event text, p_level text, p_message text, p_detail jsonb, p_app_version text, p_platform text) OWNER TO supabase_admin;

CREATE FUNCTION public.mark_announcements_read(p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  insert into public.announcement_reads (announcement_id, user_id)
  select a.id, v_me from public.announcements a
  where (a.target_user_id is null or a.target_user_id = v_me)
    and (p_ids is null or a.id = any(p_ids))
  on conflict (announcement_id, user_id) do nothing;
end; $$;

ALTER FUNCTION public.mark_announcements_read(p_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.my_support_code() RETURNS TABLE(support_code text, support_optin boolean, rotated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.support_code, p.support_optin, p.support_code_rotated_at
  from public.profiles p
  where p.id = auth.uid();
$$;

ALTER FUNCTION public.my_support_code() OWNER TO supabase_admin;

CREATE FUNCTION public.online_count() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*) from profiles where last_seen_at > now() - interval '3 minutes';
$$;

ALTER FUNCTION public.online_count() OWNER TO postgres;

CREATE FUNCTION public.party_room_close(p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  delete from public.party_rooms where code = p_code;
end; $$;

ALTER FUNCTION public.party_room_close(p_code text) OWNER TO postgres;

CREATE FUNCTION public.party_room_get_state(p_code text) RETURNS TABLE(current jsonb, queue jsonb, playback jsonb, options jsonb, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r.current, r.queue, r.playback, r.options, r.updated_at
  from public.party_rooms r
  where r.code = p_code;
$$;

ALTER FUNCTION public.party_room_get_state(p_code text) OWNER TO postgres;

CREATE FUNCTION public.party_room_save_state(p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_code is null or length(p_code) <> 6 then raise exception 'invalide'; end if;

  delete from public.party_rooms where updated_at < now() - interval '6 hours';

  insert into public.party_rooms (code, host_client_id, current, queue, playback, options, updated_at)
  values (
    p_code, p_host_client_id, p_current,
    coalesce(p_queue, '[]'::jsonb), coalesce(p_playback, '{"currentTime":0,"isPlaying":false}'::jsonb),
    coalesce(p_options, '{}'::jsonb), now()
  )
  on conflict (code) do update set
    host_client_id = excluded.host_client_id,
    current        = excluded.current,
    queue          = excluded.queue,
    playback       = excluded.playback,
    options        = excluded.options,
    updated_at     = now();
end; $$;

ALTER FUNCTION public.party_room_save_state(p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb) OWNER TO postgres;

CREATE FUNCTION public.post_comment(p_kind text, p_key text, p_body text, p_parent uuid DEFAULT NULL::uuid, p_spoiler boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me     uuid := auth.uid();
  v_body   text := trim(coalesce(p_body, ''));
  v_key    text := trim(coalesce(p_key, ''));
  v_last   timestamptz;
  v_cd     int := public.comment_cooldown_seconds();
  v_n      int;
  v_id     uuid;
  v_parent public.comments;
begin
  perform public._comment_assert_can_write(v_me);

  if p_kind <> 'anime' then raise exception 'cible_invalide'; end if;
  if v_key = '' or length(v_key) > 200 then raise exception 'cible_invalide'; end if;

  -- Normalisation des blancs : pas de mur de retours à la ligne, pas d'espaces parasites.
  v_body := regexp_replace(v_body, '[ \t]+', ' ', 'g');
  v_body := regexp_replace(v_body, E'\n{3,}', E'\n\n', 'g');
  if length(v_body) < 2    then raise exception 'message_vide'; end if;
  if length(v_body) > 1500 then raise exception 'message_trop_long'; end if;
  if public.comment_has_blocked_word(v_body) then raise exception 'mot_interdit'; end if;

  -- Réponse : le parent doit exister, être vivant, être une RACINE et viser la même œuvre.
  if p_parent is not null then
    select * into v_parent from public.comments where id = p_parent;
    if not found
       or v_parent.deleted_at is not null
       or v_parent.parent_id is not null
       or v_parent.target_kind <> p_kind
       or v_parent.target_key  <> v_key then
      raise exception 'parent_invalide';
    end if;
  end if;

  -- 1. Cooldown entre deux messages.
  select max(created_at) into v_last from public.comments where user_id = v_me;
  if v_last is not null and v_last > now() - make_interval(secs => v_cd) then
    raise exception 'cooldown:%',
      greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => v_cd) - now())))::int);
  end if;

  -- 2. Quotas glissants (un seul balayage de l'index user_created).
  select count(*) into v_n from public.comments
   where user_id = v_me and created_at > now() - interval '1 hour';
  if v_n >= public.comment_hourly_cap() then raise exception 'quota_horaire'; end if;

  select count(*) into v_n from public.comments
   where user_id = v_me and created_at > now() - interval '1 day';
  if v_n >= public.comment_daily_cap() then raise exception 'quota_journalier'; end if;

  -- 3. Anti-squat : nombre de fils ouverts par ce compte sur CETTE œuvre (24 h).
  if p_parent is null then
    select count(*) into v_n from public.comments
     where user_id = v_me and target_kind = p_kind and target_key = v_key
       and parent_id is null and created_at > now() - interval '1 day';
    if v_n >= public.comment_threads_per_target_cap() then raise exception 'trop_de_fils'; end if;
  end if;

  -- 4. Doublon : même texte, même œuvre, moins de 30 min.
  if exists (
    select 1 from public.comments
     where user_id = v_me and target_kind = p_kind and target_key = v_key
       and deleted_at is null
       and created_at > now() - interval '30 minutes'
       and public.comment_normalize(body) = public.comment_normalize(v_body)
  ) then raise exception 'doublon'; end if;

  insert into public.comments (target_kind, target_key, user_id, parent_id, body, is_spoiler)
  values (p_kind, v_key, v_me, p_parent, v_body, coalesce(p_spoiler, false))
  returning id into v_id;

  -- Compteur dénormalisé de la racine (évite un count() à chaque lecture du fil).
  if p_parent is not null then
    update public.comments set replies_count = replies_count + 1 where id = p_parent;
  end if;

  return v_id;
end; $$;

ALTER FUNCTION public.post_comment(p_kind text, p_key text, p_body text, p_parent uuid, p_spoiler boolean) OWNER TO postgres;

CREATE FUNCTION public.profile_view_hourly_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select 30 $$;

ALTER FUNCTION public.profile_view_hourly_cap() OWNER TO postgres;

CREATE FUNCTION public.profiles_set_support_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.support_code is null then
    new.support_code := public.gen_support_code(new.username);
  end if;
  return new;
end; $$;

ALTER FUNCTION public.profiles_set_support_code() OWNER TO supabase_admin;

CREATE FUNCTION public.purchase_credit_item(p_item_id text) RETURNS TABLE(credits integer, owned text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_item public.credit_shop_items%rowtype;
  v_owned text[];
  v_credits integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_item from public.credit_shop_items where id = p_item_id and active;
  if not found then
    raise exception 'item_not_found';
  end if;

  select
    case v_item.category
      when 'avatar_frame' then owned_avatar_frames
      when 'comment_flair' then owned_comment_flairs
      else owned_name_colors
    end,
    profiles.credits
  into v_owned, v_credits
  from public.profiles
  where id = v_uid
  for update;

  if p_item_id = any(v_owned) then
    raise exception 'already_owned';
  end if;
  if v_credits < v_item.price then
    raise exception 'insufficient_credits';
  end if;

  if v_item.category = 'avatar_frame' then
    update public.profiles
      set credits = credits - v_item.price,
          owned_avatar_frames = array_append(owned_avatar_frames, p_item_id)
      where id = v_uid;
  elsif v_item.category = 'comment_flair' then
    update public.profiles
      set credits = credits - v_item.price,
          owned_comment_flairs = array_append(owned_comment_flairs, p_item_id)
      where id = v_uid;
  else
    update public.profiles
      set credits = credits - v_item.price,
          owned_name_colors = array_append(owned_name_colors, p_item_id)
      where id = v_uid;
  end if;

  return query
    select p.credits,
      case v_item.category
        when 'avatar_frame' then p.owned_avatar_frames
        when 'comment_flair' then p.owned_comment_flairs
        else p.owned_name_colors
      end
    from public.profiles p
    where p.id = v_uid;
end;
$$;

ALTER FUNCTION public.purchase_credit_item(p_item_id text) OWNER TO postgres;

CREATE FUNCTION public.purge_audit_log_entries() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from auth.audit_log_entries
  where created_at < now() - interval '30 days';
end;
$$;

ALTER FUNCTION public.purge_audit_log_entries() OWNER TO postgres;

CREATE FUNCTION public.purge_profile_views() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.profile_views where created_at < now() - interval '45 days';
$$;

ALTER FUNCTION public.purge_profile_views() OWNER TO postgres;

CREATE FUNCTION public.record_profile_view(p_profile uuid, p_viewer_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_key      text := left(coalesce(trim(p_viewer_key), ''), 80);
  v_visible  boolean;
  v_recent   integer;
begin
  if p_profile is null or v_key !~ '^(u:|ip:)' then return false; end if;

  -- Auto-vue : un membre connecté ne gonfle pas son propre compteur.
  if v_key = 'u:' || p_profile::text then return false; end if;

  -- Cible réelle, publique et non bannie (un profil privé n'est de toute façon pas affiché).
  select (p.is_public and coalesce(p.banned, false) = false)
    into v_visible from public.profiles p where p.id = p_profile;
  if not coalesce(v_visible, false) then return false; end if;

  -- Plafond horaire par empreinte, tous profils confondus.
  select count(*) into v_recent
    from public.profile_views
   where viewer_key = v_key and created_at > now() - interval '1 hour';
  if v_recent >= public.profile_view_hourly_cap() then return false; end if;

  insert into public.profile_views (profile_id, viewer_key)
  values (p_profile, v_key)
  on conflict (profile_id, viewer_key, viewed_on) do nothing;

  if not found then return false; end if; -- déjà vu aujourd'hui

  update public.profiles set views_count = views_count + 1 where id = p_profile;
  return true;
end; $$;

ALTER FUNCTION public.record_profile_view(p_profile uuid, p_viewer_key text) OWNER TO postgres;

CREATE FUNCTION public.refresh_admin_dashboard_snapshot() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '120s'
    AS $$
declare
  v_cached_overview jsonb;
  v_overview        jsonb;
  v_signups         jsonb;
  v_activity        jsonb;
  v_top_animes      jsonb;
  v_top_watchers    jsonb;
  v_platforms       jsonb;
  v_hours           jsonb;
  v_accounts        jsonb;
  v_lock_key constant bigint := hashtext('refresh_admin_dashboard_snapshot');
begin
  if not pg_try_advisory_lock(v_lock_key) then
    raise notice 'refresh_admin_dashboard_snapshot: run précédent toujours actif, on saute ce passage';
    return;
  end if;

  select payload into v_cached_overview
  from public.stats_snapshot
  where key = 'overview';
  v_cached_overview := coalesce(v_cached_overview, '{}'::jsonb);

  select jsonb_build_object(
    'totalUsers',          count(*),
    'totalAdmins',         count(*) filter (where role = 'admin'),
    'totalBanned',         count(*) filter (where banned),
    'activeToday',         coalesce((v_cached_overview->>'active_today')::bigint, 0),
    'active7d',            coalesce((v_cached_overview->>'active_7d')::bigint, 0),
    'active30d',           coalesce((v_cached_overview->>'active_30d')::bigint, 0),
    'newToday',            count(*) filter (where created_at > now() - interval '1 day'),
    'new7d',               count(*) filter (where created_at > now() - interval '7 days'),
    'onlineNow',           count(*) filter (where last_seen_at > now() - interval '3 minutes'),
    'premiumActive',       count(*) filter (
      where premium_tier is not null and (premium_until is null or premium_until > now())
    ),
    'totalWatchSeconds',   coalesce((v_cached_overview->>'watch_seconds')::double precision, 0),
    'trustedWatchSeconds', coalesce((v_cached_overview->>'trusted_secs')::double precision, 0),
    'totalEpisodes',       coalesce((v_cached_overview->>'episodes')::bigint, 0)
  ) into v_overview
  from public.profiles;

  select coalesce(jsonb_agg(
    jsonb_build_object('day', d.day::date, 'count', coalesce(s.count, 0)) order by d.day
  ), '[]'::jsonb)
  into v_signups
  from generate_series(current_date - 89, current_date, interval '1 day') as d(day)
  left join (
    select created_at::date as day, count(*) as count
    from public.profiles
    where created_at >= current_date - 89
    group by 1
  ) s on s.day = d.day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day::date,
    'episodes', coalesce(a.episodes, 0),
    'watchSeconds', coalesce(a.watch_seconds, 0),
    'activeUsers', coalesce(a.active_users, 0)
  ) order by d.day), '[]'::jsonb)
  into v_activity
  from generate_series(current_date - 89, current_date, interval '1 day') as d(day)
  left join (
    select updated_at::date as day,
           count(*) as episodes,
           sum(position_seconds) as watch_seconds,
           count(distinct user_id) as active_users
    from public.episode_progress
    where updated_at >= current_date - 89
    group by 1
  ) a on a.day = d.day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', x.anime_slug,
    'title', x.anime_title,
    'cover', x.anime_cover,
    'plays', x.total_plays,
    'viewers', x.unique_viewers,
    'watchSeconds', x.watch_seconds,
    'trustedSeconds', x.trusted_seconds,
    'completions', x.completions
  ) order by x.total_plays desc, x.trusted_seconds desc), '[]'::jsonb)
  into v_top_animes
  from (
    with wt as (
      select split_part(episode_key, ':', 1) as slug, sum(trusted_seconds) as seconds
      from public.watch_time
      group by 1
    )
    select ep.anime_slug,
           coalesce(
             (array_agg(ep.anime_title order by ep.updated_at desc)
                filter (where ep.anime_title is not null and ep.anime_title <> 'Sans titre'))[1],
             ep.anime_slug
           ) as anime_title,
           (array_agg(ep.anime_cover order by ep.updated_at desc)
              filter (where ep.anime_cover is not null and ep.anime_cover <> ''))[1] as anime_cover,
           count(*) as total_plays,
           count(distinct ep.user_id) as unique_viewers,
           coalesce(sum(ep.position_seconds), 0) as watch_seconds,
           coalesce(max(wt.seconds), 0)::double precision as trusted_seconds,
           count(*) filter (where ep.completed) as completions
    from public.episode_progress ep
    left join wt on wt.slug = ep.anime_slug
    group by ep.anime_slug
    order by total_plays desc, trusted_seconds desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'username', x.username,
    'avatar', x.avatar,
    'discordId', x.discord_id,
    'premiumTier', x.premium_tier,
    'trustedSeconds', x.trusted_seconds,
    'episodes', x.episodes,
    'animes', x.animes,
    'lastWatchAt', x.last_watch_at
  ) order by x.trusted_seconds desc), '[]'::jsonb)
  into v_top_watchers
  from (
    select p.id, p.username, p.avatar, p.discord_id,
           case when p.premium_tier is not null
                     and (p.premium_until is null or p.premium_until > now())
                then p.premium_tier else null end as premium_tier,
           t.secs::bigint as trusted_seconds,
           t.eps::bigint as episodes,
           t.animes::bigint as animes,
           (select max(w.updated_at) from public.watch_time w where w.user_id = p.id) as last_watch_at
    from public.leaderboard_totals t
    join public.profiles p on p.id = t.user_id
    where t.period = 'all' and t.secs > 0
    order by t.secs desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'platform', x.platform, 'users', x.users
  ) order by x.users desc), '[]'::jsonb)
  into v_platforms
  from (
    select coalesce(nullif(platform, ''), 'inconnu') as platform, count(*) as users
    from public.profiles
    where last_seen_at is not null
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dow', x.dow, 'hour', x.hour, 'plays', x.plays
  )), '[]'::jsonb)
  into v_hours
  from (
    select extract(isodow from updated_at at time zone 'Europe/Paris')::int - 1 as dow,
           extract(hour from updated_at at time zone 'Europe/Paris')::int as hour,
           count(*) as plays
    from public.episode_progress
    where updated_at >= now() - interval '30 days'
    group by 1, 2
  ) x;

  select jsonb_build_object(
    'discord', count(*) filter (
      where not is_anonymous and raw_app_meta_data->>'provider' = 'discord'
    ),
    'email', count(*) filter (
      where not is_anonymous and raw_app_meta_data->>'provider' = 'email'
    ),
    'guest', count(*) filter (where is_anonymous),
    'other', count(*) filter (
      where not is_anonymous
        and coalesce(raw_app_meta_data->>'provider', '') not in ('discord', 'email')
    ),
    'contactableEmails', count(*) filter (
      where not is_anonymous and email is not null and email <> ''
    )
  ) into v_accounts
  from auth.users;

  insert into public.stats_snapshot (key, payload, computed_at)
  values ('admin_dashboard', jsonb_build_object(
    'overview', v_overview,
    'signups', v_signups,
    'activity', v_activity,
    'topAnimes', v_top_animes,
    'topWatchers', v_top_watchers,
    'platforms', v_platforms,
    'hours', v_hours,
    'accounts', v_accounts,
    'computedAt', now()
  ), now())
  on conflict (key) do update
    set payload = excluded.payload,
        computed_at = excluded.computed_at;

  perform pg_advisory_unlock(v_lock_key);
exception when others then
  perform pg_advisory_unlock(v_lock_key);
  raise;
end;
$$;

ALTER FUNCTION public.refresh_admin_dashboard_snapshot() OWNER TO postgres;

CREATE FUNCTION public.refresh_catalog_languages() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  changed integer;
begin
  with totals as (
    select slug, array_agg(distinct lang order by lang) as langs
    from public.episode_sources
    group by slug
  )
  update public.anime_catalog c
     set languages = totals.langs
    from totals
   where totals.slug = c.slug
     and c.languages is distinct from totals.langs;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

ALTER FUNCTION public.refresh_catalog_languages() OWNER TO postgres;

CREATE FUNCTION public.refresh_episode_counts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  changed integer;
begin
  with per_season as (
    select
      es.slug,
      es.season_id,
      max((
        select max(case when jsonb_typeof(v) = 'array' then jsonb_array_length(v) end)
        from jsonb_each(es.sources) as t(k, v)
      )) as eps
    from public.episode_sources es
    where es.season_id !~ '^(film|oav|kai)'
    group by es.slug, es.season_id
  ),
  totals as (
    select slug, sum(eps)::int as total
    from per_season
    where eps is not null
    group by slug
  )
  update public.anime_catalog c
     set episode_count = totals.total
    from totals
   where totals.slug = c.slug
     and c.episode_count is distinct from totals.total;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

ALTER FUNCTION public.refresh_episode_counts() OWNER TO postgres;

CREATE FUNCTION public.refresh_stats_snapshot() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_week timestamptz := date_trunc('week', now());
  v_lock_key constant bigint := hashtext('refresh_stats_snapshot');
begin
  if not pg_try_advisory_lock(v_lock_key) then
    raise notice 'refresh_stats_snapshot: run précédent toujours actif, on saute ce passage';
    return;
  end if;

  with totals as (
    select coalesce(w.user_id, e.user_id) as user_id,
           'all'::text as period,
           coalesce(w.secs, 0)::double precision as secs,
           coalesce(e.eps, 0)::bigint as eps,
           coalesce(e.animes, 0)::bigint as animes
    from (
      select user_id, sum(trusted_seconds)::double precision as secs
      from public.watch_time group by user_id
    ) w
    full join (
      select user_id,
             count(*) filter (where completed and duration > 0) as eps,
             count(distinct anime_slug) filter (where duration > 0) as animes
      from public.episode_progress group by user_id
    ) e on e.user_id = w.user_id
    where coalesce(w.user_id, e.user_id) is not null
    union all
    select coalesce(w.user_id, e.user_id), 'week'::text,
           coalesce(w.secs, 0)::double precision,
           coalesce(e.eps, 0)::bigint, coalesce(e.animes, 0)::bigint
    from (
      select user_id, sum(trusted_seconds)::double precision as secs
      from public.watch_time where updated_at >= v_week group by user_id
    ) w
    full join (
      select user_id,
             count(*) filter (where completed and duration > 0) as eps,
             count(distinct anime_slug) filter (where duration > 0) as animes
      from public.episode_progress where updated_at >= v_week group by user_id
    ) e on e.user_id = w.user_id
    where coalesce(w.user_id, e.user_id) is not null
  )
  insert into public.leaderboard_totals (user_id, period, secs, eps, animes)
  select user_id, period, secs, eps, animes from totals
  on conflict (user_id, period) do update
    set secs = excluded.secs, eps = excluded.eps, animes = excluded.animes
    where (leaderboard_totals.secs, leaderboard_totals.eps, leaderboard_totals.animes)
          is distinct from (excluded.secs, excluded.eps, excluded.animes);

  delete from public.leaderboard_totals t
  where t.period = 'week'
    and not exists (
      select 1
      from public.watch_time w
      where w.user_id = t.user_id and w.updated_at >= v_week
      union all
      select 1
      from public.episode_progress ep
      where ep.user_id = t.user_id and ep.updated_at >= v_week
    );

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
$$;

ALTER FUNCTION public.refresh_stats_snapshot() OWNER TO postgres;

CREATE FUNCTION public.regen_support_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me   uuid := auth.uid();
  v_last timestamptz;
  v_code text;
begin
  if v_me is null then raise exception 'forbidden'; end if;

  select support_code_rotated_at into v_last from public.profiles where id = v_me;
  if v_last is not null and v_last > now() - interval '1 hour' then
    raise exception 'cooldown:%', ceil(extract(epoch from (v_last + interval '1 hour' - now())))::int;
  end if;

  select public.gen_support_code(username) into v_code from public.profiles where id = v_me;
  update public.profiles
     set support_code = v_code, support_code_rotated_at = now()
   where id = v_me;

  return v_code;
end; $$;

ALTER FUNCTION public.regen_support_code() OWNER TO supabase_admin;

CREATE FUNCTION public.release_device_slot(p_machine_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_mid text := nullif(trim(coalesce(p_machine_id, '')), '');
begin
  if auth.uid() is null or v_mid is null then return; end if;
  delete from public.active_sessions where user_id = auth.uid() and machine_id = v_mid;
end; $$;

ALTER FUNCTION public.release_device_slot(p_machine_id text) OWNER TO postgres;

CREATE FUNCTION public.remove_friend(p_other uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  delete from public.friendships
   where least(requester_id, addressee_id) = least(v_me, p_other)
     and greatest(requester_id, addressee_id) = greatest(v_me, p_other);
  return json_build_object('ok', true);
end; $$;

ALTER FUNCTION public.remove_friend(p_other uuid) OWNER TO postgres;

CREATE FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.anime_lists al
  set sort_order = ord.i
  from unnest(p_slugs) with ordinality as ord(slug, i)
  where al.user_id = auth.uid()
    and al.status = p_status
    and al.anime_slug = ord.slug;
end;
$$;

ALTER FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) OWNER TO postgres;

CREATE FUNCTION public.reorder_favorites(p_slugs text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.favorites f
  set sort_order = ord.i
  from unnest(p_slugs) with ordinality as ord(slug, i)
  where f.user_id = auth.uid()
    and f.anime_slug = ord.slug;
end;
$$;

ALTER FUNCTION public.reorder_favorites(p_slugs text[]) OWNER TO postgres;

CREATE FUNCTION public.report_comment(p_id uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me       uuid := auth.uid();
  v_reason   text := left(trim(coalesce(p_reason, '')), 300);
  v_recent   int;
  v_inserted uuid;
begin
  perform public._comment_assert_can_write(v_me);
  if v_reason = '' then v_reason := 'non précisé'; end if;

  if not exists (select 1 from public.comments where id = p_id and deleted_at is null) then
    raise exception 'introuvable';
  end if;

  -- Quota glissant 24 h. Placé APRÈS l'existence du message pour qu'un signalement sur un
  -- message déjà supprimé ne consomme pas le quota du membre.
  select count(*) into v_recent
    from public.comment_reports
   where reporter_id = v_me and created_at > now() - interval '24 hours';
  if v_recent >= public.comment_report_daily_cap() then
    raise exception 'quota_signalements';
  end if;

  -- Re-signalement du même message : rien n'est créé (contrainte d'unicité), donc aucun coût de
  -- quota — et `returning` ne renvoie aucune ligne, ce qui distingue les deux cas.
  insert into public.comment_reports (comment_id, reporter_id, reason)
  values (p_id, v_me, v_reason)
  on conflict (comment_id, reporter_id) do nothing
  returning id into v_inserted;

  return v_inserted is not null;
end; $$;

ALTER FUNCTION public.report_comment(p_id uuid, p_reason text) OWNER TO postgres;

CREATE FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb DEFAULT '[]'::jsonb, p_app_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_context jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_cat text := lower(trim(coalesce(p_category, 'other')));
  v_profile record;
  v_last timestamptz;
  v_cd int := public.bug_report_cooldown_seconds();
  v_remaining int;
  v_first_path text;
  v_att jsonb;
begin
  if v_actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'forbidden';
  end if;
  if length(v_body) < 5 then raise exception 'message_vide'; end if;
  if length(v_body) > 4000 then raise exception 'message_trop_long'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 4 then raise exception 'too_many_attachments'; end if;
  if v_cat not in ('playback', 'scans', 'downloads', 'catalog', 'account', 'ui', 'other') then
    v_cat := 'other';
  end if;

  select max(created_at) into v_last from public.bug_reports where user_id = v_actor;
  if v_last is not null and v_last > now() - make_interval(secs => v_cd) then
    v_remaining := ceil(extract(epoch from (v_last + make_interval(secs => v_cd) - now())))::int;
    raise exception 'cooldown:%', greatest(1, v_remaining);
  end if;

  select p.username, coalesce(p.avatar_custom, p.avatar) as avatar into v_profile
    from public.profiles p where p.id = v_actor;
  if not found then raise exception 'profile_missing'; end if;

  select (elem->>'path') into v_first_path
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) elem
   limit 1;

  insert into public.bug_reports (
    id, user_id, message, attachment_path, app_version, platform, category, context,
    status, last_message_at
  ) values (
    p_id, v_actor, v_body, v_first_path, p_app_version, p_platform, v_cat, p_context,
    'open', now()
  );

  insert into public.bug_report_messages (id, report_id, author_id, author_name, author_avatar, author_role, body)
  values (p_message_id, p_id, v_actor, coalesce(v_profile.username, 'Membre'), v_profile.avatar, 'user', v_body);

  for v_att in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    insert into public.bug_report_attachments (message_id, storage_path, content_type, size_bytes)
    values (
      p_message_id, v_att->>'path', v_att->>'contentType',
      nullif(v_att->>'sizeBytes', '')::bigint
    );
  end loop;

  return jsonb_build_object('ok', true, 'reportId', p_id);
end;
$$;

ALTER FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb, p_app_version text, p_platform text, p_context jsonb) OWNER TO supabase_admin;

CREATE FUNCTION public.report_messages(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_claimed_by uuid;
  v_out jsonb;
begin
  if v_actor is null then raise exception 'forbidden'; end if;
  select r.user_id, r.staff_user_id into v_owner, v_claimed_by
    from public.bug_reports r where r.id = p_report_id;
  if v_owner is null then raise exception 'report_not_found'; end if;

  if v_owner <> v_actor then
    if not public.is_staff() then raise exception 'forbidden'; end if;
    if v_claimed_by is not null and v_claimed_by <> v_actor and not public.is_admin() then
      raise exception 'report_claimed';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'messageId', m.id,
    'authorName', m.author_name,
    'authorAvatar', m.author_avatar,
    'authorRole', m.author_role,
    'body', m.body,
    'createdAt', m.created_at,
    'isMine', m.author_id = v_actor,
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', a.storage_path, 'contentType', a.content_type, 'sizeBytes', a.size_bytes
      ) order by a.created_at)
      from public.bug_report_attachments a where a.message_id = m.id
    ), '[]'::jsonb)
  ) order by m.created_at, m.id), '[]'::jsonb)
  into v_out
  from public.bug_report_messages m
  where m.report_id = p_report_id;

  return v_out;
end;
$$;

ALTER FUNCTION public.report_messages(p_report_id uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.report_my_list() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'reportId', r.id,
    'category', r.category,
    'status', r.status,
    'message', r.message,
    'context', r.context,
    'handledBy', r.handled_by,
    'openedAt', r.created_at,
    'lastMessageAt', r.last_message_at,
    'closedAt', r.closed_at,
    'messageCount', (select count(*) from public.bug_report_messages m where m.report_id = r.id)
  ) order by
    (r.status in ('resolved', 'rejected')),
    case when r.status in ('resolved', 'rejected') then r.closed_at else coalesce(r.last_message_at, r.created_at) end desc
  ), '[]'::jsonb)
  from public.bug_reports r
  where r.user_id = auth.uid();
$$;

ALTER FUNCTION public.report_my_list() OWNER TO supabase_admin;

CREATE FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_report record;
  v_profile record;
  v_staff boolean;
  v_att jsonb;
  v_last timestamptz;
  v_cd int := public.bug_report_message_cooldown_seconds();
begin
  if v_actor is null then raise exception 'forbidden'; end if;
  if length(v_body) = 0 and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'message_empty';
  end if;
  if length(v_body) > 4000 then raise exception 'message_trop_long'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 4 then raise exception 'too_many_attachments'; end if;

  select r.* into v_report from public.bug_reports r where r.id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_report.status not in ('open', 'handled') then raise exception 'report_closed'; end if;

  v_staff := public.is_staff();
  if v_report.user_id <> v_actor and not v_staff then raise exception 'forbidden'; end if;
  if v_staff and v_report.user_id <> v_actor then
    if v_report.staff_user_id is not null and v_report.staff_user_id <> v_actor and not public.is_admin() then
      raise exception 'report_claimed';
    end if;
  end if;

  -- Anti-spam : le membre attend quelques secondes entre deux messages.
  if not v_staff then
    select max(m.created_at) into v_last
      from public.bug_report_messages m where m.author_id = v_actor;
    if v_last is not null and v_last > now() - make_interval(secs => v_cd) then
      raise exception 'cooldown:%',
        greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => v_cd) - now())))::int);
    end if;
  end if;

  select p.username, coalesce(p.avatar_custom, p.avatar) as avatar, p.role
    into v_profile from public.profiles p where p.id = v_actor;
  if not found then raise exception 'profile_missing'; end if;

  insert into public.bug_report_messages (id, report_id, author_id, author_name, author_avatar, author_role, body)
  values (
    p_message_id, p_report_id, v_actor, coalesce(v_profile.username, 'Membre'), v_profile.avatar,
    case when v_profile.role in ('staff', 'admin') then v_profile.role else 'user' end,
    v_body
  );

  for v_att in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    insert into public.bug_report_attachments (message_id, storage_path, content_type, size_bytes)
    values (
      p_message_id, v_att->>'path', v_att->>'contentType',
      nullif(v_att->>'sizeBytes', '')::bigint
    );
  end loop;

  update public.bug_reports t
     set status = case when v_staff and t.user_id <> v_actor then 'handled' else t.status end,
         handled_by = case
                        when v_staff and t.user_id <> v_actor and t.staff_user_id is null
                          then coalesce(v_profile.username, t.handled_by)
                        else t.handled_by
                      end,
         staff_user_id = case
                            when v_staff and t.user_id <> v_actor and t.staff_user_id is null then v_actor
                            else t.staff_user_id
                          end,
         last_message_at = now()
   where t.id = p_report_id;

  return jsonb_build_object('ok', true, 'messageId', p_message_id);
end;
$$;

ALTER FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb) OWNER TO supabase_admin;

CREATE FUNCTION public.report_staff_claim(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_profile record;
  v_current record;
  v_report record;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;

  select r.* into v_current from public.bug_reports r where r.id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_current.status not in ('open', 'handled') then raise exception 'report_closed'; end if;
  if v_current.staff_user_id is not null and v_current.staff_user_id <> v_actor and not public.is_admin() then
    raise exception 'already_claimed';
  end if;

  select p.username into v_profile from public.profiles p where p.id = v_actor;

  update public.bug_reports r
     set staff_user_id = v_actor,
         handled_by = coalesce(v_profile.username, r.handled_by),
         status = case when r.status = 'open' then 'handled' else r.status end,
         last_message_at = now()
   where r.id = p_report_id
   returning r.* into v_report;

  insert into public.bug_report_messages (id, report_id, author_id, author_name, author_avatar, author_role, body)
  values (
    gen_random_uuid(), p_report_id, v_actor, coalesce(v_profile.username, 'Staff'), null, 'system',
    coalesce(v_profile.username, 'Un membre du staff') || ' a pris en charge ce signalement.'
  );

  return jsonb_build_object(
    'reportId', v_report.id, 'status', v_report.status,
    'handledBy', v_report.handled_by, 'staffUserId', v_report.staff_user_id
  );
end;
$$;

ALTER FUNCTION public.report_staff_claim(p_report_id uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.report_staff_dossier(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_report record;
  v_snapshot jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select r.* into v_report from public.bug_reports r where r.id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  if v_report.staff_user_id is not null and v_report.staff_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'report_claimed';
  end if;

  v_snapshot := public.support_dossier_for_user(v_report.user_id);

  -- L'e-mail n'est lisible que par un admin : un simple membre du staff ne le voit jamais.
  if public.is_admin() then
    v_snapshot := jsonb_set(
      v_snapshot, '{staff,email}', to_jsonb(public.support_user_email(v_report.user_id)), true
    );
  end if;

  return v_snapshot || jsonb_build_object(
    'ticketContext', jsonb_build_object('app', 'nartya', 'version', v_report.app_version, 'platform', v_report.platform),
    'report', jsonb_build_object(
      'reportId', v_report.id,
      'category', v_report.category,
      'status', v_report.status,
      'context', v_report.context,
      'openedAt', v_report.created_at
    )
  );
end;
$$;

ALTER FUNCTION public.report_staff_dossier(p_report_id uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.report_staff_list(p_scope text DEFAULT 'queue'::text, p_category text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_out jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_scope not in ('queue', 'history') then raise exception 'invalid_scope'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'reportId', r.id,
    'userId', r.user_id,
    'username', coalesce(p.username, 'Membre'),
    'avatar', coalesce(p.avatar_custom, p.avatar),
    'userRole', p.role,
    'category', r.category,
    'status', r.status,
    'message', r.message,
    'context', r.context,
    'appVersion', r.app_version,
    'platform', r.platform,
    'handledBy', r.handled_by,
    'staffUserId', r.staff_user_id,
    'openedAt', r.created_at,
    'lastMessageAt', r.last_message_at,
    'closedAt', r.closed_at,
    'messageCount', (select count(*) from public.bug_report_messages m where m.report_id = r.id)
  ) order by case when p_scope = 'history' then r.closed_at else coalesce(r.last_message_at, r.created_at) end desc), '[]'::jsonb)
  into v_out
  from public.bug_reports r
  join public.profiles p on p.id = r.user_id
  where
    (
      (p_scope = 'queue' and r.status in ('open', 'handled'))
      or (p_scope = 'history' and r.status in ('resolved', 'rejected'))
    )
    and (p_category = 'all' or r.category = p_category)
    and (
      public.is_admin()
      or r.staff_user_id is null
      or r.staff_user_id = auth.uid()
    );

  return v_out;
end;
$$;

ALTER FUNCTION public.report_staff_list(p_scope text, p_category text) OWNER TO supabase_admin;

CREATE FUNCTION public.report_staff_release(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_profile record;
  v_current record;
  v_report record;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;

  select r.* into v_current from public.bug_reports r where r.id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_current.staff_user_id is null then raise exception 'not_claimed'; end if;
  if v_current.staff_user_id <> v_actor and not public.is_admin() then raise exception 'forbidden'; end if;

  select p.username into v_profile from public.profiles p where p.id = v_actor;

  update public.bug_reports r
     set staff_user_id = null,
         handled_by = null,
         status = case when r.status = 'handled' then 'open' else r.status end,
         last_message_at = now()
   where r.id = p_report_id
   returning r.* into v_report;

  insert into public.bug_report_messages (id, report_id, author_id, author_name, author_avatar, author_role, body)
  values (
    gen_random_uuid(), p_report_id, v_actor, coalesce(v_profile.username, 'Staff'), null, 'system',
    coalesce(v_profile.username, 'Un membre du staff') || ' a relâché ce signalement.'
  );

  return jsonb_build_object(
    'reportId', v_report.id, 'status', v_report.status,
    'handledBy', v_report.handled_by, 'staffUserId', v_report.staff_user_id
  );
end;
$$;

ALTER FUNCTION public.report_staff_release(p_report_id uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_profile record;
  v_current record;
  v_report record;
  v_verb text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_status not in ('open', 'handled', 'resolved', 'rejected') then raise exception 'invalid_status'; end if;

  select r.* into v_current from public.bug_reports r where r.id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_current.staff_user_id is not null and v_current.staff_user_id <> v_actor and not public.is_admin() then
    raise exception 'report_claimed';
  end if;

  select p.username into v_profile from public.profiles p where p.id = v_actor;

  update public.bug_reports r
     set status = p_status,
         handled_by = case when p_status = 'open' then null else coalesce(v_current.handled_by, v_profile.username) end,
         staff_user_id = case
                            when p_status = 'open' then null
                            when v_current.staff_user_id is null then v_actor
                            else v_current.staff_user_id
                          end,
         processed_at = case when p_status in ('resolved', 'rejected') then now() else r.processed_at end,
         processed_by = case when p_status in ('resolved', 'rejected') then v_actor else r.processed_by end,
         closed_at = case when p_status in ('resolved', 'rejected') then coalesce(r.closed_at, now()) else null end,
         last_message_at = now()
   where r.id = p_report_id
   returning r.* into v_report;

  v_verb := case p_status
              when 'resolved' then 'a marqué ce signalement comme résolu.'
              when 'rejected' then 'a rejeté ce signalement.'
              when 'open' then 'a réouvert ce signalement.'
              else null
            end;

  if v_verb is not null then
    insert into public.bug_report_messages (id, report_id, author_id, author_name, author_avatar, author_role, body)
    values (
      gen_random_uuid(), p_report_id, v_actor, coalesce(v_profile.username, 'Staff'), null, 'system',
      coalesce(v_profile.username, 'Un membre du staff') || ' ' || v_verb
    );
  end if;

  return jsonb_build_object(
    'reportId', v_report.id, 'status', v_report.status,
    'handledBy', v_report.handled_by, 'staffUserId', v_report.staff_user_id, 'closedAt', v_report.closed_at
  );
end;
$$;

ALTER FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) OWNER TO supabase_admin;

CREATE FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_row public.friendships;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select * into v_row from public.friendships
   where requester_id = p_requester and addressee_id = v_me and status = 'pending';
  if not found then raise exception 'introuvable'; end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    return json_build_object('ok', true, 'status', 'accepted');
  else
    delete from public.friendships where id = v_row.id;
    return json_build_object('ok', true, 'status', 'refused');
  end if;
end; $$;

ALTER FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) OWNER TO postgres;

CREATE FUNCTION public.revoke_api_key(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.api_keys
  set revoked_at = now()
  where id = p_id and user_id = auth.uid() and revoked_at is null;
$$;

ALTER FUNCTION public.revoke_api_key(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.sanitize_announcement_buttons(p_buttons jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare
  b jsonb;
  out jsonb := '[]'::jsonb;
  lbl text;
  url text;
begin
  if p_buttons is null or jsonb_typeof(p_buttons) <> 'array' then return '[]'::jsonb; end if;
  for b in select * from jsonb_array_elements(p_buttons) loop
    lbl := nullif(btrim(b ->> 'label'), '');
    url := nullif(btrim(b ->> 'url'), '');
    if lbl is not null and url is not null and url ~* '^(https?://|nartya://)' then
      out := out || jsonb_build_array(jsonb_build_object('label', left(lbl, 40), 'url', left(url, 500)));
    end if;
    exit when jsonb_array_length(out) >= 2;
  end loop;
  return out;
end; $$;

ALTER FUNCTION public.sanitize_announcement_buttons(p_buttons jsonb) OWNER TO postgres;

CREATE FUNCTION public.search_users(p_query text, lim integer DEFAULT 12) RETURNS TABLE(id uuid, handle text, username text, avatar text, avatar_custom text, accent_color text, premium_tier text, premium_until timestamp with time zone, role text, ambient_theme text, relation text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with q as (select nullif(lower(trim(ltrim(coalesce(p_query, ''), '@'))), '') as term)
  select
    p.id, p.handle, p.username, p.avatar, p.avatar_custom,
    p.accent_color, p.premium_tier, p.premium_until, p.role, p.ambient_theme,
    case
      when f.status = 'accepted' then 'friends'
      when f.status = 'pending' and f.requester_id = auth.uid() then 'pending_out'
      when f.status = 'pending' then 'pending_in'
      else 'none'
    end as relation
  from public.profiles p
  cross join q
  left join public.friendships f
    on least(f.requester_id, f.addressee_id) = least(p.id, auth.uid())
   and greatest(f.requester_id, f.addressee_id) = greatest(p.id, auth.uid())
  where q.term is not null
    and p.id <> auth.uid()
    and p.is_public = true
    and coalesce(p.banned, false) = false
    and (lower(p.handle) like '%' || q.term || '%' or lower(p.username) like '%' || q.term || '%')
  order by (lower(p.handle) = q.term) desc, (lower(p.handle) like q.term || '%') desc, p.handle
  limit greatest(1, least(lim, 30));
$$;

ALTER FUNCTION public.search_users(p_query text, lim integer) OWNER TO postgres;

CREATE FUNCTION public.send_friend_request(p_handle text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_target_banned boolean;
  v_existing public.friendships;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  p_handle := lower(trim(coalesce(p_handle, '')));
  p_handle := ltrim(p_handle, '@');
  if p_handle = '' then raise exception 'introuvable'; end if;

  select id, banned into v_target, v_target_banned
    from public.profiles where lower(handle) = p_handle;
  if v_target is null then raise exception 'introuvable'; end if;
  if v_target = v_me then raise exception 'soi_meme'; end if;
  if v_target_banned then raise exception 'introuvable'; end if;

  -- Relation existante (dans un sens ou l'autre) ?
  select * into v_existing from public.friendships
   where least(requester_id, addressee_id) = least(v_me, v_target)
     and greatest(requester_id, addressee_id) = greatest(v_me, v_target);

  if found then
    if v_existing.status = 'accepted' then raise exception 'deja_amis'; end if;
    -- Demande déjà en attente : soit je l'ai déjà envoyée, soit l'autre me l'a envoyée
    -- (dans ce cas on accepte directement = auto-match).
    if v_existing.requester_id = v_me then
      raise exception 'demande_existante';
    else
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      return json_build_object('ok', true, 'status', 'accepted');
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, v_target, 'pending');
  return json_build_object('ok', true, 'status', 'pending');
end; $$;

ALTER FUNCTION public.send_friend_request(p_handle text) OWNER TO postgres;

CREATE FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.anime_lists
  set started_at = p_started_at,
      completed_at = p_completed_at,
      updated_at = now()
  where user_id = auth.uid() and anime_slug = p_slug;
end;
$$;

ALTER FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) OWNER TO postgres;

CREATE FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text DEFAULT NULL::text, p_cover text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_status not in ('watching', 'planned', 'completed', 'dropped') then
    raise exception 'Invalid status: %', p_status;
  end if;

  insert into public.anime_lists as al
    (user_id, anime_slug, status, anime_title, anime_cover, started_at, completed_at, updated_at)
  values (
    auth.uid(), p_slug, p_status, p_title, p_cover,
    case when p_status in ('watching', 'completed') then now() else null end,
    case when p_status = 'completed' then now() else null end,
    now()
  )
  on conflict (user_id, anime_slug) do update set
    status = excluded.status,
    anime_title = coalesce(excluded.anime_title, al.anime_title),
    anime_cover = coalesce(excluded.anime_cover, al.anime_cover),
    started_at = coalesce(
      al.started_at,
      case when excluded.status in ('watching', 'completed') then now() else null end
    ),
    completed_at = case
      when excluded.status = 'completed' then coalesce(al.completed_at, now())
      else null
    end,
    updated_at = now();
end;
$$;

ALTER FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text, p_cover text) OWNER TO postgres;

CREATE FUNCTION public.set_profile_image(p_kind text, p_path text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_me uuid := auth.uid();
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if v_path is not null and v_path !~ ('^' || v_me::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_path';
  end if;
  if p_kind = 'avatar' then
    update public.profiles set avatar_custom = v_path where id = v_me;
  elsif p_kind = 'banner' then
    update public.profiles set banner = v_path where id = v_me;
  elsif p_kind = 'background' then
    update public.profiles set page_background = v_path where id = v_me;
  else
    raise exception 'invalid_kind';
  end if;
end; $_$;

ALTER FUNCTION public.set_profile_image(p_kind text, p_path text) OWNER TO postgres;

CREATE FUNCTION public.set_social_prefs(p_friends_public boolean, p_presence_public boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  update public.profiles set
    friends_public = coalesce(p_friends_public, true),
    presence_public = coalesce(p_presence_public, true)
  where id = v_me;
end; $$;

ALTER FUNCTION public.set_social_prefs(p_friends_public boolean, p_presence_public boolean) OWNER TO postgres;

CREATE FUNCTION public.set_support_optin(p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  update public.profiles set support_optin = coalesce(p_enabled, true) where id = auth.uid();
end; $$;

ALTER FUNCTION public.set_support_optin(p_enabled boolean) OWNER TO supabase_admin;

CREATE FUNCTION public.set_username(p_username text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_me   uuid := auth.uid();
  -- Espaces multiples réduits + trim : « Kelyan   75 » → « Kelyan 75 ».
  v_name text := trim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
begin
  if v_me is null then raise exception 'forbidden'; end if;

  if v_name !~ '^[[:alnum:]_. -]{3,24}$' then raise exception 'username_invalide'; end if;

  -- Anti-usurpation : le rôle staff/admin est signalé par un badge, un pseudo affiché ne
  -- doit pas pouvoir le mimer. Même liste que le handle.
  if lower(v_name) in ('admin', 'staff', 'nartya', 'moderator', 'mod', 'support', 'null', 'undefined') then
    raise exception 'username_reserve';
  end if;

  update public.profiles set username = v_name where id = v_me;
end; $_$;

ALTER FUNCTION public.set_username(p_username text) OWNER TO postgres;

CREATE FUNCTION public.staff_audit_anime_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.staff_audit_write('anime_identity.unlock', 'anime', old.slug, old.slug || ' / ' || old.season_id,
      jsonb_build_object('anilistIds', old.anilist_ids));
  else
    perform public.staff_audit_write('anime_identity.lock', 'anime', new.slug, new.slug || ' / ' || new.season_id,
      jsonb_build_object('anilistIds', new.anilist_ids, 'tmdbId', new.tmdb_id, 'tmdbSeason', new.tmdb_season,
                         'offset', nullif(new.episode_offset, 0), 'note', new.evidence -> 'verrou' ->> 'note'));
  end if;
  return null;
exception when others then
  raise warning '[staff_audit] anime_identity : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_anime_identity() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_announcements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.announcements := case when tg_op = 'DELETE' then old else new end;
  v_action text;
begin
  v_action := case
    when tg_op = 'INSERT' then case when new.is_draft then 'announcement.draft' else 'announcement.publish' end
    when tg_op = 'DELETE' then 'announcement.delete'
    when old.is_draft and not new.is_draft then 'announcement.publish'
    else null end;
  if v_action is null then return null; end if;
  perform public.staff_audit_write(v_action, 'announcement', v_row.id::text,
    coalesce(nullif(v_row.title, ''), left(v_row.body, 120)),
    jsonb_build_object('type', v_row.type, 'targetUserId', v_row.target_user_id));
  return null;
exception when others then
  raise warning '[staff_audit] announcements : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_announcements() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_banned_machines() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row  public.banned_machines := case when tg_op = 'DELETE' then old else new end;
  v_user record;
begin
  select id, username into v_user from public.profiles where machine_id = v_row.machine_id limit 1;
  perform public.staff_audit_write(
    case when tg_op = 'DELETE' then 'machine.unban' else 'machine.ban' end,
    'user', v_user.id::text, coalesce(v_user.username, v_row.machine_id),
    case when tg_op = 'DELETE' then jsonb_build_object('machineId', v_row.machine_id)
         else jsonb_build_object('machineId', v_row.machine_id, 'reason', v_row.reason, 'until', v_row.banned_until) end);
  return null;
exception when others then
  raise warning '[staff_audit] banned_machines : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_banned_machines() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_blocked_words() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.staff_audit_write(
    case when tg_op = 'DELETE' then 'blocked_word.remove' else 'blocked_word.add' end,
    'blocked_word', null, case when tg_op = 'DELETE' then old.word else new.word end);
  return null;
exception when others then
  raise warning '[staff_audit] blocked_words : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_blocked_words() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_bug_reports() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user  text;
  v_label text;
begin
  if new.user_id = auth.uid() then return null; end if;
  select username into v_user from public.profiles where id = new.user_id;
  v_label := coalesce(v_user, '?') || ' — ' || left(coalesce(new.message, ''), 150);
  if new.staff_user_id is distinct from old.staff_user_id then
    perform public.staff_audit_write(
      case when new.staff_user_id is null then 'report.release' else 'report.claim' end,
      'report', new.id::text, v_label, jsonb_build_object('category', new.category));
  elsif new.status is distinct from old.status then
    perform public.staff_audit_write('report.status', 'report', new.id::text, v_label,
      jsonb_build_object('from', old.status, 'to', new.status, 'category', new.category));
  end if;
  return null;
exception when others then
  raise warning '[staff_audit] bug_reports : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_bug_reports() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_comment_reports() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_body text;
begin
  select left(body, 200) into v_body from public.comments where id = new.comment_id;
  perform public.staff_audit_write('comment_report.status', 'comment_report', new.id::text, v_body,
    jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.reason));
  return null;
exception when others then
  raise warning '[staff_audit] comment_reports : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_comment_reports() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_comments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_author text;
begin
  if old.user_id = auth.uid() then return null; end if;
  if old.parent_id is not null
     and not exists (select 1 from public.comments where id = old.parent_id) then
    return null;
  end if;
  select username into v_author from public.profiles where id = old.user_id;
  perform public.staff_audit_write('comment.delete', 'comment', old.id::text, left(old.body, 200),
    jsonb_build_object('authorId', old.user_id, 'authorName', v_author,
                       'on', old.target_kind || ':' || old.target_key,
                       'replies', nullif(old.replies_count, 0),
                       'isReply', old.parent_id is not null));
  return null;
exception when others then
  raise warning '[staff_audit] comments : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_comments() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_profiles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.banned is distinct from old.banned then
    if new.banned then
      perform public.staff_audit_write('user.ban', 'user', new.id::text, new.username,
        jsonb_build_object('reason', new.ban_reason, 'until', new.banned_until));
    else
      perform public.staff_audit_write('user.unban', 'user', new.id::text, new.username,
        jsonb_build_object('previousReason', old.ban_reason));
    end if;
  end if;

  if new.role is distinct from old.role then
    if new.id = auth.uid() then
      perform public.staff_audit_write('staff.auto_derank', 'user', new.id::text, new.username,
        jsonb_build_object('from', old.role, 'to', new.role), true);
    else
      perform public.staff_audit_write('user.role', 'user', new.id::text, new.username,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  end if;

  if new.premium_tier is distinct from old.premium_tier
     or new.premium_until is distinct from old.premium_until then
    perform public.staff_audit_write('user.premium', 'user', new.id::text, new.username,
      jsonb_build_object('fromTier', old.premium_tier, 'toTier', new.premium_tier,
                         'fromUntil', old.premium_until, 'toUntil', new.premium_until));
  end if;
  return null;
exception when others then
  raise warning '[staff_audit] profiles : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_profiles() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_scan_offsets() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.staff_audit_write('scan_offset.set', 'scan', null,
    case when tg_op = 'DELETE' then old.oeuvre else new.oeuvre end,
    jsonb_build_object(
      'from', case when tg_op = 'INSERT' then 0 else old.chapter_offset end,
      'to',   case when tg_op = 'DELETE' then 0 else new.chapter_offset end));
  return null;
exception when others then
  raise warning '[staff_audit] scan_offsets : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_scan_offsets() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_staff_announcements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_row public.staff_announcements := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.staff_audit_write(
    case when tg_op = 'DELETE' then 'staff_announcement.delete' else 'staff_announcement.create' end,
    'staff_announcement', v_row.id::text, coalesce(nullif(v_row.title, ''), left(v_row.body, 120)));
  return null;
exception when others then
  raise warning '[staff_audit] staff_announcements : %', sqlerrm;
  return null;
end;
$$;

ALTER FUNCTION public.staff_audit_staff_announcements() OWNER TO postgres;

CREATE FUNCTION public.staff_audit_write(p_action text, p_target_type text, p_target_id text, p_target_label text, p_details jsonb DEFAULT '{}'::jsonb, p_force boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
  v_name  text;
begin
  if v_actor is null then return; end if;
  select role, username into v_role, v_name from public.profiles where id = v_actor;
  if not p_force and coalesce(v_role, '') not in ('staff', 'admin', 'developer') then return; end if;
  insert into public.staff_audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, target_label, details)
  values (v_actor, v_name, v_role, p_action, p_target_type, p_target_id, left(p_target_label, 200),
          coalesce(jsonb_strip_nulls(p_details), '{}'::jsonb));
exception when others then
  raise warning '[staff_audit] % : %', p_action, sqlerrm;
end;
$$;

ALTER FUNCTION public.staff_audit_write(p_action text, p_target_type text, p_target_id text, p_target_label text, p_details jsonb, p_force boolean) OWNER TO postgres;

CREATE FUNCTION public.support_dossier_for_user(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_optin boolean;
  v_dossier jsonb;
begin
  if v_actor is null or (v_actor <> p_user and not public.is_staff()) then
    raise exception 'forbidden';
  end if;

  select p.support_code, p.support_optin
    into v_code, v_optin
    from public.profiles p
   where p.id = p_user
   for update;

  if v_code is null then raise exception 'support_code_missing'; end if;

  if not coalesce(v_optin, true) then
    update public.profiles set support_optin = true where id = p_user;
  end if;

  v_dossier := public.hub_support_dossier(v_code, 'staff');

  if not coalesce(v_optin, true) then
    update public.profiles set support_optin = false where id = p_user;
  end if;

  return v_dossier;
end;
$$;

ALTER FUNCTION public.support_dossier_for_user(p_user uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.support_user_email(p_user uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select u.email::text from auth.users u where u.id = p_user $$;

ALTER FUNCTION public.support_user_email(p_user uuid) OWNER TO supabase_admin;

CREATE FUNCTION public.sync_profile_watch_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles
       set episodes_watched_total = episodes_watched_total
             + (case when NEW.completed then 1 else 0 end),
           watch_seconds_total = watch_seconds_total + coalesce(NEW.position_seconds, 0)
     where id = NEW.user_id;
  elsif TG_OP = 'UPDATE' then
    update public.profiles
       set episodes_watched_total = episodes_watched_total
             + (case when NEW.completed then 1 else 0 end)
             - (case when OLD.completed then 1 else 0 end),
           watch_seconds_total = watch_seconds_total
             + coalesce(NEW.position_seconds, 0) - coalesce(OLD.position_seconds, 0)
     where id = NEW.user_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles
       set episodes_watched_total = greatest(0, episodes_watched_total
             - (case when OLD.completed then 1 else 0 end)),
           watch_seconds_total = greatest(0, watch_seconds_total - coalesce(OLD.position_seconds, 0))
     where id = OLD.user_id;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.sync_profile_watch_stats() OWNER TO postgres;

CREATE FUNCTION public.toggle_comment_like(p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_n  int;
begin
  perform public._comment_assert_can_write(v_me);
  if not exists (select 1 from public.comments where id = p_id and deleted_at is null) then
    raise exception 'introuvable';
  end if;

  if exists (select 1 from public.comment_likes where comment_id = p_id and user_id = v_me) then
    delete from public.comment_likes where comment_id = p_id and user_id = v_me;
    update public.comments set likes_count = greatest(0, likes_count - 1) where id = p_id;
    return false;
  end if;

  -- Plafond horaire : empêche le balayage automatisé qui liquiderait toute une page.
  select count(*) into v_n from public.comment_likes
   where user_id = v_me and created_at > now() - interval '1 hour';
  if v_n >= public.comment_like_hourly_cap() then raise exception 'quota_horaire'; end if;

  insert into public.comment_likes (comment_id, user_id) values (p_id, v_me)
  on conflict do nothing;
  update public.comments set likes_count = likes_count + 1 where id = p_id;
  return true;
end; $$;

ALTER FUNCTION public.toggle_comment_like(p_id uuid) OWNER TO postgres;

CREATE FUNCTION public.touch_app_presence(p_app text, p_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_machine_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_app text := lower(trim(coalesce(p_app, '')));
begin
  if v_me is null or v_app not in ('nartya-anime', 'nartya-hub') then return; end if;

  if v_app = 'nartya-hub' then
    perform public.touch_presence(null, null, null);
  else
    perform public.touch_presence(p_version, p_platform, p_machine_id);
  end if;

  insert into public.app_presence (user_id, app_id, app_version, platform, last_seen_at)
  values (v_me, v_app, left(p_version, 20), left(p_platform, 20), now())
  on conflict (user_id, app_id) do update
     set app_version = coalesce(excluded.app_version, public.app_presence.app_version),
         platform = coalesce(excluded.platform, public.app_presence.platform),
         last_seen_at = excluded.last_seen_at
   where public.app_presence.last_seen_at < now() - interval '100 seconds'
      or (excluded.app_version is not null
          and public.app_presence.app_version is distinct from excluded.app_version)
      or (excluded.platform is not null
          and public.app_presence.platform is distinct from excluded.platform);
end;
$$;

ALTER FUNCTION public.touch_app_presence(p_app text, p_version text, p_platform text, p_machine_id text) OWNER TO postgres;

CREATE FUNCTION public.touch_presence(p_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_machine_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then return; end if;

  -- Seuil temporel seulement : comparer aussi machine_id faisait écrire à chaque battement chez
  -- un utilisateur à plusieurs appareils. Une nouvelle version apparaît avec au pire 145 s de retard.
  update profiles
     set last_seen_at = now(),
         app_version  = coalesce(left(p_version, 20), app_version),
         platform     = coalesce(left(p_platform, 20), platform),
         machine_id   = coalesce(left(p_machine_id, 128), machine_id)
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '100 seconds');
end;
$$;

ALTER FUNCTION public.touch_presence(p_version text, p_platform text, p_machine_id text) OWNER TO postgres;

CREATE FUNCTION public.update_my_profile(p_handle text, p_bio text, p_accent text, p_is_public boolean, p_activity_public boolean, p_favorites_public boolean, p_emblem text DEFAULT NULL::text, p_ambient text DEFAULT NULL::text, p_ornament text DEFAULT '__keep__'::text, p_banner text DEFAULT '__keep__'::text, p_particles text DEFAULT '__keep__'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_me uuid := auth.uid(); v_handle text := lower(trim(coalesce(p_handle, '')));
  v_bio text := nullif(trim(coalesce(p_bio, '')), ''); v_accent text := lower(trim(coalesce(p_accent, 'vermillion')));
  v_emblem text := nullif(trim(coalesce(p_emblem, '')), ''); v_ambient text := nullif(lower(trim(coalesce(p_ambient, ''))), '');
  v_premium boolean := public.is_premium(v_me);
  v_tier text := (select case when p.premium_tier is not null and (p.premium_until is null or p.premium_until > now()) then p.premium_tier else null end from public.profiles p where p.id = v_me);
  v_cur record; v_ornament text; v_banner text; v_particles text;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if v_handle !~ '^[a-z0-9_]{3,20}$' then raise exception 'handle_invalide'; end if;
  if v_handle in ('admin','staff','me','settings','profile','nartya','moderator','mod','support','null','undefined') then raise exception 'handle_reserve'; end if;
  if exists (select 1 from public.profiles where lower(handle) = v_handle and id <> v_me) then raise exception 'handle_pris'; end if;
  if v_bio is not null and length(v_bio) > 300 then raise exception 'bio_trop_longue'; end if;
  if v_accent not in ('vermillion', 'sakura') and v_accent !~ '^#[0-9a-f]{6}$' then v_accent := 'vermillion'; end if;
  if v_emblem is not null and (not v_premium or char_length(v_emblem) <> 1) then v_emblem := null; end if;
  if v_ambient is not null and not public.cosmetic_ok('particles', v_ambient, case when v_premium then v_tier else null end) then v_ambient := null; end if;
  select cosmetic_ornament, cosmetic_banner, cosmetic_particles into v_cur from public.profiles where id = v_me;
  v_ornament := case when p_ornament = '__keep__' then v_cur.cosmetic_ornament when public.cosmetic_ok('ornament', nullif(lower(trim(p_ornament)), ''), v_tier) then nullif(lower(trim(p_ornament)), '') else null end;
  v_banner := case when p_banner = '__keep__' then v_cur.cosmetic_banner when public.cosmetic_ok('banner', nullif(lower(trim(p_banner)), ''), v_tier) then nullif(lower(trim(p_banner)), '') else null end;
  v_particles := case when p_particles = '__keep__' then v_cur.cosmetic_particles when public.cosmetic_ok('particles', nullif(lower(trim(p_particles)), ''), v_tier) then nullif(lower(trim(p_particles)), '') else null end;
  update public.profiles set handle = v_handle, bio = v_bio, accent_color = v_accent, profile_emblem = v_emblem, ambient_theme = v_ambient, cosmetic_ornament = v_ornament, cosmetic_banner = v_banner, cosmetic_particles = v_particles, is_public = coalesce(p_is_public, true), activity_public = coalesce(p_activity_public, true), favorites_public = coalesce(p_favorites_public, true) where id = v_me;
end; $_$;

ALTER FUNCTION public.update_my_profile(p_handle text, p_bio text, p_accent text, p_is_public boolean, p_activity_public boolean, p_favorites_public boolean, p_emblem text, p_ambient text, p_ornament text, p_banner text, p_particles text) OWNER TO postgres;

CREATE FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) RETURNS smallint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_slug text := trim(coalesce(p_slug, ''));
  v_rating smallint;
begin
  perform public._comment_assert_can_write(v_me);
  if length(v_slug) < 1 or length(v_slug) > 200 then raise exception 'cible_invalide'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'note_invalide'; end if;

  insert into public.anime_ratings (user_id, anime_slug, rating)
  values (v_me, v_slug, p_rating)
  on conflict (user_id, anime_slug) do update
    set rating = excluded.rating, updated_at = now()
  returning rating into v_rating;

  return v_rating;
end;
$$;

ALTER FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) OWNER TO supabase_admin;

CREATE FUNCTION public.user_real_episodes(p_user uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::bigint
  from public.watch_time
  where user_id = p_user and truly_watched;
$$;

ALTER FUNCTION public.user_real_episodes(p_user uuid) OWNER TO postgres;

CREATE FUNCTION public.user_trusted_watch_seconds(p_user uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(trusted_seconds), 0)::bigint
  from public.watch_time where user_id = p_user;
$$;

ALTER FUNCTION public.user_trusted_watch_seconds(p_user uuid) OWNER TO postgres;

CREATE FUNCTION public.watch_credit(p_episode_key text, p_duration double precision, p_tz_offset integer, p_season_total integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
                          -- Bornes réelles des fuseaux (UTC−12 … UTC+14) : au-delà, valeur
                          -- forgée ou horloge folle → on préfère « inconnu » à « faux ».
                          when p_tz_offset is null or p_tz_offset < -720 or p_tz_offset > 840 then null
                          else p_tz_offset::smallint
                        end;
  v_total   integer;
  v_flipped boolean := false;
  v_user_elapsed integer;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (auth.jwt() ->> 'is_anonymous')::boolean is true then raise exception 'guest_not_allowed'; end if;
  if public.is_banned() then raise exception 'account_banned'; end if;
  if v_key = '' then raise exception 'episode_invalide'; end if;

  -- Temps écoulé depuis le dernier battement de l'utilisateur, tous épisodes confondus.
  select floor(extract(epoch from (now() - last_beat_at)))::int into v_user_elapsed
  from public.watch_clock where user_id = v_me for update;

  insert into public.watch_clock (user_id, last_beat_at) values (v_me, now())
  on conflict (user_id) do update set last_beat_at = now();

  -- Crédit atomique : le serveur ne compte que le temps réel écoulé.
  insert into public.watch_time (user_id, episode_key, trusted_seconds, duration_seconds,
                                 tz_offset_minutes, last_beat_at, updated_at)
  values (v_me, v_key, 0, v_dur, v_tz, now(), now())
  on conflict (user_id, episode_key) do update
    set trusted_seconds = public.watch_time.trusted_seconds
          + greatest(0, least(beat_cap,
              floor(extract(epoch from (now() - public.watch_time.last_beat_at)))::int,
              coalesce(v_user_elapsed, beat_cap))),
        -- La durée ne doit pas osciller d'une source à l'autre (pubs, encodages) : on garde
        -- la plus longue vue. nullif(...,0) préserve « inconnue » tant qu'aucune n'est valide.
        duration_seconds = nullif(
          greatest(coalesce(public.watch_time.duration_seconds, 0), coalesce(v_dur, 0)), 0),
        tz_offset_minutes = coalesce(public.watch_time.tz_offset_minutes, v_tz),
        last_beat_at = now(),
        updated_at   = now()
  returning trusted_seconds into v_total;

  -- Bascule « réellement vu » : s'appuie sur la colonne générée `truly_watched`, seule définition
  -- de la règle. No-op une fois l'épisode estampillé.
  update public.watch_time set truly_watched_at = now()
  where user_id = v_me and episode_key = v_key
    and truly_watched and truly_watched_at is null;
  v_flipped := found;

  return jsonb_build_object(
    'total', v_total,
    'unlocked', to_jsonb(public.achievements_evaluate(
      v_me, v_flipped, v_key, v_tz, p_season_total))
  );
end; $$;

ALTER FUNCTION public.watch_credit(p_episode_key text, p_duration double precision, p_tz_offset integer, p_season_total integer) OWNER TO postgres;

CREATE FUNCTION public.watch_tick(p_episode_key text, p_slug text, p_season_id text, p_episode_number double precision, p_language text, p_position double precision, p_duration double precision, p_title text DEFAULT NULL::text, p_cover text DEFAULT NULL::text, p_tz_offset integer DEFAULT NULL::integer, p_season_total integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_me    uuid := auth.uid();
  v_pct   double precision;
  v_title text;
  v_res   jsonb;
begin
  if v_me is null then raise exception 'forbidden'; end if;

  -- 1) Temps de confiance + durée + succès, en une passe (crédit cadencé serveur, plafonné,
  --    anti-forge). Aucune règle dupliquée ici.
  v_res := public.watch_credit(p_episode_key, p_duration, p_tz_offset, p_season_total);

  -- 2) Progression de reprise. « Sans titre » (fiche pas encore chargée) n'est pas enregistré.
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
    v_me, p_episode_key, p_slug, v_title, p_cover, p_season_id,
    p_episode_number, p_language, p_position, p_duration, v_pct,
    v_pct >= 90, false, now()
  )
  on conflict (user_id, episode_key) do update
    set anime_slug        = excluded.anime_slug,
        -- Non destructif : un titre/cover absent de ce battement n'efface pas l'existant.
        anime_title       = coalesce(excluded.anime_title, public.episode_progress.anime_title),
        anime_cover       = coalesce(excluded.anime_cover, public.episode_progress.anime_cover),
        season_id         = excluded.season_id,
        episode_number    = excluded.episode_number,
        language          = excluded.language,
        position_seconds  = excluded.position_seconds,
        duration          = excluded.duration,
        progress_percent  = excluded.progress_percent,
        completed         = excluded.completed,
        hidden_from_resume = false,  -- re-regarder réaffiche l'anime dans « Reprendre »
        updated_at        = now();

  return v_res;
end; $$;

ALTER FUNCTION public.watch_tick(p_episode_key text, p_slug text, p_season_id text, p_episode_number double precision, p_language text, p_position double precision, p_duration double precision, p_title text, p_cover text, p_tz_offset integer, p_season_total integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.active_sessions (
    user_id uuid NOT NULL,
    machine_id text NOT NULL,
    platform text,
    app_version text,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.active_sessions OWNER TO postgres;

CREATE TABLE public.anime_catalog (
    slug text NOT NULL,
    title text,
    image text,
    anilist_id bigint,
    first_seen_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    episode_count integer,
    genres text[],
    type text,
    facets_updated_at timestamp with time zone,
    languages text[]
);

ALTER TABLE public.anime_catalog OWNER TO postgres;

COMMENT ON TABLE public.anime_catalog IS 'Catalogue agrégé. Alimenté par l''API en service_role. Lecture client révoquée en 0076 — le front consomme /animes via l''API.';

CREATE TABLE public.anime_identity (
    slug text NOT NULL,
    season_id text NOT NULL,
    anilist_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    tmdb_id bigint,
    tmdb_season integer,
    tvdb_id bigint,
    episode_offset integer DEFAULT 0 NOT NULL,
    confidence smallint DEFAULT 0 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'auto'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anime_identity_confidence_range CHECK (((confidence >= 0) AND (confidence <= 100))),
    CONSTRAINT anime_identity_source_valide CHECK ((source = ANY (ARRAY['auto'::text, 'locked'::text])))
);

ALTER TABLE public.anime_identity OWNER TO postgres;

COMMENT ON TABLE public.anime_identity IS 'Identite resolue d''une saison anime-sama (AniList/TMDB/TVDB) au grain (slug, season_id), avec preuves et niveau de confiance. Ecrite par l''API en service_role - cf. api/scripts/build-identity.mjs. source=''locked'' : tranchee a la main, jamais ecrasee par une passe automatique.';

CREATE TABLE public.anime_lists (
    user_id uuid NOT NULL,
    anime_slug text NOT NULL,
    status text NOT NULL,
    anime_title text,
    anime_cover text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    sort_order integer,
    CONSTRAINT anime_lists_status_check CHECK ((status = ANY (ARRAY['watching'::text, 'planned'::text, 'completed'::text, 'dropped'::text])))
);

ALTER TABLE public.anime_lists OWNER TO postgres;

CREATE TABLE public.anime_metadata (
    slug text NOT NULL,
    anilist_id bigint,
    is_airing boolean DEFAULT false NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.anime_metadata OWNER TO postgres;

COMMENT ON TABLE public.anime_metadata IS 'Métadonnées agrégées par œuvre (AniList/AniZip/TMDB + scrape anime-sama), persistées par l''API en service_role — cf. src/anime-metadata.js. Pas de lecture PostgREST directe : le front consomme /anime/:slug/page.';

CREATE TABLE public.anime_progress (
    user_id uuid NOT NULL,
    anime_slug text NOT NULL,
    last_episode_number integer,
    completed_episodes integer DEFAULT 0,
    last_watched_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.anime_progress OWNER TO postgres;

CREATE TABLE public.anime_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anime_slug text NOT NULL,
    rating smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anime_ratings_anime_slug_check CHECK (((length(anime_slug) >= 1) AND (length(anime_slug) <= 200))),
    CONSTRAINT anime_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE public.anime_ratings OWNER TO supabase_admin;

CREATE TABLE public.anime_seasons (
    slug text NOT NULL,
    season_id text NOT NULL,
    name text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.anime_seasons OWNER TO postgres;

CREATE TABLE public.announcement_dismissals (
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.announcement_dismissals OWNER TO postgres;

CREATE TABLE public.announcement_reads (
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.announcement_reads OWNER TO postgres;

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    title text,
    body text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    buttons jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_draft boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT announcements_type_check CHECK ((type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text])))
);

ALTER TABLE public.announcements OWNER TO postgres;

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT api_keys_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40)))
);

ALTER TABLE public.api_keys OWNER TO postgres;

CREATE TABLE public.api_usage (
    user_id uuid NOT NULL,
    day date NOT NULL,
    via text NOT NULL,
    requests integer DEFAULT 0 NOT NULL,
    streams integer DEFAULT 0 NOT NULL,
    CONSTRAINT api_usage_via_check CHECK ((via = ANY (ARRAY['session'::text, 'key'::text])))
);

ALTER TABLE public.api_usage OWNER TO postgres;

CREATE TABLE public.app_presence (
    user_id uuid NOT NULL,
    app_id text NOT NULL,
    app_version text,
    platform text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_presence_app_id_check CHECK ((app_id = ANY (ARRAY['nartya-anime'::text, 'nartya-hub'::text])))
);

ALTER TABLE public.app_presence OWNER TO postgres;

CREATE TABLE public.banned_machines (
    machine_id text NOT NULL,
    reason text,
    banned_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

ALTER TABLE public.banned_machines OWNER TO postgres;

CREATE TABLE public.bug_report_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    storage_path text NOT NULL,
    content_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.bug_report_attachments OWNER TO supabase_admin;

CREATE TABLE public.bug_report_messages (
    id uuid NOT NULL,
    report_id uuid NOT NULL,
    author_id uuid NOT NULL,
    author_name text NOT NULL,
    author_avatar text,
    author_role text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bug_report_messages_author_role_check CHECK ((author_role = ANY (ARRAY['user'::text, 'staff'::text, 'admin'::text, 'system'::text])))
);

ALTER TABLE public.bug_report_messages OWNER TO supabase_admin;

CREATE TABLE public.bug_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    attachment_path text,
    app_version text,
    platform text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid,
    category text DEFAULT 'other'::text NOT NULL,
    context jsonb,
    staff_user_id uuid,
    handled_by text,
    last_message_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT bug_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'handled'::text, 'resolved'::text, 'rejected'::text])))
);

ALTER TABLE public.bug_reports OWNER TO postgres;

CREATE TABLE public.campaign_claims (
    campaign_id text NOT NULL,
    user_id uuid NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_tier text NOT NULL,
    granted_until timestamp with time zone NOT NULL
);

ALTER TABLE public.campaign_claims OWNER TO postgres;

CREATE TABLE public.campaigns (
    id text NOT NULL,
    tier text NOT NULL,
    duration_days integer NOT NULL,
    opens_at timestamp with time zone DEFAULT now() NOT NULL,
    closes_at timestamp with time zone NOT NULL,
    eligible_before timestamp with time zone,
    title text,
    message text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaigns_check CHECK ((closes_at > opens_at)),
    CONSTRAINT campaigns_duration_days_check CHECK ((duration_days > 0)),
    CONSTRAINT campaigns_tier_check CHECK ((tier = ANY (ARRAY['plus'::text, 'ultimate'::text])))
);

ALTER TABLE public.campaigns OWNER TO postgres;

CREATE TABLE public.client_logs (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    app text NOT NULL,
    level text DEFAULT 'error'::text NOT NULL,
    event text NOT NULL,
    message text,
    detail jsonb,
    app_version text,
    platform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.client_logs OWNER TO supabase_admin;

CREATE SEQUENCE public.client_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.client_logs_id_seq OWNER TO supabase_admin;

ALTER SEQUENCE public.client_logs_id_seq OWNED BY public.client_logs.id;

CREATE TABLE public.comment_blocked_words (
    word text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_blocked_words_word_check CHECK (((length(word) >= 2) AND (length(word) <= 40)))
);

ALTER TABLE public.comment_blocked_words OWNER TO postgres;

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.comment_likes OWNER TO postgres;

CREATE TABLE public.comment_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_reports_reason_check CHECK (((length(reason) >= 1) AND (length(reason) <= 300))),
    CONSTRAINT comment_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'rejected'::text])))
);

ALTER TABLE public.comment_reports OWNER TO postgres;

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_kind text NOT NULL,
    target_key text NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    body text NOT NULL,
    is_spoiler boolean DEFAULT false NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    replies_count integer DEFAULT 0 NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_body_check CHECK (((length(body) <= 1500) AND ((deleted_at IS NOT NULL) OR (length(body) >= 2)))),
    CONSTRAINT comments_target_key_check CHECK (((length(target_key) >= 1) AND (length(target_key) <= 200))),
    CONSTRAINT comments_target_kind_check CHECK ((target_kind = 'anime'::text))
);

ALTER TABLE public.comments OWNER TO postgres;

CREATE TABLE public.credit_shop_items (
    id text NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    description text,
    price integer NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT credit_shop_items_category_check CHECK ((category = ANY (ARRAY['avatar_frame'::text, 'comment_flair'::text, 'name_color'::text]))),
    CONSTRAINT credit_shop_items_price_check CHECK ((price > 0))
);

ALTER TABLE public.credit_shop_items OWNER TO postgres;

CREATE TABLE public.episode_progress (
    user_id uuid NOT NULL,
    episode_key text NOT NULL,
    anime_slug text NOT NULL,
    anime_title text,
    anime_cover text,
    season_id text,
    episode_number integer,
    language text,
    position_seconds double precision DEFAULT 0,
    duration double precision DEFAULT 0,
    progress_percent double precision DEFAULT 0,
    completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden_from_resume boolean DEFAULT false NOT NULL,
    CONSTRAINT episode_progress_bounds CHECK ((((position_seconds >= (0)::double precision) AND (position_seconds <= (43200)::double precision)) AND ((duration >= (0)::double precision) AND (duration <= (43200)::double precision)) AND ((progress_percent >= (0)::double precision) AND (progress_percent <= (100)::double precision)))),
    CONSTRAINT episode_progress_text_sizes CHECK (((length(episode_key) <= 300) AND (length(anime_slug) <= 200) AND (length(anime_title) <= 400) AND (length(anime_cover) <= 1000) AND (length(season_id) <= 100) AND (length(language) <= 20)))
);

ALTER TABLE public.episode_progress OWNER TO postgres;

CREATE TABLE public.episode_sources (
    slug text NOT NULL,
    season_id text NOT NULL,
    lang text NOT NULL,
    sources jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.episode_sources OWNER TO postgres;

COMMENT ON TABLE public.episode_sources IS 'Liens de lecture par épisode. Écrit et lu UNIQUEMENT par l''API en service_role (api/src/episodes-sync.js). Lecture client révoquée en 0076 : passer par l''API, pas par PostgREST.';

CREATE TABLE public.episode_thumbs (
    slug text NOT NULL,
    season_id text NOT NULL,
    episode_number integer NOT NULL,
    still_url text,
    anilist_id integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.episode_thumbs OWNER TO postgres;

CREATE TABLE public.favorites (
    user_id uuid NOT NULL,
    anime_slug text NOT NULL,
    anime_title text,
    anime_cover text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    pinned_at timestamp with time zone,
    genre text,
    sort_order integer
);

ALTER TABLE public.favorites OWNER TO postgres;

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT friendships_check CHECK ((requester_id <> addressee_id)),
    CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);

ALTER TABLE public.friendships OWNER TO postgres;

CREATE TABLE public.leaderboard_rank_records (
    user_id uuid NOT NULL,
    current_rank integer,
    best_rank integer NOT NULL,
    best_rank_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.leaderboard_rank_records OWNER TO postgres;

CREATE TABLE public.leaderboard_totals (
    user_id uuid NOT NULL,
    period text NOT NULL,
    secs double precision DEFAULT 0 NOT NULL,
    eps bigint DEFAULT 0 NOT NULL,
    animes bigint DEFAULT 0 NOT NULL,
    CONSTRAINT leaderboard_totals_period_check CHECK ((period = ANY (ARRAY['all'::text, 'week'::text])))
);

ALTER TABLE public.leaderboard_totals OWNER TO postgres;

CREATE TABLE public.manga_catalog (
    slug text NOT NULL,
    title text NOT NULL,
    image text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    genres text[],
    facets_updated_at timestamp with time zone
);

ALTER TABLE public.manga_catalog OWNER TO postgres;

CREATE TABLE public.manga_slug_resolutions (
    slug text NOT NULL,
    anilist_id bigint NOT NULL,
    source text DEFAULT 'title-search'::text NOT NULL,
    confidence integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.manga_slug_resolutions OWNER TO postgres;

CREATE TABLE public.party_rooms (
    code text NOT NULL,
    host_client_id text NOT NULL,
    current jsonb,
    queue jsonb DEFAULT '[]'::jsonb NOT NULL,
    playback jsonb DEFAULT '{"isPlaying": false, "currentTime": 0}'::jsonb NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.party_rooms OWNER TO postgres;

CREATE TABLE public.profile_views (
    profile_id uuid NOT NULL,
    viewer_key text NOT NULL,
    viewed_on date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profile_views OWNER TO postgres;

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    discord_id text,
    username text,
    avatar text,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login timestamp with time zone,
    banned boolean DEFAULT false NOT NULL,
    app_version text,
    platform text,
    last_seen_at timestamp with time zone,
    ban_reason text,
    banned_until timestamp with time zone,
    banned_at timestamp with time zone,
    banned_by uuid,
    machine_id text,
    handle text,
    bio text,
    banner text,
    avatar_custom text,
    accent_color text DEFAULT 'vermillion'::text NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    activity_public boolean DEFAULT true NOT NULL,
    favorites_public boolean DEFAULT true NOT NULL,
    premium_tier text,
    premium_until timestamp with time zone,
    profile_emblem text,
    ambient_theme text,
    friends_public boolean DEFAULT true NOT NULL,
    presence_public boolean DEFAULT true NOT NULL,
    views_count integer DEFAULT 0 NOT NULL,
    episodes_watched_total integer DEFAULT 0 NOT NULL,
    watch_seconds_total double precision DEFAULT 0 NOT NULL,
    support_code text,
    support_optin boolean DEFAULT true NOT NULL,
    support_code_rotated_at timestamp with time zone,
    credits integer DEFAULT 0 NOT NULL,
    credits_migrated_at timestamp with time zone,
    owned_avatar_frames text[] DEFAULT '{}'::text[] NOT NULL,
    equipped_avatar_frame text,
    owned_comment_flairs text[] DEFAULT '{}'::text[] NOT NULL,
    equipped_comment_flair text,
    owned_name_colors text[] DEFAULT '{}'::text[] NOT NULL,
    equipped_name_color text,
    page_background text,
    cosmetic_ornament text,
    cosmetic_banner text,
    cosmetic_particles text,
    CONSTRAINT profiles_premium_tier_check CHECK (((premium_tier IS NULL) OR (premium_tier = ANY (ARRAY['plus'::text, 'ultimate'::text])))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'staff'::text, 'admin'::text, 'developer'::text])))
);

ALTER TABLE public.profiles OWNER TO postgres;

CREATE TABLE public.scan_offsets (
    oeuvre text NOT NULL,
    chapter_offset integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

ALTER TABLE public.scan_offsets OWNER TO postgres;

CREATE TABLE public.scan_progress (
    user_id uuid NOT NULL,
    scan_key text NOT NULL,
    anime_slug text NOT NULL,
    anime_title text,
    anime_cover text,
    oeuvre text NOT NULL,
    oeuvre_label text,
    chapter integer DEFAULT 1 NOT NULL,
    page integer DEFAULT 0 NOT NULL,
    total_pages integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden_from_resume boolean DEFAULT false NOT NULL
);

ALTER TABLE public.scan_progress OWNER TO postgres;

CREATE TABLE public.slug_resolutions (
    anilist_id bigint NOT NULL,
    slug text NOT NULL,
    source text DEFAULT 'search'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slug_resolutions_source_check CHECK ((source = ANY (ARRAY['search'::text, 'manual'::text])))
);

ALTER TABLE public.slug_resolutions OWNER TO postgres;

CREATE TABLE public.staff_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    title text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.staff_announcements OWNER TO postgres;

CREATE TABLE public.staff_audit_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_name text,
    actor_role text,
    action text NOT NULL,
    target_type text,
    target_id text,
    target_label text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.staff_audit_log OWNER TO postgres;

ALTER TABLE public.staff_audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.staff_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.staff_ban_events (
    id bigint NOT NULL,
    actor_id uuid NOT NULL,
    target_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.staff_ban_events OWNER TO postgres;

ALTER TABLE public.staff_ban_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.staff_ban_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.stats_snapshot (
    key text NOT NULL,
    payload jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.stats_snapshot OWNER TO postgres;

CREATE TABLE public.user_achievement_stats (
    user_id uuid NOT NULL,
    night_episodes integer DEFAULT 0 NOT NULL,
    day_key date,
    day_episodes integer DEFAULT 0 NOT NULL,
    best_day_episodes integer DEFAULT 0 NOT NULL,
    completed_seasons integer DEFAULT 0 NOT NULL,
    night_owl_tier smallint DEFAULT 0 NOT NULL,
    marathon_tier smallint DEFAULT 0 NOT NULL,
    watch_time_tier smallint DEFAULT 0 NOT NULL,
    completion_tier smallint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_achievement_stats OWNER TO postgres;

CREATE TABLE public.user_achievements (
    user_id uuid NOT NULL,
    achievement_id text NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_achievements OWNER TO postgres;

CREATE TABLE public.user_season_progress (
    user_id uuid NOT NULL,
    anime_slug text NOT NULL,
    season_id text NOT NULL,
    total_units integer NOT NULL,
    completed_at timestamp with time zone
);

ALTER TABLE public.user_season_progress OWNER TO postgres;

CREATE TABLE public.watch_clock (
    user_id uuid NOT NULL,
    last_beat_at timestamp with time zone NOT NULL
);

ALTER TABLE public.watch_clock OWNER TO postgres;

CREATE TABLE public.watch_time (
    user_id uuid NOT NULL,
    episode_key text NOT NULL,
    trusted_seconds integer DEFAULT 0 NOT NULL,
    last_beat_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_seconds integer,
    truly_watched boolean GENERATED ALWAYS AS (((duration_seconds IS NOT NULL) AND (duration_seconds > 0) AND ((trusted_seconds * 10) >= (duration_seconds * 6)))) STORED,
    truly_watched_at timestamp with time zone,
    tz_offset_minutes smallint
);

ALTER TABLE public.watch_time OWNER TO postgres;

ALTER TABLE ONLY public.client_logs ALTER COLUMN id SET DEFAULT nextval('public.client_logs_id_seq'::regclass);

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_pkey PRIMARY KEY (user_id, machine_id);

ALTER TABLE ONLY public.anime_catalog
    ADD CONSTRAINT anime_catalog_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.anime_identity
    ADD CONSTRAINT anime_identity_pkey PRIMARY KEY (slug, season_id);

ALTER TABLE ONLY public.anime_lists
    ADD CONSTRAINT anime_lists_pkey PRIMARY KEY (user_id, anime_slug);

ALTER TABLE ONLY public.anime_metadata
    ADD CONSTRAINT anime_metadata_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.anime_progress
    ADD CONSTRAINT anime_progress_pkey PRIMARY KEY (user_id, anime_slug);

ALTER TABLE ONLY public.anime_ratings
    ADD CONSTRAINT anime_ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.anime_ratings
    ADD CONSTRAINT anime_ratings_user_id_anime_slug_key UNIQUE (user_id, anime_slug);

ALTER TABLE ONLY public.anime_seasons
    ADD CONSTRAINT anime_seasons_pkey PRIMARY KEY (slug, season_id);

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (announcement_id, user_id);

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (announcement_id, user_id);

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_usage
    ADD CONSTRAINT api_usage_pkey PRIMARY KEY (user_id, day, via);

ALTER TABLE ONLY public.app_presence
    ADD CONSTRAINT app_presence_pkey PRIMARY KEY (user_id, app_id);

ALTER TABLE ONLY public.banned_machines
    ADD CONSTRAINT banned_machines_pkey PRIMARY KEY (machine_id);

ALTER TABLE ONLY public.bug_report_attachments
    ADD CONSTRAINT bug_report_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bug_report_messages
    ADD CONSTRAINT bug_report_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_claims
    ADD CONSTRAINT campaign_claims_pkey PRIMARY KEY (campaign_id, user_id);

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_logs
    ADD CONSTRAINT client_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comment_blocked_words
    ADD CONSTRAINT comment_blocked_words_pkey PRIMARY KEY (word);

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_comment_id_reporter_id_key UNIQUE (comment_id, reporter_id);

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.credit_shop_items
    ADD CONSTRAINT credit_shop_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.episode_progress
    ADD CONSTRAINT episode_progress_pkey PRIMARY KEY (user_id, episode_key);

ALTER TABLE ONLY public.episode_sources
    ADD CONSTRAINT episode_sources_pkey PRIMARY KEY (slug, season_id, lang);

ALTER TABLE ONLY public.episode_thumbs
    ADD CONSTRAINT episode_thumbs_pkey PRIMARY KEY (slug, season_id, episode_number);

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (user_id, anime_slug);

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id);

ALTER TABLE ONLY public.leaderboard_rank_records
    ADD CONSTRAINT leaderboard_rank_records_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.leaderboard_totals
    ADD CONSTRAINT leaderboard_totals_pkey PRIMARY KEY (user_id, period);

ALTER TABLE ONLY public.manga_catalog
    ADD CONSTRAINT manga_catalog_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.manga_slug_resolutions
    ADD CONSTRAINT manga_slug_resolutions_anilist_id_key UNIQUE (anilist_id);

ALTER TABLE ONLY public.manga_slug_resolutions
    ADD CONSTRAINT manga_slug_resolutions_pkey PRIMARY KEY (slug);

ALTER TABLE ONLY public.party_rooms
    ADD CONSTRAINT party_rooms_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_pkey PRIMARY KEY (profile_id, viewer_key, viewed_on);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_support_code_key UNIQUE (support_code);

ALTER TABLE ONLY public.scan_offsets
    ADD CONSTRAINT scan_offsets_pkey PRIMARY KEY (oeuvre);

ALTER TABLE ONLY public.scan_progress
    ADD CONSTRAINT scan_progress_pkey PRIMARY KEY (user_id, scan_key);

ALTER TABLE ONLY public.slug_resolutions
    ADD CONSTRAINT slug_resolutions_pkey PRIMARY KEY (anilist_id);

ALTER TABLE ONLY public.staff_announcements
    ADD CONSTRAINT staff_announcements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_audit_log
    ADD CONSTRAINT staff_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_ban_events
    ADD CONSTRAINT staff_ban_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stats_snapshot
    ADD CONSTRAINT stats_snapshot_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.user_achievement_stats
    ADD CONSTRAINT user_achievement_stats_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id);

ALTER TABLE ONLY public.user_season_progress
    ADD CONSTRAINT user_season_progress_pkey PRIMARY KEY (user_id, anime_slug, season_id);

ALTER TABLE ONLY public.watch_clock
    ADD CONSTRAINT watch_clock_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.watch_time
    ADD CONSTRAINT watch_time_pkey PRIMARY KEY (user_id, episode_key);

CREATE INDEX api_keys_user_idx ON public.api_keys USING btree (user_id) WHERE (revoked_at IS NULL);

CREATE INDEX api_usage_day_idx ON public.api_usage USING btree (day);

CREATE INDEX app_presence_last_seen_idx ON public.app_presence USING btree (last_seen_at DESC);

CREATE UNIQUE INDEX friendships_pair_key ON public.friendships USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE INDEX idx_anime_catalog_episode_count ON public.anime_catalog USING btree (episode_count);

CREATE INDEX idx_anime_catalog_first_seen ON public.anime_catalog USING btree (first_seen_at DESC NULLS LAST);

CREATE INDEX idx_anime_catalog_genres ON public.anime_catalog USING gin (genres);

CREATE INDEX idx_anime_catalog_languages ON public.anime_catalog USING gin (languages);

CREATE INDEX idx_anime_catalog_type ON public.anime_catalog USING btree (type);

CREATE INDEX idx_anime_identity_anilist_ids ON public.anime_identity USING gin (anilist_ids);

CREATE INDEX idx_anime_identity_confidence ON public.anime_identity USING btree (confidence);

CREATE INDEX idx_anime_lists_user_status ON public.anime_lists USING btree (user_id, status, updated_at DESC);

CREATE INDEX idx_anime_metadata_updated_at ON public.anime_metadata USING btree (updated_at);

CREATE INDEX idx_anime_ratings_slug_user ON public.anime_ratings USING btree (anime_slug, user_id) INCLUDE (rating);

CREATE INDEX idx_anime_seasons_slug ON public.anime_seasons USING btree (slug);

CREATE INDEX idx_announcements_created ON public.announcements USING btree (created_at DESC);

CREATE INDEX idx_announcements_target ON public.announcements USING btree (target_user_id);

CREATE INDEX idx_bug_report_attachments_message ON public.bug_report_attachments USING btree (message_id);

CREATE INDEX idx_bug_report_messages_author_created ON public.bug_report_messages USING btree (author_id, created_at DESC);

CREATE INDEX idx_bug_report_messages_report_created ON public.bug_report_messages USING btree (report_id, created_at, id);

CREATE INDEX idx_bug_reports_last_message ON public.bug_reports USING btree (last_message_at DESC NULLS LAST) WHERE (status = ANY (ARRAY['open'::text, 'handled'::text]));

CREATE INDEX idx_bug_reports_staff_user ON public.bug_reports USING btree (staff_user_id) WHERE (staff_user_id IS NOT NULL);

CREATE INDEX idx_bug_reports_status ON public.bug_reports USING btree (status, created_at DESC);

CREATE INDEX idx_bug_reports_user ON public.bug_reports USING btree (user_id, created_at DESC);

CREATE INDEX idx_client_logs_user_created ON public.client_logs USING btree (user_id, created_at DESC);

CREATE INDEX idx_comment_likes_user ON public.comment_likes USING btree (user_id, created_at DESC);

CREATE INDEX idx_comment_reports_reporter_recent ON public.comment_reports USING btree (reporter_id, created_at DESC);

CREATE INDEX idx_comment_reports_status ON public.comment_reports USING btree (status, created_at DESC);

CREATE INDEX idx_comments_replies ON public.comments USING btree (parent_id, created_at, id) WHERE (parent_id IS NOT NULL);

CREATE INDEX idx_comments_thread ON public.comments USING btree (target_kind, target_key, created_at DESC, id DESC) WHERE ((parent_id IS NULL) AND (deleted_at IS NULL));

CREATE INDEX idx_comments_thread_tombstone ON public.comments USING btree (target_kind, target_key, created_at DESC, id DESC) WHERE ((parent_id IS NULL) AND (deleted_at IS NOT NULL));

CREATE INDEX idx_comments_user_created ON public.comments USING btree (user_id, created_at DESC);

CREATE INDEX idx_episode_progress_updated_at ON public.episode_progress USING btree (updated_at);

CREATE INDEX idx_episode_progress_user_anime ON public.episode_progress USING btree (user_id, anime_slug);

CREATE INDEX idx_episode_progress_user_updated ON public.episode_progress USING btree (user_id, updated_at DESC);

CREATE INDEX idx_episode_sources_slug_season ON public.episode_sources USING btree (slug, season_id);

CREATE INDEX idx_favorites_user_pinned ON public.favorites USING btree (user_id, pinned_at DESC) WHERE (pinned_at IS NOT NULL);

CREATE INDEX idx_friendships_addressee ON public.friendships USING btree (addressee_id, status);

CREATE INDEX idx_friendships_requester ON public.friendships USING btree (requester_id, status);

CREATE INDEX idx_manga_catalog_genres ON public.manga_catalog USING gin (genres);

CREATE INDEX idx_profile_views_created ON public.profile_views USING btree (created_at);

CREATE INDEX idx_profile_views_key_time ON public.profile_views USING btree (viewer_key, created_at DESC);

CREATE INDEX idx_scan_progress_user_anime ON public.scan_progress USING btree (user_id, anime_slug);

CREATE INDEX idx_scan_progress_user_updated ON public.scan_progress USING btree (user_id, updated_at DESC);

CREATE INDEX idx_watch_time_updated_at ON public.watch_time USING btree (updated_at);

CREATE UNIQUE INDEX profiles_handle_key ON public.profiles USING btree (lower(handle));

CREATE INDEX staff_audit_log_action_idx ON public.staff_audit_log USING btree (action, created_at DESC);

CREATE INDEX staff_audit_log_actor_idx ON public.staff_audit_log USING btree (actor_id, created_at DESC);

CREATE INDEX staff_audit_log_created_idx ON public.staff_audit_log USING btree (created_at DESC);

CREATE INDEX staff_audit_log_target_idx ON public.staff_audit_log USING btree (target_type, target_id);

CREATE INDEX staff_ban_events_actor_time ON public.staff_ban_events USING btree (actor_id, created_at DESC);

CREATE INDEX watch_time_real_episodes ON public.watch_time USING btree (user_id) WHERE truly_watched;

CREATE TRIGGER staff_audit_anime_identity AFTER INSERT OR DELETE OR UPDATE ON public.anime_identity FOR EACH ROW EXECUTE FUNCTION public.staff_audit_anime_identity();

CREATE TRIGGER staff_audit_announcements AFTER INSERT OR DELETE OR UPDATE OF is_draft ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.staff_audit_announcements();

CREATE TRIGGER staff_audit_banned_machines AFTER INSERT OR DELETE OR UPDATE ON public.banned_machines FOR EACH ROW EXECUTE FUNCTION public.staff_audit_banned_machines();

CREATE TRIGGER staff_audit_blocked_words AFTER INSERT OR DELETE ON public.comment_blocked_words FOR EACH ROW EXECUTE FUNCTION public.staff_audit_blocked_words();

CREATE TRIGGER staff_audit_bug_reports AFTER UPDATE OF status, staff_user_id ON public.bug_reports FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.staff_user_id IS DISTINCT FROM new.staff_user_id))) EXECUTE FUNCTION public.staff_audit_bug_reports();

CREATE TRIGGER staff_audit_comment_reports AFTER UPDATE OF status ON public.comment_reports FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.staff_audit_comment_reports();

CREATE TRIGGER staff_audit_comments AFTER DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.staff_audit_comments();

CREATE TRIGGER staff_audit_profiles AFTER UPDATE OF banned, role, premium_tier, premium_until ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.staff_audit_profiles();

CREATE TRIGGER staff_audit_scan_offsets AFTER INSERT OR DELETE OR UPDATE ON public.scan_offsets FOR EACH ROW EXECUTE FUNCTION public.staff_audit_scan_offsets();

CREATE TRIGGER staff_audit_staff_announcements AFTER INSERT OR DELETE ON public.staff_announcements FOR EACH ROW EXECUTE FUNCTION public.staff_audit_staff_announcements();

CREATE TRIGGER trg_clamp_updated_at BEFORE INSERT OR UPDATE ON public.anime_lists FOR EACH ROW EXECUTE FUNCTION public.clamp_updated_at();

CREATE TRIGGER trg_clamp_updated_at BEFORE INSERT OR UPDATE ON public.episode_progress FOR EACH ROW EXECUTE FUNCTION public.clamp_updated_at();

CREATE TRIGGER trg_clamp_updated_at BEFORE INSERT OR UPDATE ON public.scan_progress FOR EACH ROW EXECUTE FUNCTION public.clamp_updated_at();

CREATE TRIGGER trg_enforce_pin_limit BEFORE UPDATE ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.enforce_pin_limit();

CREATE TRIGGER trg_profiles_set_support_code BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_set_support_code();

CREATE TRIGGER trg_sync_profile_watch_stats AFTER INSERT OR DELETE OR UPDATE ON public.episode_progress FOR EACH ROW EXECUTE FUNCTION public.sync_profile_watch_stats();

ALTER TABLE ONLY public.active_sessions
    ADD CONSTRAINT active_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.anime_lists
    ADD CONSTRAINT anime_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.anime_progress
    ADD CONSTRAINT anime_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.anime_ratings
    ADD CONSTRAINT anime_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.api_usage
    ADD CONSTRAINT api_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.app_presence
    ADD CONSTRAINT app_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.banned_machines
    ADD CONSTRAINT banned_machines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.bug_report_attachments
    ADD CONSTRAINT bug_report_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.bug_report_messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bug_report_messages
    ADD CONSTRAINT bug_report_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.bug_report_messages
    ADD CONSTRAINT bug_report_messages_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.bug_reports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_claims
    ADD CONSTRAINT campaign_claims_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_claims
    ADD CONSTRAINT campaign_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_logs
    ADD CONSTRAINT client_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.episode_progress
    ADD CONSTRAINT episode_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leaderboard_rank_records
    ADD CONSTRAINT leaderboard_rank_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leaderboard_totals
    ADD CONSTRAINT leaderboard_totals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_equipped_avatar_frame_fkey FOREIGN KEY (equipped_avatar_frame) REFERENCES public.credit_shop_items(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_equipped_comment_flair_fkey FOREIGN KEY (equipped_comment_flair) REFERENCES public.credit_shop_items(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_equipped_name_color_fkey FOREIGN KEY (equipped_name_color) REFERENCES public.credit_shop_items(id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.scan_offsets
    ADD CONSTRAINT scan_offsets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.scan_progress
    ADD CONSTRAINT scan_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_announcements
    ADD CONSTRAINT staff_announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.staff_audit_log
    ADD CONSTRAINT staff_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.staff_ban_events
    ADD CONSTRAINT staff_ban_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_ban_events
    ADD CONSTRAINT staff_ban_events_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.user_achievement_stats
    ADD CONSTRAINT user_achievement_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_season_progress
    ADD CONSTRAINT user_season_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.watch_clock
    ADD CONSTRAINT watch_clock_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.watch_time
    ADD CONSTRAINT watch_time_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.anime_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime_catalog readable by all" ON public.anime_catalog FOR SELECT USING (true);

ALTER TABLE public.anime_identity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.anime_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY anime_lists_all_self ON public.anime_lists USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY anime_lists_not_banned_del ON public.anime_lists AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_lists_not_banned_ins ON public.anime_lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_lists_not_banned_upd ON public.anime_lists AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_lists_not_guest_del ON public.anime_lists AS RESTRICTIVE FOR DELETE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY anime_lists_not_guest_ins ON public.anime_lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY anime_lists_not_guest_upd ON public.anime_lists AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

ALTER TABLE public.anime_metadata ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.anime_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY anime_progress_all_self ON public.anime_progress USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY anime_progress_not_banned_del ON public.anime_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_progress_not_banned_ins ON public.anime_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_progress_not_banned_upd ON public.anime_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY anime_progress_not_guest_del ON public.anime_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY anime_progress_not_guest_ins ON public.anime_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY anime_progress_not_guest_upd ON public.anime_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

ALTER TABLE public.anime_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.anime_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anime_seasons readable by all" ON public.anime_seasons FOR SELECT USING (true);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcement_dismissals_self ON public.announcement_dismissals USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcement_reads_self ON public.announcement_reads USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcements_select_visible ON public.announcements FOR SELECT USING (((target_user_id IS NULL) OR (target_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_presence ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.banned_machines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bug_report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_report_attachments_select_participants ON public.bug_report_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.bug_report_messages m
     JOIN public.bug_reports r ON ((r.id = m.report_id)))
  WHERE ((m.id = bug_report_attachments.message_id) AND ((r.user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin) OR (( SELECT public.is_staff() AS is_staff) AND ((r.staff_user_id IS NULL) OR (r.staff_user_id = ( SELECT auth.uid() AS uid)))))))));

ALTER TABLE public.bug_report_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_report_messages_select_participants ON public.bug_report_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bug_reports r
  WHERE ((r.id = bug_report_messages.report_id) AND ((r.user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin) OR (( SELECT public.is_staff() AS is_staff) AND ((r.staff_user_id IS NULL) OR (r.staff_user_id = ( SELECT auth.uid() AS uid)))))))));

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_reports_select_participants ON public.bug_reports FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT public.is_admin() AS is_admin) OR (( SELECT public.is_staff() AS is_staff) AND ((staff_user_id IS NULL) OR (staff_user_id = ( SELECT auth.uid() AS uid))))));

ALTER TABLE public.campaign_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_claims_read_own ON public.campaign_claims FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated USING (active);

ALTER TABLE public.client_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_blocked_words ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.credit_shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_shop_items_select_active ON public.credit_shop_items FOR SELECT TO authenticated USING (active);

ALTER TABLE public.episode_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY episode_progress_all_self ON public.episode_progress USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY episode_progress_not_banned_del ON public.episode_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY episode_progress_not_banned_ins ON public.episode_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY episode_progress_not_banned_upd ON public.episode_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY episode_progress_not_guest_del ON public.episode_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY episode_progress_not_guest_ins ON public.episode_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY episode_progress_not_guest_upd ON public.episode_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

ALTER TABLE public.episode_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "episode_sources readable by all" ON public.episode_sources FOR SELECT USING (true);

ALTER TABLE public.episode_thumbs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY favorites_all_self ON public.favorites USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY favorites_not_banned_del ON public.favorites AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY favorites_not_banned_ins ON public.favorites AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY favorites_not_banned_upd ON public.favorites AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY favorites_not_guest_del ON public.favorites AS RESTRICTIVE FOR DELETE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY favorites_not_guest_ins ON public.favorites AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY favorites_not_guest_upd ON public.favorites AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leaderboard_rank_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leaderboard_totals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.manga_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manga_catalog readable by all" ON public.manga_catalog FOR SELECT USING (true);

ALTER TABLE public.manga_slug_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manga_slug_resolutions readable by all" ON public.manga_slug_resolutions FOR SELECT USING (true);

ALTER TABLE public.party_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT USING (((( SELECT auth.uid() AS uid) = id) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));

ALTER TABLE public.scan_offsets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_progress_all_self ON public.scan_progress USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY scan_progress_not_banned_del ON public.scan_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY scan_progress_not_banned_ins ON public.scan_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY scan_progress_not_banned_upd ON public.scan_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT ( SELECT public.is_banned() AS is_banned)));

CREATE POLICY scan_progress_not_guest_del ON public.scan_progress AS RESTRICTIVE FOR DELETE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY scan_progress_not_guest_ins ON public.scan_progress AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

CREATE POLICY scan_progress_not_guest_upd ON public.scan_progress AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text));

ALTER TABLE public.slug_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slug_resolutions readable by all" ON public.slug_resolutions FOR SELECT USING (true);

ALTER TABLE public.staff_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_announcements_select ON public.staff_announcements FOR SELECT USING (public.is_staff());

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_ban_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stats_snapshot ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_achievement_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_achievement_stats_select_self ON public.user_achievement_stats FOR SELECT USING ((auth.uid() = user_id));

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_achievements_select_self ON public.user_achievements FOR SELECT USING ((auth.uid() = user_id));

ALTER TABLE public.user_season_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_season_progress_select_self ON public.user_season_progress FOR SELECT USING ((auth.uid() = user_id));

ALTER TABLE public.watch_clock ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.watch_time ENABLE ROW LEVEL SECURITY;

CREATE POLICY watch_time_select_self ON public.watch_time FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));

-- Supabase accorde par défaut tous les droits aux rôles d'API sur chaque objet créé dans
-- public. On les retire avant de reposer exactement ceux de la production.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL ON FUNCTION public._comment_assert_can_write(p_me uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public._comment_assert_can_write(p_me uuid) TO service_role;

GRANT ALL ON FUNCTION public.achievement_tier(p_family text, p_value bigint) TO anon;
GRANT ALL ON FUNCTION public.achievement_tier(p_family text, p_value bigint) TO authenticated;
GRANT ALL ON FUNCTION public.achievement_tier(p_family text, p_value bigint) TO service_role;

REVOKE ALL ON FUNCTION public.achievements_evaluate(p_user uuid, p_flipped boolean, p_episode_key text, p_tz_offset integer, p_season_total integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.achievements_evaluate(p_user uuid, p_flipped boolean, p_episode_key text, p_tz_offset integer, p_season_total integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_account_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_account_types() TO authenticated;
GRANT ALL ON FUNCTION public.admin_account_types() TO service_role;

REVOKE ALL ON FUNCTION public.admin_activity_daily(days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_activity_daily(days integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_activity_daily(days integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_app_presence_overview() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_app_presence_overview() TO authenticated;
GRANT ALL ON FUNCTION public.admin_app_presence_overview() TO service_role;

REVOKE ALL ON FUNCTION public.admin_ban_machine(target_id uuid, p_reason text, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_ban_machine(target_id uuid, p_reason text, p_until timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.admin_ban_machine(target_id uuid, p_reason text, p_until timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.admin_clear_anime_identity(p_slug text, p_season_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_clear_anime_identity(p_slug text, p_season_id text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_clear_anime_identity(p_slug text, p_season_id text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_announcement(p_title text, p_body text, p_type text, p_buttons jsonb, p_target uuid, p_draft boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_announcement(p_title text, p_body text, p_type text, p_buttons jsonb, p_target uuid, p_draft boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_announcement(p_title text, p_body text, p_type text, p_buttons jsonb, p_target uuid, p_draft boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_staff_announcement(p_title text, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_staff_announcement(p_title text, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_staff_announcement(p_title text, p_body text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_dashboard_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_dashboard_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.admin_dashboard_snapshot() TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_announcement(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_announcement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_delete_announcement(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_staff_announcement(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_staff_announcement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_delete_staff_announcement(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_extend_premium(target_id uuid, p_tier text, p_months integer, p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_extend_premium(target_id uuid, p_tier text, p_months integer, p_days integer) TO service_role;
GRANT ALL ON FUNCTION public.admin_extend_premium(target_id uuid, p_tier text, p_months integer, p_days integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_profile(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_get_profile(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_get_profile(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_anime_identity(p_filter text, p_search text, lim integer, off integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_anime_identity(p_filter text, p_search text, lim integer, off integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_anime_identity(p_filter text, p_search text, lim integer, off integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_announcements(p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_announcements(p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_announcements(p_limit integer, p_offset integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_blocked_words() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_blocked_words() TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_blocked_words() TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_comment_reports(p_status text, lim integer, off integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_comment_reports(p_status text, lim integer, off integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_comment_reports(p_status text, lim integer, off integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_scan_offsets() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_scan_offsets() TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_scan_offsets() TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_staff() TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_staff() TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_staff_announcements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_staff_announcements() TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_staff_announcements() TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_staff_audit(p_actor uuid, p_category text, p_search text, lim integer, off integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_staff_audit(p_actor uuid, p_category text, p_search text, lim integer, off integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_staff_audit(p_actor uuid, p_category text, p_search text, lim integer, off integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_users(search text, lim integer, off integer, sort text, p_account text, p_platform text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_users(search text, lim integer, off integer, sort text, p_account text, p_platform text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_users(search text, lim integer, off integer, sort text, p_account text, p_platform text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_overview() TO authenticated;
GRANT ALL ON FUNCTION public.admin_overview() TO service_role;

REVOKE ALL ON FUNCTION public.admin_platform_breakdown() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_platform_breakdown() TO authenticated;
GRANT ALL ON FUNCTION public.admin_platform_breakdown() TO service_role;

REVOKE ALL ON FUNCTION public.admin_publish_announcement(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_publish_announcement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_publish_announcement(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_anime_identity(p_slug text, p_season_id text, p_anilist_ids bigint[], p_tmdb_id bigint, p_tmdb_season integer, p_episode_offset integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_anime_identity(p_slug text, p_season_id text, p_anilist_ids bigint[], p_tmdb_id bigint, p_tmdb_season integer, p_episode_offset integer, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_anime_identity(p_slug text, p_season_id text, p_anilist_ids bigint[], p_tmdb_id bigint, p_tmdb_season integer, p_episode_offset integer, p_note text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_banned(target_id uuid, value boolean, p_reason text, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_banned(target_id uuid, value boolean, p_reason text, p_until timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_banned(target_id uuid, value boolean, p_reason text, p_until timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_blocked_word(p_word text, p_add boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_blocked_word(p_word text, p_add boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_blocked_word(p_word text, p_add boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_comment_report_status(p_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_comment_report_status(p_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_comment_report_status(p_id uuid, p_status text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_premium(target_id uuid, p_tier text, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_premium(target_id uuid, p_tier text, p_until timestamp with time zone) TO service_role;
GRANT ALL ON FUNCTION public.admin_set_premium(target_id uuid, p_tier text, p_until timestamp with time zone) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_role(target_id uuid, new_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_role(target_id uuid, new_role text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_role(target_id uuid, new_role text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_scan_offset(p_oeuvre text, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_scan_offset(p_oeuvre text, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_scan_offset(p_oeuvre text, p_offset integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_signups_daily(days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_signups_daily(days integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_signups_daily(days integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_top_animes(lim integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_top_animes(lim integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_top_animes(lim integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_top_watchers(lim integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_top_watchers(lim integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_top_watchers(lim integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_watch_by_hour(days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_watch_by_hour(days integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_watch_by_hour(days integer) TO service_role;

REVOKE ALL ON FUNCTION public.anime_rating_min_votes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.anime_rating_min_votes() TO postgres;
GRANT ALL ON FUNCTION public.anime_rating_min_votes() TO service_role;

REVOKE ALL ON FUNCTION public.api_account_banned(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_account_banned(p_user uuid) TO service_role;

REVOKE ALL ON FUNCTION public.api_key_owner(p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_key_owner(p_hash text) TO service_role;

REVOKE ALL ON FUNCTION public.api_usage_add(p_rows jsonb, p_keys uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_usage_add(p_rows jsonb, p_keys uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.bug_report_cooldown_seconds() TO anon;
GRANT ALL ON FUNCTION public.bug_report_cooldown_seconds() TO authenticated;
GRANT ALL ON FUNCTION public.bug_report_cooldown_seconds() TO service_role;

GRANT ALL ON FUNCTION public.bug_report_message_cooldown_seconds() TO postgres;
GRANT ALL ON FUNCTION public.bug_report_message_cooldown_seconds() TO anon;
GRANT ALL ON FUNCTION public.bug_report_message_cooldown_seconds() TO authenticated;
GRANT ALL ON FUNCTION public.bug_report_message_cooldown_seconds() TO service_role;

GRANT ALL ON FUNCTION public.check_ban(p_machine_id text) TO anon;
GRANT ALL ON FUNCTION public.check_ban(p_machine_id text) TO authenticated;
GRANT ALL ON FUNCTION public.check_ban(p_machine_id text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_campaign(p_campaign text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_campaign(p_campaign text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_campaign(p_campaign text) TO service_role;

GRANT ALL ON FUNCTION public.claim_device_slot(p_machine_id text, p_platform text, p_version text) TO anon;
GRANT ALL ON FUNCTION public.claim_device_slot(p_machine_id text, p_platform text, p_version text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_device_slot(p_machine_id text, p_platform text, p_version text) TO service_role;

REVOKE ALL ON FUNCTION public.clamp_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clamp_updated_at() TO service_role;

GRANT ALL ON FUNCTION public.client_heartbeat(p_machine_id text, p_platform text, p_version text, p_app text) TO anon;
GRANT ALL ON FUNCTION public.client_heartbeat(p_machine_id text, p_platform text, p_version text, p_app text) TO authenticated;
GRANT ALL ON FUNCTION public.client_heartbeat(p_machine_id text, p_platform text, p_version text, p_app text) TO service_role;

GRANT ALL ON FUNCTION public.client_log_retention_days() TO postgres;
GRANT ALL ON FUNCTION public.client_log_retention_days() TO anon;
GRANT ALL ON FUNCTION public.client_log_retention_days() TO authenticated;
GRANT ALL ON FUNCTION public.client_log_retention_days() TO service_role;

GRANT ALL ON FUNCTION public.client_log_ring_size() TO postgres;
GRANT ALL ON FUNCTION public.client_log_ring_size() TO anon;
GRANT ALL ON FUNCTION public.client_log_ring_size() TO authenticated;
GRANT ALL ON FUNCTION public.client_log_ring_size() TO service_role;

REVOKE ALL ON FUNCTION public.comment_cooldown_seconds() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_cooldown_seconds() TO authenticated;
GRANT ALL ON FUNCTION public.comment_cooldown_seconds() TO service_role;

REVOKE ALL ON FUNCTION public.comment_daily_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_daily_cap() TO authenticated;
GRANT ALL ON FUNCTION public.comment_daily_cap() TO service_role;

REVOKE ALL ON FUNCTION public.comment_has_blocked_word(p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_has_blocked_word(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.comment_has_blocked_word(p_text text) TO service_role;

REVOKE ALL ON FUNCTION public.comment_hourly_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_hourly_cap() TO authenticated;
GRANT ALL ON FUNCTION public.comment_hourly_cap() TO service_role;

REVOKE ALL ON FUNCTION public.comment_like_hourly_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_like_hourly_cap() TO authenticated;
GRANT ALL ON FUNCTION public.comment_like_hourly_cap() TO service_role;

REVOKE ALL ON FUNCTION public.comment_min_account_minutes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_min_account_minutes() TO authenticated;
GRANT ALL ON FUNCTION public.comment_min_account_minutes() TO service_role;

REVOKE ALL ON FUNCTION public.comment_normalize(p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_normalize(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.comment_normalize(p_text text) TO service_role;

REVOKE ALL ON FUNCTION public.comment_report_daily_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_report_daily_cap() TO authenticated;
GRANT ALL ON FUNCTION public.comment_report_daily_cap() TO service_role;

REVOKE ALL ON FUNCTION public.comment_threads_per_target_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_threads_per_target_cap() TO authenticated;
GRANT ALL ON FUNCTION public.comment_threads_per_target_cap() TO service_role;

GRANT ALL ON FUNCTION public.cosmetic_min_tier(p_slot text, p_item text) TO anon;
GRANT ALL ON FUNCTION public.cosmetic_min_tier(p_slot text, p_item text) TO authenticated;
GRANT ALL ON FUNCTION public.cosmetic_min_tier(p_slot text, p_item text) TO service_role;

GRANT ALL ON FUNCTION public.cosmetic_ok(p_slot text, p_item text, p_tier text) TO anon;
GRANT ALL ON FUNCTION public.cosmetic_ok(p_slot text, p_item text, p_tier text) TO authenticated;
GRANT ALL ON FUNCTION public.cosmetic_ok(p_slot text, p_item text, p_tier text) TO service_role;

GRANT ALL ON FUNCTION public.count_comments(p_kind text, p_key text) TO anon;
GRANT ALL ON FUNCTION public.count_comments(p_kind text, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.count_comments(p_kind text, p_key text) TO service_role;

GRANT ALL ON FUNCTION public.count_pending_friend_requests() TO anon;
GRANT ALL ON FUNCTION public.count_pending_friend_requests() TO authenticated;
GRANT ALL ON FUNCTION public.count_pending_friend_requests() TO service_role;

REVOKE ALL ON FUNCTION public.create_api_key(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_api_key(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_api_key(p_name text) TO service_role;

REVOKE ALL ON FUNCTION public.delete_anime_rating(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_anime_rating(p_slug text) TO postgres;
GRANT ALL ON FUNCTION public.delete_anime_rating(p_slug text) TO service_role;
GRANT ALL ON FUNCTION public.delete_anime_rating(p_slug text) TO authenticated;

GRANT ALL ON FUNCTION public.delete_comment(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_comment(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_comment(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.discord_account_age_days(p_discord_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_account_age_days(p_discord_id text) TO service_role;

GRANT ALL ON FUNCTION public.dismiss_announcement(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.dismiss_announcement(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_announcement(p_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.edit_comment(p_id uuid, p_body text, p_spoiler boolean) TO anon;
GRANT ALL ON FUNCTION public.edit_comment(p_id uuid, p_body text, p_spoiler boolean) TO authenticated;
GRANT ALL ON FUNCTION public.edit_comment(p_id uuid, p_body text, p_spoiler boolean) TO service_role;

GRANT ALL ON FUNCTION public.enforce_pin_limit() TO anon;
GRANT ALL ON FUNCTION public.enforce_pin_limit() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_pin_limit() TO service_role;

REVOKE ALL ON FUNCTION public.equip_credit_item(p_category text, p_item_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.equip_credit_item(p_category text, p_item_id text) TO authenticated;
GRANT ALL ON FUNCTION public.equip_credit_item(p_category text, p_item_id text) TO service_role;

GRANT ALL ON FUNCTION public.friend_status(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.friend_status(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.friend_status(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.gen_support_code(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gen_support_code(p_username text) TO postgres;
GRANT ALL ON FUNCTION public.gen_support_code(p_username text) TO service_role;

REVOKE ALL ON FUNCTION public.gen_unique_handle(p_seed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gen_unique_handle(p_seed text) TO service_role;

REVOKE ALL ON FUNCTION public.get_achievements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_achievements() TO authenticated;
GRANT ALL ON FUNCTION public.get_achievements() TO service_role;

REVOKE ALL ON FUNCTION public.get_anime_rating_summary(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_anime_rating_summary(p_slug text) TO postgres;
GRANT ALL ON FUNCTION public.get_anime_rating_summary(p_slug text) TO service_role;
GRANT ALL ON FUNCTION public.get_anime_rating_summary(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.get_anime_rating_summary(p_slug text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_campaign_status(p_campaign text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_campaign_status(p_campaign text) TO authenticated;
GRANT ALL ON FUNCTION public.get_campaign_status(p_campaign text) TO service_role;

GRANT ALL ON FUNCTION public.get_leaderboard(p_metric text, lim integer, p_period text) TO anon;
GRANT ALL ON FUNCTION public.get_leaderboard(p_metric text, lim integer, p_period text) TO authenticated;
GRANT ALL ON FUNCTION public.get_leaderboard(p_metric text, lim integer, p_period text) TO service_role;

GRANT ALL ON FUNCTION public.get_my_announcements(p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_my_announcements(p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_announcements(p_limit integer, p_offset integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_profile_extra_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_extra_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_profile_extra_stats() TO service_role;

GRANT ALL ON FUNCTION public.get_public_activity(p_id uuid, lim integer) TO anon;
GRANT ALL ON FUNCTION public.get_public_activity(p_id uuid, lim integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_activity(p_id uuid, lim integer) TO service_role;

GRANT ALL ON FUNCTION public.get_public_favorites(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_public_favorites(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_favorites(p_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.get_public_friends(p_id uuid, lim integer) TO anon;
GRANT ALL ON FUNCTION public.get_public_friends(p_id uuid, lim integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_friends(p_id uuid, lim integer) TO service_role;

GRANT ALL ON FUNCTION public.get_public_profile(p_handle text) TO anon;
GRANT ALL ON FUNCTION public.get_public_profile(p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_profile(p_handle text) TO service_role;

GRANT ALL ON FUNCTION public.get_team_roster() TO anon;
GRANT ALL ON FUNCTION public.get_team_roster() TO authenticated;
GRANT ALL ON FUNCTION public.get_team_roster() TO service_role;

GRANT ALL ON FUNCTION public.get_unread_announcements_count() TO anon;
GRANT ALL ON FUNCTION public.get_unread_announcements_count() TO authenticated;
GRANT ALL ON FUNCTION public.get_unread_announcements_count() TO service_role;

GRANT ALL ON FUNCTION public.get_user_stats() TO anon;
GRANT ALL ON FUNCTION public.get_user_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_stats() TO service_role;

GRANT ALL ON FUNCTION public.get_watch_calendar(p_id uuid, p_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_watch_calendar(p_id uuid, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_watch_calendar(p_id uuid, p_days integer) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.heartbeat_watch(p_episode_key text, p_position double precision, p_duration double precision, p_tz_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.heartbeat_watch(p_episode_key text, p_position double precision, p_duration double precision, p_tz_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.heartbeat_watch(p_episode_key text, p_position double precision, p_duration double precision, p_tz_offset integer) TO service_role;

REVOKE ALL ON FUNCTION public.hub_activity_daily(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_activity_daily(p_days integer) TO service_role;

REVOKE ALL ON FUNCTION public.hub_app_overview() FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_app_overview() TO service_role;

REVOKE ALL ON FUNCTION public.hub_leaderboard(p_metric text, p_limit integer, p_period text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_leaderboard(p_metric text, p_limit integer, p_period text) TO service_role;

REVOKE ALL ON FUNCTION public.hub_recommend_for_user(p_user_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_recommend_for_user(p_user_id uuid, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.hub_related_animes(p_slug text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_related_animes(p_slug text, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.hub_support_dossier(p_code text, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_support_dossier(p_code text, p_scope text) TO postgres;
GRANT ALL ON FUNCTION public.hub_support_dossier(p_code text, p_scope text) TO service_role;

REVOKE ALL ON FUNCTION public.hub_top_animes(p_limit integer, p_period text, p_sort text, p_since timestamp with time zone, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_top_animes(p_limit integer, p_period text, p_sort text, p_since timestamp with time zone, p_until timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.hub_user_rank(p_user_id uuid, p_metric text, p_period text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hub_user_rank(p_user_id uuid, p_metric text, p_period text) TO service_role;

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;

REVOKE ALL ON FUNCTION public.is_banned() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_banned() TO authenticated;
GRANT ALL ON FUNCTION public.is_banned() TO service_role;

GRANT ALL ON FUNCTION public.is_premium(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_premium(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_premium(uid uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_staff() TO anon;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff() TO service_role;

REVOKE ALL ON FUNCTION public.list_comment_replies(p_parent uuid, lim integer, off integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_comment_replies(p_parent uuid, lim integer, off integer) TO service_role;
GRANT ALL ON FUNCTION public.list_comment_replies(p_parent uuid, lim integer, off integer) TO anon;
GRANT ALL ON FUNCTION public.list_comment_replies(p_parent uuid, lim integer, off integer) TO authenticated;

REVOKE ALL ON FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone, p_before_id uuid, lim integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone, p_before_id uuid, lim integer) TO service_role;
GRANT ALL ON FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone, p_before_id uuid, lim integer) TO anon;
GRANT ALL ON FUNCTION public.list_comments(p_kind text, p_key text, p_before_at timestamp with time zone, p_before_id uuid, lim integer) TO authenticated;

GRANT ALL ON FUNCTION public.list_friend_requests() TO anon;
GRANT ALL ON FUNCTION public.list_friend_requests() TO authenticated;
GRANT ALL ON FUNCTION public.list_friend_requests() TO service_role;

GRANT ALL ON FUNCTION public.list_friends() TO anon;
GRANT ALL ON FUNCTION public.list_friends() TO authenticated;
GRANT ALL ON FUNCTION public.list_friends() TO service_role;

REVOKE ALL ON FUNCTION public.list_my_api_keys() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_my_api_keys() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_api_keys() TO service_role;

REVOKE ALL ON FUNCTION public.log_client_event(p_app text, p_event text, p_level text, p_message text, p_detail jsonb, p_app_version text, p_platform text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_client_event(p_app text, p_event text, p_level text, p_message text, p_detail jsonb, p_app_version text, p_platform text) TO postgres;
GRANT ALL ON FUNCTION public.log_client_event(p_app text, p_event text, p_level text, p_message text, p_detail jsonb, p_app_version text, p_platform text) TO authenticated;
GRANT ALL ON FUNCTION public.log_client_event(p_app text, p_event text, p_level text, p_message text, p_detail jsonb, p_app_version text, p_platform text) TO service_role;

GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_announcements_read(p_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.my_support_code() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_support_code() TO postgres;
GRANT ALL ON FUNCTION public.my_support_code() TO authenticated;
GRANT ALL ON FUNCTION public.my_support_code() TO service_role;

GRANT ALL ON FUNCTION public.online_count() TO anon;
GRANT ALL ON FUNCTION public.online_count() TO authenticated;
GRANT ALL ON FUNCTION public.online_count() TO service_role;

REVOKE ALL ON FUNCTION public.party_room_close(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.party_room_close(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.party_room_close(p_code text) TO service_role;

REVOKE ALL ON FUNCTION public.party_room_get_state(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.party_room_get_state(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.party_room_get_state(p_code text) TO service_role;

REVOKE ALL ON FUNCTION public.party_room_save_state(p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.party_room_save_state(p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.party_room_save_state(p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb) TO service_role;

GRANT ALL ON FUNCTION public.post_comment(p_kind text, p_key text, p_body text, p_parent uuid, p_spoiler boolean) TO anon;
GRANT ALL ON FUNCTION public.post_comment(p_kind text, p_key text, p_body text, p_parent uuid, p_spoiler boolean) TO authenticated;
GRANT ALL ON FUNCTION public.post_comment(p_kind text, p_key text, p_body text, p_parent uuid, p_spoiler boolean) TO service_role;

REVOKE ALL ON FUNCTION public.profile_view_hourly_cap() FROM PUBLIC;
GRANT ALL ON FUNCTION public.profile_view_hourly_cap() TO authenticated;
GRANT ALL ON FUNCTION public.profile_view_hourly_cap() TO service_role;

GRANT ALL ON FUNCTION public.profiles_set_support_code() TO postgres;
GRANT ALL ON FUNCTION public.profiles_set_support_code() TO anon;
GRANT ALL ON FUNCTION public.profiles_set_support_code() TO authenticated;
GRANT ALL ON FUNCTION public.profiles_set_support_code() TO service_role;

REVOKE ALL ON FUNCTION public.purchase_credit_item(p_item_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purchase_credit_item(p_item_id text) TO authenticated;
GRANT ALL ON FUNCTION public.purchase_credit_item(p_item_id text) TO service_role;

REVOKE ALL ON FUNCTION public.purge_audit_log_entries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_audit_log_entries() TO service_role;

REVOKE ALL ON FUNCTION public.purge_profile_views() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_profile_views() TO service_role;

REVOKE ALL ON FUNCTION public.record_profile_view(p_profile uuid, p_viewer_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_profile_view(p_profile uuid, p_viewer_key text) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_admin_dashboard_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_admin_dashboard_snapshot() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_catalog_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_catalog_languages() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_episode_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_episode_counts() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_stats_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_stats_snapshot() TO service_role;

REVOKE ALL ON FUNCTION public.regen_support_code() FROM PUBLIC;
GRANT ALL ON FUNCTION public.regen_support_code() TO postgres;
GRANT ALL ON FUNCTION public.regen_support_code() TO authenticated;
GRANT ALL ON FUNCTION public.regen_support_code() TO service_role;

GRANT ALL ON FUNCTION public.release_device_slot(p_machine_id text) TO anon;
GRANT ALL ON FUNCTION public.release_device_slot(p_machine_id text) TO authenticated;
GRANT ALL ON FUNCTION public.release_device_slot(p_machine_id text) TO service_role;

GRANT ALL ON FUNCTION public.remove_friend(p_other uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_friend(p_other uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_friend(p_other uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) TO anon;
GRANT ALL ON FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_anime_list(p_status text, p_slugs text[]) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_favorites(p_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_favorites(p_slugs text[]) TO anon;
GRANT ALL ON FUNCTION public.reorder_favorites(p_slugs text[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_favorites(p_slugs text[]) TO service_role;

GRANT ALL ON FUNCTION public.report_comment(p_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.report_comment(p_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.report_comment(p_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb, p_app_version text, p_platform text, p_context jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb, p_app_version text, p_platform text, p_context jsonb) TO postgres;
GRANT ALL ON FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb, p_app_version text, p_platform text, p_context jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.report_create(p_id uuid, p_message_id uuid, p_category text, p_body text, p_attachments jsonb, p_app_version text, p_platform text, p_context jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.report_messages(p_report_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_messages(p_report_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.report_messages(p_report_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_messages(p_report_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.report_my_list() FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_my_list() TO postgres;
GRANT ALL ON FUNCTION public.report_my_list() TO authenticated;
GRANT ALL ON FUNCTION public.report_my_list() TO service_role;

REVOKE ALL ON FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb) TO postgres;
GRANT ALL ON FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.report_send_message(p_report_id uuid, p_message_id uuid, p_body text, p_attachments jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.report_staff_claim(p_report_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_staff_claim(p_report_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.report_staff_claim(p_report_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_staff_claim(p_report_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.report_staff_dossier(p_report_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_staff_dossier(p_report_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.report_staff_dossier(p_report_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_staff_dossier(p_report_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.report_staff_list(p_scope text, p_category text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_staff_list(p_scope text, p_category text) TO postgres;
GRANT ALL ON FUNCTION public.report_staff_list(p_scope text, p_category text) TO authenticated;
GRANT ALL ON FUNCTION public.report_staff_list(p_scope text, p_category text) TO service_role;

REVOKE ALL ON FUNCTION public.report_staff_release(p_report_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_staff_release(p_report_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.report_staff_release(p_report_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_staff_release(p_report_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) TO postgres;
GRANT ALL ON FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.report_staff_set_status(p_report_id uuid, p_status text) TO service_role;

GRANT ALL ON FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) TO anon;
GRANT ALL ON FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) TO authenticated;
GRANT ALL ON FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_api_key(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_api_key(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_api_key(p_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.sanitize_announcement_buttons(p_buttons jsonb) TO anon;
GRANT ALL ON FUNCTION public.sanitize_announcement_buttons(p_buttons jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.sanitize_announcement_buttons(p_buttons jsonb) TO service_role;

GRANT ALL ON FUNCTION public.search_users(p_query text, lim integer) TO anon;
GRANT ALL ON FUNCTION public.search_users(p_query text, lim integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_users(p_query text, lim integer) TO service_role;

GRANT ALL ON FUNCTION public.send_friend_request(p_handle text) TO anon;
GRANT ALL ON FUNCTION public.send_friend_request(p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.send_friend_request(p_handle text) TO service_role;

REVOKE ALL ON FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) TO anon;
GRANT ALL ON FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) TO authenticated;
GRANT ALL ON FUNCTION public.set_anime_list_dates(p_slug text, p_started_at date, p_completed_at date) TO service_role;

REVOKE ALL ON FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text, p_cover text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text, p_cover text) TO anon;
GRANT ALL ON FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text, p_cover text) TO authenticated;
GRANT ALL ON FUNCTION public.set_anime_status(p_slug text, p_status text, p_title text, p_cover text) TO service_role;

GRANT ALL ON FUNCTION public.set_profile_image(p_kind text, p_path text) TO anon;
GRANT ALL ON FUNCTION public.set_profile_image(p_kind text, p_path text) TO authenticated;
GRANT ALL ON FUNCTION public.set_profile_image(p_kind text, p_path text) TO service_role;

GRANT ALL ON FUNCTION public.set_social_prefs(p_friends_public boolean, p_presence_public boolean) TO anon;
GRANT ALL ON FUNCTION public.set_social_prefs(p_friends_public boolean, p_presence_public boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_social_prefs(p_friends_public boolean, p_presence_public boolean) TO service_role;

REVOKE ALL ON FUNCTION public.set_support_optin(p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_support_optin(p_enabled boolean) TO postgres;
GRANT ALL ON FUNCTION public.set_support_optin(p_enabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_support_optin(p_enabled boolean) TO service_role;

GRANT ALL ON FUNCTION public.set_username(p_username text) TO anon;
GRANT ALL ON FUNCTION public.set_username(p_username text) TO authenticated;
GRANT ALL ON FUNCTION public.set_username(p_username text) TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_anime_identity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_anime_identity() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_announcements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_announcements() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_banned_machines() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_banned_machines() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_blocked_words() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_blocked_words() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_bug_reports() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_bug_reports() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_comment_reports() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_comment_reports() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_comments() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_comments() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_profiles() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_profiles() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_scan_offsets() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_scan_offsets() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_staff_announcements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_staff_announcements() TO service_role;

REVOKE ALL ON FUNCTION public.staff_audit_write(p_action text, p_target_type text, p_target_id text, p_target_label text, p_details jsonb, p_force boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_audit_write(p_action text, p_target_type text, p_target_id text, p_target_label text, p_details jsonb, p_force boolean) TO service_role;

REVOKE ALL ON FUNCTION public.support_dossier_for_user(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.support_dossier_for_user(p_user uuid) TO postgres;

REVOKE ALL ON FUNCTION public.support_user_email(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.support_user_email(p_user uuid) TO postgres;
GRANT ALL ON FUNCTION public.support_user_email(p_user uuid) TO service_role;

GRANT ALL ON FUNCTION public.sync_profile_watch_stats() TO anon;
GRANT ALL ON FUNCTION public.sync_profile_watch_stats() TO authenticated;
GRANT ALL ON FUNCTION public.sync_profile_watch_stats() TO service_role;

GRANT ALL ON FUNCTION public.toggle_comment_like(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.toggle_comment_like(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_comment_like(p_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.touch_app_presence(p_app text, p_version text, p_platform text, p_machine_id text) TO anon;
GRANT ALL ON FUNCTION public.touch_app_presence(p_app text, p_version text, p_platform text, p_machine_id text) TO authenticated;
GRANT ALL ON FUNCTION public.touch_app_presence(p_app text, p_version text, p_platform text, p_machine_id text) TO service_role;

GRANT ALL ON FUNCTION public.touch_presence(p_version text, p_platform text, p_machine_id text) TO anon;
GRANT ALL ON FUNCTION public.touch_presence(p_version text, p_platform text, p_machine_id text) TO authenticated;
GRANT ALL ON FUNCTION public.touch_presence(p_version text, p_platform text, p_machine_id text) TO service_role;

GRANT ALL ON FUNCTION public.update_my_profile(p_handle text, p_bio text, p_accent text, p_is_public boolean, p_activity_public boolean, p_favorites_public boolean, p_emblem text, p_ambient text, p_ornament text, p_banner text, p_particles text) TO anon;
GRANT ALL ON FUNCTION public.update_my_profile(p_handle text, p_bio text, p_accent text, p_is_public boolean, p_activity_public boolean, p_favorites_public boolean, p_emblem text, p_ambient text, p_ornament text, p_banner text, p_particles text) TO authenticated;
GRANT ALL ON FUNCTION public.update_my_profile(p_handle text, p_bio text, p_accent text, p_is_public boolean, p_activity_public boolean, p_favorites_public boolean, p_emblem text, p_ambient text, p_ornament text, p_banner text, p_particles text) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) TO postgres;
GRANT ALL ON FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) TO service_role;
GRANT ALL ON FUNCTION public.upsert_anime_rating(p_slug text, p_rating smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.user_real_episodes(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_real_episodes(p_user uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_trusted_watch_seconds(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_trusted_watch_seconds(p_user uuid) TO service_role;

REVOKE ALL ON FUNCTION public.watch_credit(p_episode_key text, p_duration double precision, p_tz_offset integer, p_season_total integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.watch_credit(p_episode_key text, p_duration double precision, p_tz_offset integer, p_season_total integer) TO authenticated;
GRANT ALL ON FUNCTION public.watch_credit(p_episode_key text, p_duration double precision, p_tz_offset integer, p_season_total integer) TO service_role;

REVOKE ALL ON FUNCTION public.watch_tick(p_episode_key text, p_slug text, p_season_id text, p_episode_number double precision, p_language text, p_position double precision, p_duration double precision, p_title text, p_cover text, p_tz_offset integer, p_season_total integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.watch_tick(p_episode_key text, p_slug text, p_season_id text, p_episode_number double precision, p_language text, p_position double precision, p_duration double precision, p_title text, p_cover text, p_tz_offset integer, p_season_total integer) TO authenticated;
GRANT ALL ON FUNCTION public.watch_tick(p_episode_key text, p_slug text, p_season_id text, p_episode_number double precision, p_language text, p_position double precision, p_duration double precision, p_title text, p_cover text, p_tz_offset integer, p_season_total integer) TO service_role;

GRANT ALL ON TABLE public.active_sessions TO anon;
GRANT ALL ON TABLE public.active_sessions TO authenticated;
GRANT ALL ON TABLE public.active_sessions TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.anime_catalog TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.anime_catalog TO authenticated;
GRANT ALL ON TABLE public.anime_catalog TO service_role;

GRANT ALL ON TABLE public.anime_identity TO service_role;

GRANT ALL ON TABLE public.anime_lists TO anon;
GRANT ALL ON TABLE public.anime_lists TO authenticated;
GRANT ALL ON TABLE public.anime_lists TO service_role;

GRANT ALL ON TABLE public.anime_metadata TO service_role;

GRANT ALL ON TABLE public.anime_progress TO anon;
GRANT ALL ON TABLE public.anime_progress TO authenticated;
GRANT ALL ON TABLE public.anime_progress TO service_role;

GRANT ALL ON TABLE public.anime_ratings TO postgres;
GRANT ALL ON TABLE public.anime_ratings TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.anime_seasons TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.anime_seasons TO authenticated;
GRANT ALL ON TABLE public.anime_seasons TO service_role;

GRANT ALL ON TABLE public.announcement_dismissals TO anon;
GRANT ALL ON TABLE public.announcement_dismissals TO authenticated;
GRANT ALL ON TABLE public.announcement_dismissals TO service_role;

GRANT ALL ON TABLE public.announcement_reads TO anon;
GRANT ALL ON TABLE public.announcement_reads TO authenticated;
GRANT ALL ON TABLE public.announcement_reads TO service_role;

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;

GRANT ALL ON TABLE public.api_keys TO service_role;

GRANT ALL ON TABLE public.api_usage TO service_role;

GRANT ALL ON TABLE public.app_presence TO anon;
GRANT ALL ON TABLE public.app_presence TO authenticated;
GRANT ALL ON TABLE public.app_presence TO service_role;

GRANT ALL ON TABLE public.banned_machines TO anon;
GRANT ALL ON TABLE public.banned_machines TO authenticated;
GRANT ALL ON TABLE public.banned_machines TO service_role;

GRANT ALL ON TABLE public.bug_report_attachments TO postgres;
GRANT ALL ON TABLE public.bug_report_attachments TO service_role;
GRANT SELECT ON TABLE public.bug_report_attachments TO authenticated;

GRANT ALL ON TABLE public.bug_report_messages TO postgres;
GRANT ALL ON TABLE public.bug_report_messages TO service_role;
GRANT SELECT ON TABLE public.bug_report_messages TO authenticated;

GRANT ALL ON TABLE public.bug_reports TO anon;
GRANT ALL ON TABLE public.bug_reports TO authenticated;
GRANT ALL ON TABLE public.bug_reports TO service_role;

GRANT ALL ON TABLE public.campaign_claims TO anon;
GRANT ALL ON TABLE public.campaign_claims TO authenticated;
GRANT ALL ON TABLE public.campaign_claims TO service_role;

GRANT ALL ON TABLE public.campaigns TO anon;
GRANT ALL ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;

GRANT ALL ON TABLE public.client_logs TO postgres;
GRANT ALL ON TABLE public.client_logs TO anon;
GRANT ALL ON TABLE public.client_logs TO authenticated;
GRANT ALL ON TABLE public.client_logs TO service_role;

GRANT ALL ON SEQUENCE public.client_logs_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.client_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.client_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.client_logs_id_seq TO service_role;

GRANT ALL ON TABLE public.comment_blocked_words TO service_role;

GRANT ALL ON TABLE public.comment_likes TO service_role;

GRANT ALL ON TABLE public.comment_reports TO service_role;

GRANT ALL ON TABLE public.comments TO service_role;

GRANT ALL ON TABLE public.credit_shop_items TO anon;
GRANT ALL ON TABLE public.credit_shop_items TO authenticated;
GRANT ALL ON TABLE public.credit_shop_items TO service_role;

GRANT ALL ON TABLE public.episode_progress TO anon;
GRANT ALL ON TABLE public.episode_progress TO authenticated;
GRANT ALL ON TABLE public.episode_progress TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.episode_sources TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.episode_sources TO authenticated;
GRANT ALL ON TABLE public.episode_sources TO service_role;

GRANT ALL ON TABLE public.episode_thumbs TO anon;
GRANT ALL ON TABLE public.episode_thumbs TO authenticated;
GRANT ALL ON TABLE public.episode_thumbs TO service_role;

GRANT ALL ON TABLE public.favorites TO anon;
GRANT ALL ON TABLE public.favorites TO authenticated;
GRANT ALL ON TABLE public.favorites TO service_role;

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;

GRANT ALL ON TABLE public.leaderboard_rank_records TO service_role;

GRANT ALL ON TABLE public.leaderboard_totals TO anon;
GRANT ALL ON TABLE public.leaderboard_totals TO authenticated;
GRANT ALL ON TABLE public.leaderboard_totals TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.manga_catalog TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.manga_catalog TO authenticated;
GRANT ALL ON TABLE public.manga_catalog TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.manga_slug_resolutions TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.manga_slug_resolutions TO authenticated;
GRANT ALL ON TABLE public.manga_slug_resolutions TO service_role;

GRANT ALL ON TABLE public.party_rooms TO anon;
GRANT ALL ON TABLE public.party_rooms TO authenticated;
GRANT ALL ON TABLE public.party_rooms TO service_role;

GRANT ALL ON TABLE public.profile_views TO service_role;

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT UPDATE(avatar) ON TABLE public.profiles TO authenticated;

GRANT UPDATE(last_login) ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.scan_offsets TO anon;
GRANT ALL ON TABLE public.scan_offsets TO authenticated;
GRANT ALL ON TABLE public.scan_offsets TO service_role;

GRANT ALL ON TABLE public.scan_progress TO anon;
GRANT ALL ON TABLE public.scan_progress TO authenticated;
GRANT ALL ON TABLE public.scan_progress TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.slug_resolutions TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.slug_resolutions TO authenticated;
GRANT ALL ON TABLE public.slug_resolutions TO service_role;

GRANT ALL ON TABLE public.staff_announcements TO anon;
GRANT ALL ON TABLE public.staff_announcements TO authenticated;
GRANT ALL ON TABLE public.staff_announcements TO service_role;

GRANT ALL ON TABLE public.staff_audit_log TO service_role;

GRANT ALL ON SEQUENCE public.staff_audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.staff_audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.staff_audit_log_id_seq TO service_role;

GRANT ALL ON TABLE public.staff_ban_events TO anon;
GRANT ALL ON TABLE public.staff_ban_events TO authenticated;
GRANT ALL ON TABLE public.staff_ban_events TO service_role;

GRANT ALL ON SEQUENCE public.staff_ban_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.staff_ban_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.staff_ban_events_id_seq TO service_role;

GRANT ALL ON TABLE public.stats_snapshot TO anon;
GRANT ALL ON TABLE public.stats_snapshot TO authenticated;
GRANT ALL ON TABLE public.stats_snapshot TO service_role;

GRANT ALL ON TABLE public.user_achievement_stats TO anon;
GRANT ALL ON TABLE public.user_achievement_stats TO authenticated;
GRANT ALL ON TABLE public.user_achievement_stats TO service_role;

GRANT ALL ON TABLE public.user_achievements TO anon;
GRANT ALL ON TABLE public.user_achievements TO authenticated;
GRANT ALL ON TABLE public.user_achievements TO service_role;

GRANT ALL ON TABLE public.user_season_progress TO anon;
GRANT ALL ON TABLE public.user_season_progress TO authenticated;
GRANT ALL ON TABLE public.user_season_progress TO service_role;

GRANT ALL ON TABLE public.watch_clock TO service_role;

GRANT ALL ON TABLE public.watch_time TO anon;
GRANT ALL ON TABLE public.watch_time TO authenticated;
GRANT ALL ON TABLE public.watch_time TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- Création du profil à l'inscription

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stockage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, '{image/jpeg,image/png,image/webp,image/gif,image/avif}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 8388608, '{image/jpeg,image/png,image/webp,image/gif,image/avif}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bug-reports', 'bug-reports', false, 10485760, '{image/jpeg,image/png,image/webp,image/gif}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page_backgrounds', 'page_backgrounds', true, 8388608, '{image/jpeg,image/png,image/webp,image/gif,image/avif}')
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_write_own_del on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy avatars_write_own_ins on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));
create policy avatars_write_own_upd on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));
create policy banners_write_own_del on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'banners'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy banners_write_own_ins on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'banners'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));
create policy banners_write_own_upd on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'banners'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));
create policy bug_reports_attachments_delete_orphan on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'bug-reports'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.bug_report_attachments a
  WHERE (a.storage_path = objects.name))))));
create policy bug_reports_attachments_read on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'bug-reports'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.bug_reports r
  WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND ((r.user_id = auth.uid()) OR (public.is_staff() AND ((r.staff_user_id IS NULL) OR (r.staff_user_id = auth.uid()))))))) OR (EXISTS ( SELECT 1
   FROM public.bug_reports r
  WHERE (((r.id)::text = (storage.foldername(objects.name))[1]) AND ((r.user_id = auth.uid()) OR (public.is_staff() AND ((r.staff_user_id IS NULL) OR (r.staff_user_id = auth.uid()))))))))));
create policy bug_reports_attachments_write on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'bug-reports'::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.bug_reports r
  WHERE (((r.id)::text = (storage.foldername(objects.name))[1]) AND ((r.user_id = auth.uid()) OR public.is_admin() OR (public.is_staff() AND ((r.staff_user_id IS NULL) OR (r.staff_user_id = auth.uid()))))))))));
create policy page_backgrounds_write_own_del on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'page_backgrounds'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy page_backgrounds_write_own_ins on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'page_backgrounds'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));
create policy page_backgrounds_write_own_upd on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'page_backgrounds'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (((auth.jwt() ->> 'is_anonymous'::text))::boolean IS NOT TRUE)));

-- Tâches planifiées (pg_cron)

select cron.schedule('purge-audit-log-entries', '11 4 * * *', 'select public.purge_audit_log_entries();');
select cron.schedule('refresh-admin-dashboard-snapshot', '7,22,37,52 * * * *', 'select public.refresh_admin_dashboard_snapshot();');
select cron.schedule('refresh-stats-snapshot', '*/30 * * * *', 'select public.refresh_stats_snapshot();');
