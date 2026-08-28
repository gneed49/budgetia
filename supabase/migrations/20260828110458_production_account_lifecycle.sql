-- Production lifecycle for shared spaces and account deletion.
-- Shared records keep their financial history when their author deletes an
-- account; personal records still disappear with the personal budget space.

alter table public.categories
  drop constraint categories_user_id_fkey;
alter table public.categories
  alter column user_id drop not null;
alter table public.categories
  add constraint categories_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.expenses
  drop constraint expenses_user_id_fkey;
alter table public.expenses
  alter column user_id drop not null;
alter table public.expenses
  add constraint expenses_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.budget_settings
  drop constraint budget_settings_user_id_fkey;
alter table public.budget_settings
  alter column user_id drop not null;
alter table public.budget_settings
  add constraint budget_settings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create unique index budget_space_members_one_owner_key
  on public.budget_space_members (space_id)
  where role = 'owner';

-- A row trigger cannot distinguish a user deletion from an FK cascade safely.
-- Protect the fallback row at the RLS boundary instead, so deleting an entire
-- space/account can still cascade without leaving orphaned data.
create or replace function private.protect_fallback_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.is_fallback is distinct from old.is_fallback then
    raise exception 'fallback category status cannot be changed' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop policy categories_delete_member on public.categories;
create policy categories_delete_member
on public.categories for delete to authenticated
using (
  not is_fallback
  and exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
);

drop policy budget_settings_update_member on public.budget_settings;
create policy budget_settings_update_member
on public.budget_settings for update to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
);

-- Invitations affect membership and are therefore reserved to the current
-- owner. Editors keep full budget CRUD access, but cannot add other people.
create or replace function public.invite_budget_member(
  p_space_id uuid,
  p_email text
)
returns public.budget_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  actor_email text;
  invited_user_id uuid;
  result public.budget_invitations;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(normalized_email) > 320 then
    raise exception 'invalid invitation email' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.budget_spaces as space
    join public.budget_space_members as member on member.space_id = space.id
    where space.id = p_space_id
      and space.kind = 'shared'
      and member.user_id = actor
      and member.role = 'owner'
  ) then
    raise exception 'shared budget ownership required' using errcode = '42501';
  end if;

  select lower(auth_user.email) into actor_email
  from auth.users as auth_user
  where auth_user.id = actor;
  if normalized_email = actor_email then
    raise exception 'cannot invite your own account' using errcode = '22023';
  end if;

  select auth_user.id into invited_user_id
  from auth.users as auth_user
  where lower(auth_user.email) = normalized_email;
  if invited_user_id is not null and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = p_space_id and member.user_id = invited_user_id
  ) then
    raise exception 'user is already a member' using errcode = '23505';
  end if;

  select invitation.* into result
  from public.budget_invitations as invitation
  where invitation.space_id = p_space_id
    and lower(btrim(invitation.email)) = normalized_email
    and invitation.status = 'pending';
  if found then
    return result;
  end if;

  insert into public.budget_invitations (space_id, email, invited_by)
  values (p_space_id, normalized_email, actor)
  returning * into result;
  return result;
end;
$$;

create function public.list_budget_space_members(p_space_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.budget_space_members as membership
    where membership.space_id = p_space_id
      and membership.user_id = actor
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  return query
  select
    membership.user_id,
    auth_user.email::text,
    membership.role,
    membership.joined_at
  from public.budget_space_members as membership
  join auth.users as auth_user on auth_user.id = membership.user_id
  where membership.space_id = p_space_id
  order by
    case membership.role when 'owner' then 0 else 1 end,
    membership.joined_at,
    membership.user_id;
end;
$$;

create function public.rename_shared_budget(
  p_space_id uuid,
  p_name text
)
returns public.budget_spaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  result public.budget_spaces;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 2 and 50 then
    raise exception 'budget name must contain between 2 and 50 characters'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.budget_spaces as space
    join public.budget_space_members as membership on membership.space_id = space.id
    where space.id = p_space_id
      and space.kind = 'shared'
      and membership.user_id = actor
      and membership.role = 'owner'
  ) then
    raise exception 'shared budget ownership required' using errcode = '42501';
  end if;

  update public.budget_spaces
  set name = normalized_name
  where id = p_space_id
  returning * into strict result;
  return result;
end;
$$;

create function public.transfer_budget_space_ownership(
  p_space_id uuid,
  p_new_owner_user_id uuid
)
returns public.budget_spaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.budget_spaces;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_new_owner_user_id = actor then
    raise exception 'new owner must be another member' using errcode = '22023';
  end if;

  perform 1
  from public.budget_spaces as space
  where space.id = p_space_id
    and space.kind = 'shared'
  for update;
  if not found then
    raise exception 'shared budget not found' using errcode = '42501';
  end if;

  perform 1
  from public.budget_space_members as membership
  where membership.space_id = p_space_id
    and membership.user_id in (actor, p_new_owner_user_id)
  order by membership.user_id
  for update;

  if not exists (
    select 1
    from public.budget_space_members as membership
    where membership.space_id = p_space_id
      and membership.user_id = actor
      and membership.role = 'owner'
  ) then
    raise exception 'shared budget ownership required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.budget_space_members as membership
    where membership.space_id = p_space_id
      and membership.user_id = p_new_owner_user_id
      and membership.role = 'editor'
  ) then
    raise exception 'new owner must be an editor of this budget'
      using errcode = '22023';
  end if;

  update public.budget_space_members
  set role = 'editor'
  where space_id = p_space_id and user_id = actor;

  update public.budget_space_members
  set role = 'owner'
  where space_id = p_space_id and user_id = p_new_owner_user_id;

  update public.budget_spaces
  set created_by = p_new_owner_user_id
  where id = p_space_id
  returning * into strict result;
  return result;
