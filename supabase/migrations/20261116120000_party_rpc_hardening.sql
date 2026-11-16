-- Durcissement des RPC de watch party.
--
-- Avant : n'importe quel compte (invités anonymes compris) pouvait écraser, supprimer ou
-- s'approprier le salon d'un autre en connaissant son code ; `party_room_save_state` reprenait
-- `host_user_id` à chaque appel, `party_room_close` supprimait sans vérifier, et le nettoyage des
-- vieux salons s'exécutait à chaque sauvegarde.
--
-- Règle : seul l'hôte (`host_user_id`) écrit sur son salon. Un successeur, après une relève, peut
-- reprendre un salon silencieux depuis 20 s. Les invités anonymes ne touchent à rien.
-- Idempotent : peut être rejoué sans effet de bord.

create index if not exists party_rooms_host_idx on public.party_rooms (host_user_id);
create index if not exists party_rooms_updated_idx on public.party_rooms (updated_at);

-- L'accès ne passe que par les fonctions ci-dessous (SECURITY DEFINER).
revoke all on table public.party_rooms from anon, authenticated;

create or replace function public.party_room_save_state(
  p_code text, p_host_client_id text, p_current jsonb, p_queue jsonb, p_playback jsonb, p_options jsonb
) returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_queue jsonb := coalesce(p_queue, '[]'::jsonb);
  v_play  jsonb := coalesce(p_playback, '{"currentTime":0,"isPlaying":false}'::jsonb);
  v_opts  jsonb := coalesce(p_options, '{}'::jsonb);
  v_owner uuid;
  v_last  timestamptz;
  v_found boolean;
  v_rows  integer;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(banned, false)) then
    raise exception 'forbidden';
  end if;
  if p_code is null or p_code !~ '^[A-HJKMNP-Z2-9]{6}$' then raise exception 'invalide'; end if;
  if p_host_client_id is null or length(p_host_client_id) > 64 then raise exception 'invalide'; end if;
  if jsonb_typeof(v_queue) <> 'array' or jsonb_array_length(v_queue) > 200
     or jsonb_typeof(v_play) <> 'object' or jsonb_typeof(v_opts) <> 'object' then
    raise exception 'invalide';
  end if;
  if length(coalesce(p_current, 'null'::jsonb)::text) > 8192
     or length(v_queue::text) > 262144
     or length(v_play::text) > 1024
     or length(v_opts::text) > 4096 then
    raise exception 'trop volumineux';
  end if;

  select host_user_id, greatest(updated_at, coalesce(heartbeat_at, updated_at))
    into v_owner, v_last
    from public.party_rooms where code = p_code for update;
  v_found := found;

  if v_found then
    if v_owner is not null and v_owner <> v_uid and v_last > now() - interval '20 seconds' then
      raise exception 'forbidden';
    end if;
    update public.party_rooms set
      host_client_id = p_host_client_id,
      host_user_id   = v_uid,
      current        = p_current,
      queue          = v_queue,
      playback       = v_play,
      options        = v_opts,
      updated_at     = now()
    where code = p_code;
  else
    -- Au plus 3 salons par hôte, et le ménage ne se fait qu'à la création.
    delete from public.party_rooms
     where host_user_id = v_uid
       and code in (select code from public.party_rooms where host_user_id = v_uid
                    order by updated_at desc offset 2);
    delete from public.party_rooms where updated_at < now() - interval '6 hours';

    insert into public.party_rooms (code, host_client_id, host_user_id, current, queue, playback, options, updated_at)
    values (p_code, p_host_client_id, v_uid, p_current, v_queue, v_play, v_opts, now())
    on conflict (code) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'forbidden'; end if;  -- créé entre-temps par un autre
  end if;
end; $$;

create or replace function public.party_room_get_state(p_code text)
  returns table(current jsonb, queue jsonb, playback jsonb, options jsonb, updated_at timestamptz)
  language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'forbidden';
  end if;
  return query
    select r.current, r.queue, r.playback, r.options, r.updated_at
      from public.party_rooms r where r.code = p_code;
end; $$;

create or replace function public.party_room_close(p_code text) returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'forbidden';
  end if;
  delete from public.party_rooms
   where code = p_code
     and (host_user_id = v_uid
          or host_user_id is null
          or greatest(updated_at, coalesce(heartbeat_at, updated_at)) < now() - interval '20 seconds');
end; $$;

create or replace function public.party_room_publish(p_code text, p_public boolean, p_participants integer)
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then raise exception 'forbidden'; end if;
  if p_code is null or length(p_code) <> 6 then raise exception 'invalide'; end if;

  if p_public then
    update public.party_rooms set is_public = false
     where host_user_id = v_uid and code <> p_code and is_public;
  end if;

  -- Un salon qui n'est pas le nôtre n'est jamais touché, sauf s'il est resté silencieux.
  update public.party_rooms set
    is_public    = coalesce(p_public, false),
    participants = greatest(1, least(coalesce(p_participants, 1), 100)),
    heartbeat_at = now(),
    host_user_id = v_uid
  where code = p_code
    and (host_user_id = v_uid
         or host_user_id is null
         or greatest(updated_at, coalesce(heartbeat_at, updated_at)) < now() - interval '20 seconds');
end; $$;
