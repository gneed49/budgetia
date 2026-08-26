create table public.budget_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'shared',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_spaces_name_length check (char_length(btrim(name)) between 2 and 50),
  constraint budget_spaces_kind_value check (kind in ('personal', 'shared'))
);

create unique index budget_spaces_one_personal_per_user_key
  on public.budget_spaces (created_by)
  where kind = 'personal';
create index budget_spaces_created_by_idx on public.budget_spaces (created_by);

create table public.budget_space_members (
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id),
  constraint budget_space_members_role_value check (role in ('owner', 'editor'))
);

create index budget_space_members_user_id_idx
  on public.budget_space_members (user_id, joined_at);

create table public.budget_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint budget_invitations_email_length check (char_length(btrim(email)) between 3 and 320),
  constraint budget_invitations_status_value check (status in ('pending', 'accepted', 'revoked'))
);

create unique index budget_invitations_pending_email_key
  on public.budget_invitations (space_id, lower(btrim(email)))
  where status = 'pending';
create index budget_invitations_invited_by_idx
  on public.budget_invitations (invited_by, created_at desc);
create index budget_invitations_email_status_idx
  on public.budget_invitations (lower(btrim(email)), status, created_at desc);

insert into public.budget_spaces (name, kind, created_by)
select 'Mon budget', 'personal', auth_user.id
from auth.users as auth_user
on conflict do nothing;

insert into public.budget_space_members (space_id, user_id, role)
select space.id, space.created_by, 'owner'
from public.budget_spaces as space
where space.kind = 'personal'
on conflict do nothing;

alter table public.categories add column space_id uuid;
alter table public.expenses add column space_id uuid;
alter table public.budget_settings add column space_id uuid;

update public.categories as category
set space_id = space.id
from public.budget_spaces as space
where space.kind = 'personal'
  and space.created_by = category.user_id;

update public.expenses as expense
set space_id = space.id
from public.budget_spaces as space
where space.kind = 'personal'
  and space.created_by = expense.user_id;

update public.budget_settings as settings
set space_id = space.id
from public.budget_spaces as space
where space.kind = 'personal'
  and space.created_by = settings.user_id;

alter table public.categories alter column space_id set not null;
alter table public.expenses alter column space_id set not null;
alter table public.budget_settings alter column space_id set not null;

alter table public.categories
  add constraint categories_space_id_fkey
  foreign key (space_id) references public.budget_spaces(id) on delete cascade;
alter table public.categories
  add constraint categories_space_id_id_key unique (space_id, id);

alter table public.expenses
  add constraint expenses_space_id_fkey
  foreign key (space_id) references public.budget_spaces(id) on delete cascade;
alter table public.expenses drop constraint expenses_user_category_fkey;
alter table public.expenses
  add constraint expenses_space_category_fkey
  foreign key (space_id, category_id)
  references public.categories(space_id, id);

alter table public.budget_settings drop constraint budget_settings_pkey;
alter table public.budget_settings
  add constraint budget_settings_space_id_fkey
  foreign key (space_id) references public.budget_spaces(id) on delete cascade;
alter table public.budget_settings
  add constraint budget_settings_pkey primary key (space_id);

drop index public.categories_active_name_key;
drop index public.categories_user_id_idx;
drop index public.expenses_user_request_key;
drop index public.expenses_user_spent_at_idx;
drop index public.expenses_user_category_spent_at_idx;

create unique index categories_active_name_key
  on public.categories (space_id, lower(btrim(name)))
  where archived_at is null;
create index categories_space_id_idx on public.categories (space_id);
create unique index expenses_space_user_request_key
  on public.expenses (space_id, user_id, request_id)
  where request_id is not null;
create index expenses_space_spent_at_idx
  on public.expenses (space_id, spent_at desc);
create index expenses_space_category_spent_at_idx
  on public.expenses (space_id, category_id, spent_at desc);

create trigger budget_spaces_set_updated_at
before update on public.budget_spaces
for each row execute function private.set_updated_at();

