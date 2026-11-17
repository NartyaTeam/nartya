-- Thèmes communautaires (palier 1) : un thème est une palette de couleurs, jamais du code.
-- La validation du JSON est refaite ici : le client n'est pas digne de confiance.
-- Aucune policy : tout passe par des RPC security definer, la table n'est pas lisible en direct.

create table public.themes (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 200),
  data        jsonb not null,
  installs    integer not null default 0,
  status      text not null default 'published' check (status in ('published', 'removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index themes_published_idx on public.themes (status, installs desc, created_at desc);
create index themes_author_idx on public.themes (author_id);

create table public.theme_installs (
  theme_id   uuid not null references public.themes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (theme_id, user_id)
);

alter table public.themes enable row level security;
alter table public.theme_installs enable row level security;

-- Palette valide : version 1, les 10 couleurs en #rrggbb, rien d'autre de retenu.
create function public.normalize_theme_data(p_data jsonb) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v text;
  colors jsonb := '{}'::jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or (p_data ->> 'v') is distinct from '1' then
    raise exception 'theme_invalide';
  end if;
  foreach k in array array['bg','bg2','surface','surface2','border','text','muted','primary','accent','sakura'] loop
    v := p_data -> 'colors' ->> k;
    if v is null or v !~* '^#[0-9a-f]{6}$' then raise exception 'theme_couleur_invalide'; end if;
    colors := colors || jsonb_build_object(k, lower(v));
  end loop;
  return jsonb_build_object('v', 1, 'colors', colors, 'grain', coalesce((p_data ->> 'grain')::boolean, true));
end;
$$;

-- Publie un thème, ou met à jour le sien quand `p_id` est donné.
create function public.publish_theme(p_name text, p_description text, p_data jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_name text := left(regexp_replace(coalesce(trim(p_name), ''), '[[:cntrl:]<>]', '', 'g'), 40);
  v_desc text := left(regexp_replace(coalesce(trim(p_description), ''), '[[:cntrl:]<>]', '', 'g'), 200);
  v_data jsonb;
  v_out  uuid;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (auth.jwt() ->> 'is_anonymous')::boolean is true then raise exception 'guest_not_allowed'; end if;
  if public.is_banned() then raise exception 'account_banned'; end if;
  if char_length(v_name) < 2 then raise exception 'theme_nom_invalide'; end if;
  v_data := public.normalize_theme_data(p_data);

  if p_id is null then
    -- Pas d'inondation de la galerie : 5 thèmes publiés par compte, 3 créations par jour.
    if (select count(*) from public.themes where author_id = v_me and status = 'published') >= 5 then
      raise exception 'theme_limite';
    end if;
    if (select count(*) from public.themes where author_id = v_me and created_at > now() - interval '1 day') >= 3 then
      raise exception 'theme_trop_rapide';
    end if;
    insert into public.themes (author_id, name, description, data)
    values (v_me, v_name, v_desc, v_data)
    returning id into v_out;
  else
    update public.themes
       set name = v_name, description = v_desc, data = v_data, updated_at = now()
     where id = p_id and author_id = v_me and status = 'published'
    returning id into v_out;
    if v_out is null then raise exception 'theme_introuvable'; end if;
  end if;
  return v_out;
end;
$$;

-- `p_sort` : popular | recent | mine. Les thèmes retirés ne sortent jamais, même pour leur auteur.
create function public.list_themes(p_sort text default 'popular', p_query text default null,
                                   p_offset integer default 0, lim integer default 24)
returns table (
  id uuid, name text, description text, data jsonb, installs integer, created_at timestamptz,
  author_id uuid, handle text, username text, avatar text, avatar_custom text, installed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.description, t.data, t.installs, t.created_at,
         t.author_id, p.handle, p.username, p.avatar, p.avatar_custom,
         exists (select 1 from public.theme_installs i where i.theme_id = t.id and i.user_id = auth.uid())
  from public.themes t
  left join public.profiles p on p.id = t.author_id
  where auth.uid() is not null
    and t.status = 'published'
    and (p_sort <> 'mine' or t.author_id = auth.uid())
    and (p_query is null or t.name ilike '%' || replace(replace(left(p_query, 40), '%', ''), '_', '') || '%')
  order by case when p_sort = 'recent' or p_sort = 'mine' then null else t.installs end desc nulls last,
           t.created_at desc
  offset greatest(p_offset, 0)
  limit least(greatest(lim, 1), 48);
$$;

-- Installation comptée une fois par compte et par thème.
create function public.record_theme_install(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (auth.jwt() ->> 'is_anonymous')::boolean is true then return; end if;
  if not exists (select 1 from public.themes where id = p_id and status = 'published') then return; end if;
  insert into public.theme_installs (theme_id, user_id) values (p_id, v_me) on conflict do nothing;
  if found then
    update public.themes set installs = installs + 1 where id = p_id;
  end if;
end;
$$;

-- Retire un thème : son auteur, ou un admin.
create function public.remove_theme(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  update public.themes set status = 'removed', updated_at = now()
   where id = p_id and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'theme_introuvable'; end if;
end;
$$;

revoke all on function public.normalize_theme_data(jsonb) from public, anon, authenticated;
revoke all on function public.publish_theme(text, text, jsonb, uuid) from public, anon;
revoke all on function public.list_themes(text, text, integer, integer) from public, anon;
revoke all on function public.record_theme_install(uuid) from public, anon;
revoke all on function public.remove_theme(uuid) from public, anon;
grant execute on function public.publish_theme(text, text, jsonb, uuid) to authenticated;
grant execute on function public.list_themes(text, text, integer, integer) to authenticated;
grant execute on function public.record_theme_install(uuid) to authenticated;
grant execute on function public.remove_theme(uuid) to authenticated;
