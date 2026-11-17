-- Durcissement des droits (audit du 2026-11-17). Aucun changement de comportement : la RLS
-- refusait déjà ces accès, on retire les privilèges qu'elle n'avait plus à garder.

-- 1. TRUNCATE, TRIGGER et REFERENCES ne servent à aucun client de l'API ; anon n'écrit nulle part
--    (ses requêtes n'ont pas d'identité, toutes les policies d'écriture testent auth.uid()).
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

-- Les tables créées plus tard ne repartent pas avec ces privilèges.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;

-- 2. Une fonction de déclencheur n'a pas à être appelable depuis l'API.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 3. is_premium(uid) révélait le statut premium de n'importe quel compte à qui connaît son
--    identifiant. Le client ne l'appelle pas ; update_my_profile l'utilise en interne (security
--    definer, donc avec les droits de son propriétaire).
revoke execute on function public.is_premium(uuid) from public, anon, authenticated;