create or replace function private.seed_budget_space(
  p_space_id uuid,
  p_actor uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.budget_settings (space_id, user_id)
  values (p_space_id, p_actor)
  on conflict (space_id) do nothing;

  insert into public.categories (space_id, user_id, name, color, icon)
  values
    (p_space_id, p_actor, 'Alimentation', '#52B788', 'basket-outline'),
    (p_space_id, p_actor, 'Logement', '#93B29A', 'home-outline'),
    (p_space_id, p_actor, 'Transport', '#F46F61', 'bus-outline'),
    (p_space_id, p_actor, 'Loisirs', '#26364D', 'game-controller-outline'),
    (p_space_id, p_actor, 'Santé', '#F2C15D', 'medkit-outline'),
    (p_space_id, p_actor, 'Abonnements', '#7A77B9', 'repeat-outline')
  on conflict do nothing;
end;
$$;

create or replace function private.initialize_budgetia_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_space_id uuid;
begin
  insert into public.budget_spaces (name, kind, created_by)
  values ('Mon budget', 'personal', new.id)
  returning id into personal_space_id;

  insert into public.budget_space_members (space_id, user_id, role)
  values (personal_space_id, new.id, 'owner');

  perform private.seed_budget_space(personal_space_id, new.id);
  return new;
end;
$$;

revoke execute on function private.seed_budget_space(uuid, uuid)
from public, anon, authenticated;
revoke execute on function private.initialize_budgetia_user()
from public, anon, authenticated;

alter table public.budget_spaces enable row level security;
alter table public.budget_space_members enable row level security;
alter table public.budget_invitations enable row level security;

drop policy categories_select_own on public.categories;
drop policy categories_insert_own on public.categories;
drop policy categories_update_own on public.categories;
drop policy expenses_select_own on public.expenses;
drop policy expenses_insert_own on public.expenses;
drop policy expenses_delete_own on public.expenses;
drop policy budget_settings_select_own on public.budget_settings;
drop policy budget_settings_insert_own on public.budget_settings;
drop policy budget_settings_update_own on public.budget_settings;

create policy budget_space_members_select_own
on public.budget_space_members for select to authenticated
using ((select auth.uid()) = user_id);

create policy budget_spaces_select_member
on public.budget_spaces for select to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = budget_spaces.id
      and member.user_id = (select auth.uid())
  )
);

create policy budget_invitations_select_recipient_or_sender
on public.budget_invitations for select to authenticated
using (
  invited_by = (select auth.uid())
  or lower(btrim(email)) = lower(coalesce((select auth.jwt())->>'email', ''))
);

create policy categories_select_member
on public.categories for select to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy categories_insert_member
on public.categories for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy categories_update_member
on public.categories for update to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy expenses_select_member
on public.expenses for select to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = expenses.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy expenses_insert_member
on public.expenses for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = expenses.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy expenses_delete_member
on public.expenses for delete to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = expenses.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy budget_settings_select_member
on public.budget_settings for select to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy budget_settings_insert_member
on public.budget_settings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy budget_settings_update_member
on public.budget_settings for update to authenticated
using (
  exists (
    select 1 from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = budget_settings.space_id
      and member.user_id = (select auth.uid())
  )
);

create or replace function public.create_shared_budget(p_name text)
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
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 50 then
    raise exception 'budget name must contain between 2 and 50 characters'
      using errcode = '22023';
  end if;

  insert into public.budget_spaces (name, kind, created_by)
  values (btrim(p_name), 'shared', actor)
  returning * into result;

  insert into public.budget_space_members (space_id, user_id, role)
  values (result.id, actor, 'owner');
  perform private.seed_budget_space(result.id, actor);
  return result;
end;
$$;

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
  ) then
    raise exception 'shared budget membership required' using errcode = '42501';
  end if;

  select lower(auth_user.email), auth_user.id
  into actor_email, invited_user_id
  from auth.users as auth_user
  where lower(auth_user.email) = normalized_email
     or auth_user.id = actor
  order by (auth_user.id = actor) desc
  limit 1;

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

create or replace function public.accept_budget_invitation(p_invitation_id uuid)
returns public.budget_spaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
  invitation public.budget_invitations;
  result public.budget_spaces;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select lower(auth_user.email) into actor_email
  from auth.users as auth_user
  where auth_user.id = actor;

  select pending.* into invitation
  from public.budget_invitations as pending
  where pending.id = p_invitation_id
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or lower(btrim(invitation.email)) <> actor_email then
    raise exception 'pending invitation not found' using errcode = '42501';
  end if;

  insert into public.budget_space_members (space_id, user_id, role)
  values (invitation.space_id, actor, 'editor')
  on conflict (space_id, user_id) do nothing;

  update public.budget_invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  select space.* into strict result
  from public.budget_spaces as space
  where space.id = invitation.space_id;
  return result;
end;
$$;