end;
$$;

create function public.remove_budget_space_member(
  p_space_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_member_user_id = actor then
    raise exception 'use leave_shared_budget to leave a budget'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.budget_spaces as space
    join public.budget_space_members as owner_membership
      on owner_membership.space_id = space.id
    where space.id = p_space_id
      and space.kind = 'shared'
      and owner_membership.user_id = actor
      and owner_membership.role = 'owner'
  ) then
    raise exception 'shared budget ownership required' using errcode = '42501';
  end if;

  delete from public.budget_space_members
  where space_id = p_space_id
    and user_id = p_member_user_id
    and role = 'editor';
  if not found then
    raise exception 'removable member not found' using errcode = '22023';
  end if;
end;
$$;

create function public.leave_shared_budget(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.budget_space_members
  where space_id = p_space_id
    and user_id = actor
    and role = 'editor'
    and exists (
      select 1
      from public.budget_spaces as space
      where space.id = p_space_id and space.kind = 'shared'
    );
  if not found then
    raise exception 'an owner must transfer ownership or delete the budget first'
      using errcode = '22023';
  end if;
end;
$$;

create function public.delete_shared_budget(
  p_space_id uuid,
  p_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  space_name text;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select space.name into space_name
  from public.budget_spaces as space
  join public.budget_space_members as membership on membership.space_id = space.id
  where space.id = p_space_id
    and space.kind = 'shared'
    and membership.user_id = actor
    and membership.role = 'owner'
  for update of space;

  if space_name is null then
    raise exception 'shared budget ownership required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirmation, '')) <> space_name then
    raise exception 'confirmation must match the budget name'
      using errcode = '22023';
  end if;

  delete from public.budget_spaces where id = p_space_id;
  return p_space_id;
end;
$$;

create function public.revoke_budget_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.budget_invitations as invitation
  set status = 'revoked'
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and exists (
      select 1
      from public.budget_space_members as membership
      where membership.space_id = invitation.space_id
        and membership.user_id = actor
        and membership.role = 'owner'
    );
  if not found then
    raise exception 'revocable invitation not found' using errcode = '42501';
  end if;
end;
$$;

create function public.get_account_deletion_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'personalExpenseCount', (
      select count(*)
      from public.expenses as expense
      join public.budget_spaces as space on space.id = expense.space_id
      where space.kind = 'personal' and space.created_by = actor
    ),
    'sharedMembershipCount', (
      select count(*)
      from public.budget_space_members as membership
      join public.budget_spaces as space on space.id = membership.space_id
      where membership.user_id = actor and space.kind = 'shared'
    ),
    'ownedSharedSpaceCount', (
      select count(*)
      from public.budget_spaces as space
      where space.kind = 'shared' and space.created_by = actor
    ),
    'sharedExpenseCountKept', (
      select count(*)
      from public.expenses as expense
      join public.budget_spaces as space on space.id = expense.space_id
      where space.kind = 'shared' and expense.user_id = actor
    )
  ) into result;
  return result;
end;
$$;

create or replace function private.handle_budgetia_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_space record;
  successor uuid;
begin
  delete from public.budget_spaces
  where kind = 'personal' and created_by = old.id;

  for owned_space in
    select space.id
    from public.budget_spaces as space
    where space.kind = 'shared' and space.created_by = old.id
    order by space.id
    for update
  loop
    successor := null;
    select membership.user_id into successor
    from public.budget_space_members as membership
    where membership.space_id = owned_space.id
      and membership.user_id <> old.id
    order by membership.joined_at, membership.user_id
    limit 1
    for update;

    if successor is null then
      delete from public.budget_spaces where id = owned_space.id;
    else
      update public.budget_space_members
      set role = 'editor'
      where space_id = owned_space.id and role = 'owner';

      update public.budget_space_members
      set role = 'owner'
      where space_id = owned_space.id and user_id = successor;

      update public.budget_spaces
      set created_by = successor
      where id = owned_space.id;
    end if;
  end loop;
  return old;
end;
$$;

create trigger budgetia_before_user_delete
before delete on auth.users
for each row execute function private.handle_budgetia_user_deletion();

revoke all on public.budget_settings from public, anon, authenticated;
grant select, insert on public.budget_settings to authenticated;
grant update (currency, monthly_budget_cents) on public.budget_settings
to authenticated;

revoke execute on function public.list_budget_space_members(uuid)
from public, anon, authenticated;
revoke execute on function public.rename_shared_budget(uuid, text)
from public, anon, authenticated;
revoke execute on function public.transfer_budget_space_ownership(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.remove_budget_space_member(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.leave_shared_budget(uuid)
from public, anon, authenticated;
revoke execute on function public.delete_shared_budget(uuid, text)
from public, anon, authenticated;
revoke execute on function public.revoke_budget_invitation(uuid)
from public, anon, authenticated;
revoke execute on function public.get_account_deletion_impact()
from public, anon, authenticated;
revoke execute on function private.handle_budgetia_user_deletion()
from public, anon, authenticated, service_role;

grant execute on function public.list_budget_space_members(uuid) to authenticated;
grant execute on function public.rename_shared_budget(uuid, text) to authenticated;
grant execute on function public.transfer_budget_space_ownership(uuid, uuid)
to authenticated;
grant execute on function public.remove_budget_space_member(uuid, uuid)
to authenticated;
grant execute on function public.leave_shared_budget(uuid) to authenticated;
grant execute on function public.delete_shared_budget(uuid, text) to authenticated;
grant execute on function public.revoke_budget_invitation(uuid) to authenticated;
grant execute on function public.get_account_deletion_impact() to authenticated;