create or replace function public.list_budget_invitations()
returns table (
  id uuid,
  space_id uuid,
  space_name text,
  email text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_email text;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select lower(auth_user.email) into actor_email
  from auth.users as auth_user
  where auth_user.id = actor;

  return query
  select
    invitation.id,
    invitation.space_id,
    space.name,
    invitation.email,
    invitation.status,
    invitation.created_at
  from public.budget_invitations as invitation
  join public.budget_spaces as space on space.id = invitation.space_id
  where invitation.status = 'pending'
    and (
      invitation.invited_by = actor
      or lower(btrim(invitation.email)) = actor_email
    )
  order by invitation.created_at desc;
end;
$$;

drop function public.create_budgetia_expense(bigint, uuid, text, date, text, text);

create function public.create_budgetia_expense(
  p_amount_cents bigint,
  p_category_id uuid,
  p_note text default '',
  p_spent_at date default current_date,
  p_source text default 'mobile',
  p_request_id text default null,
  p_space_id uuid default null
)
returns public.expenses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_space_id uuid := p_space_id;
  result public.expenses;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_space_id is null then
    select space.id into target_space_id
    from public.budget_spaces as space
    join public.budget_space_members as member on member.space_id = space.id
    where space.kind = 'personal' and member.user_id = actor
    limit 1;
  end if;
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = target_space_id and member.user_id = actor
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select expense.* into result
    from public.expenses as expense
    where expense.space_id = target_space_id
      and expense.user_id = actor
      and expense.request_id = p_request_id;
    if found then return result; end if;
  end if;

  insert into public.expenses (
    space_id, user_id, amount_cents, category_id, note, spent_at, source, request_id
  ) values (
    target_space_id,
    actor,
    p_amount_cents,
    p_category_id,
    btrim(coalesce(p_note, '')),
    p_spent_at,
    p_source,
    nullif(btrim(p_request_id), '')
  )
  on conflict (space_id, user_id, request_id) where request_id is not null do nothing
  returning * into result;

  if result.id is null and p_request_id is not null then
    select expense.* into strict result
    from public.expenses as expense
    where expense.space_id = target_space_id
      and expense.user_id = actor
      and expense.request_id = p_request_id;
  end if;
  return result;
end;
$$;

drop function public.get_budgetia_spending_summary(text, date, uuid[]);

create function public.get_budgetia_spending_summary(
  p_period text default 'month',
  p_reference_date date default current_date,
  p_category_ids uuid[] default null,
  p_space_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_space_id uuid := p_space_id;
  range_start date;
  range_end date;
  previous_start date;
  previous_end date;
  period_days integer;
  total_cents bigint;
  previous_total_cents bigint;
  transaction_count bigint;
  category_totals jsonb;
  series jsonb;
  comparison_percentage numeric;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_space_id is null then
    select space.id into target_space_id
    from public.budget_spaces as space
    join public.budget_space_members as member on member.space_id = space.id
    where space.kind = 'personal' and member.user_id = actor
    limit 1;
  end if;
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = target_space_id and member.user_id = actor
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  if p_period = 'week' then
    range_start := p_reference_date - (extract(isodow from p_reference_date)::integer - 1);
    range_end := range_start + 6;
  elsif p_period = 'month' then
    range_start := date_trunc('month', p_reference_date)::date;
    range_end := (date_trunc('month', p_reference_date) + interval '1 month - 1 day')::date;
  elsif p_period = 'year' then
    range_start := date_trunc('year', p_reference_date)::date;
    range_end := (date_trunc('year', p_reference_date) + interval '1 year - 1 day')::date;
  else
    raise exception 'period must be week, month, or year' using errcode = '22023';
  end if;

  period_days := range_end - range_start + 1;
  previous_end := range_start - 1;
  previous_start := previous_end - period_days + 1;

  select coalesce(sum(expense.amount_cents), 0), count(*)
  into total_cents, transaction_count
  from public.expenses as expense
  where expense.space_id = target_space_id
    and expense.spent_at between range_start and range_end
    and (
      p_category_ids is null
      or cardinality(p_category_ids) = 0
      or expense.category_id = any(p_category_ids)
    );

  select coalesce(sum(expense.amount_cents), 0)
  into previous_total_cents
  from public.expenses as expense
  where expense.space_id = target_space_id
    and expense.spent_at between previous_start and previous_end
    and (
      p_category_ids is null
      or cardinality(p_category_ids) = 0
      or expense.category_id = any(p_category_ids)
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'categoryId', grouped.category_id,
        'name', grouped.name,
        'color', grouped.color,
        'icon', grouped.icon,
        'amountCents', grouped.amount_cents,
        'percentage', case
          when total_cents = 0 then 0
          else round(grouped.amount_cents::numeric * 1000 / total_cents) / 10
        end
      ) order by grouped.amount_cents desc
    ),
    '[]'::jsonb
  ) into category_totals
  from (
    select
      expense.category_id,
      category.name,
      category.color,
      category.icon,
      sum(expense.amount_cents)::bigint as amount_cents
    from public.expenses as expense
    join public.categories as category
      on category.space_id = expense.space_id
     and category.id = expense.category_id
    where expense.space_id = target_space_id
      and expense.spent_at between range_start and range_end
      and (
        p_category_ids is null
        or cardinality(p_category_ids) = 0
        or expense.category_id = any(p_category_ids)
      )
    group by expense.category_id, category.name, category.color, category.icon
  ) as grouped;

  if p_period = 'week' then
    select jsonb_agg(
      jsonb_build_object(
        'key', day_value::date::text,
        'label', (array['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'])[extract(isodow from day_value)::integer],
        'amountCents', coalesce(daily.amount_cents, 0),
        'startDate', day_value::date::text,
        'endDate', day_value::date::text
      ) order by day_value
    ) into series
    from generate_series(range_start, range_end, interval '1 day') as generated(day_value)
    left join lateral (
      select sum(expense.amount_cents)::bigint as amount_cents
      from public.expenses as expense
      where expense.space_id = target_space_id
        and expense.spent_at = generated.day_value::date
        and (
          p_category_ids is null
          or cardinality(p_category_ids) = 0
          or expense.category_id = any(p_category_ids)
        )
    ) as daily on true;
  elsif p_period = 'month' then
    select jsonb_agg(
      jsonb_build_object(
        'key', bucket_start::text,
        'label', 'S' || bucket_number,
        'amountCents', coalesce(bucket.amount_cents, 0),
        'startDate', bucket_start::text,
        'endDate', least(bucket_start + 6, range_end)::text
      ) order by bucket_start
    ) into series
    from (
      select
        generated.bucket_start::date as bucket_start,
        (row_number() over (order by generated.bucket_start))::integer as bucket_number
      from generate_series(range_start, range_end, interval '7 days') as generated(bucket_start)
    ) as weeks
    left join lateral (
      select sum(expense.amount_cents)::bigint as amount_cents
      from public.expenses as expense
      where expense.space_id = target_space_id
        and expense.spent_at between weeks.bucket_start and least(weeks.bucket_start + 6, range_end)
        and (
          p_category_ids is null
          or cardinality(p_category_ids) = 0
          or expense.category_id = any(p_category_ids)
        )
    ) as bucket on true;
  else
    select jsonb_agg(
      jsonb_build_object(
        'key', to_char(month_start, 'YYYY-MM'),
        'label', (array['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'])[extract(month from month_start)::integer],
        'amountCents', coalesce(monthly.amount_cents, 0),
        'startDate', month_start::date::text,
        'endDate', (month_start + interval '1 month - 1 day')::date::text
      ) order by month_start
    ) into series
    from generate_series(range_start, range_end, interval '1 month') as generated(month_start)
    left join lateral (
      select sum(expense.amount_cents)::bigint as amount_cents
      from public.expenses as expense
      where expense.space_id = target_space_id
        and expense.spent_at between generated.month_start::date
          and (generated.month_start + interval '1 month - 1 day')::date
        and (
          p_category_ids is null
          or cardinality(p_category_ids) = 0
          or expense.category_id = any(p_category_ids)
        )
    ) as monthly on true;
  end if;

  comparison_percentage := case
    when previous_total_cents = 0 then null
    else round((total_cents - previous_total_cents)::numeric * 1000 / previous_total_cents) / 10
  end;

  return jsonb_build_object(
    'range', jsonb_build_object('startDate', range_start, 'endDate', range_end),
    'period', p_period,
    'totalCents', total_cents,
    'transactionCount', transaction_count,
    'categoryTotals', category_totals,
    'series', coalesce(series, '[]'::jsonb),
    'comparisonPercentage', comparison_percentage,
    'previousTotalCents', previous_total_cents
  );
end;
$$;

revoke all on public.budget_spaces from public, anon, authenticated;
revoke all on public.budget_space_members from public, anon, authenticated;
revoke all on public.budget_invitations from public, anon, authenticated;
revoke all on public.categories from public, anon, authenticated;
revoke all on public.expenses from public, anon, authenticated;
revoke all on public.budget_settings from public, anon, authenticated;

revoke execute on function public.create_shared_budget(text) from public, anon, authenticated;
revoke execute on function public.invite_budget_member(uuid, text) from public, anon, authenticated;
revoke execute on function public.accept_budget_invitation(uuid) from public, anon, authenticated;
revoke execute on function public.list_budget_invitations() from public, anon, authenticated;
revoke execute on function public.create_budgetia_expense(bigint, uuid, text, date, text, text, uuid)
from public, anon, authenticated;
revoke execute on function public.get_budgetia_spending_summary(text, date, uuid[], uuid)
from public, anon, authenticated;

grant select on public.budget_spaces to authenticated;
grant select on public.budget_space_members to authenticated;
grant select on public.budget_invitations to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant select, insert, update on public.budget_settings to authenticated;

grant execute on function public.create_shared_budget(text) to authenticated;
grant execute on function public.invite_budget_member(uuid, text) to authenticated;
grant execute on function public.accept_budget_invitation(uuid) to authenticated;
grant execute on function public.list_budget_invitations() to authenticated;
grant execute on function public.create_budgetia_expense(bigint, uuid, text, date, text, text, uuid)
to authenticated;
grant execute on function public.get_budgetia_spending_summary(text, date, uuid[], uuid)
to authenticated;
