create table public.category_budget_limits (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null,
  category_color text not null,
  category_icon text not null,
  month date not null,
  limit_cents bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_budget_limits_month_start
    check (month = date_trunc('month', month)::date),
  constraint category_budget_limits_amount_range
    check (limit_cents between 1 and 10000000000),
  constraint category_budget_limits_name_length
    check (char_length(btrim(category_name)) between 2 and 40),
  constraint category_budget_limits_color_format
    check (category_color ~ '^#[0-9A-F]{6}$')
);

create unique index category_budget_limits_active_category_month_key
  on public.category_budget_limits (space_id, category_id, month)
  where category_id is not null;
create index category_budget_limits_space_month_idx
  on public.category_budget_limits (space_id, month);
create index category_budget_limits_category_id_idx
  on public.category_budget_limits (category_id)
  where category_id is not null;
create index category_budget_limits_created_by_idx
  on public.category_budget_limits (created_by)
  where created_by is not null;
create index category_budget_limits_updated_by_idx
  on public.category_budget_limits (updated_by)
  where updated_by is not null;

create function private.prepare_category_budget_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  selected_category public.categories;
begin
  if actor is null
    and tg_op = 'UPDATE'
    and (new.space_id, new.category_id, new.month, new.limit_cents)
      is not distinct from (old.space_id, old.category_id, old.month, old.limit_cents) then
    return new;
  end if;
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
    and old.category_id is not null
    and new.category_id is null
    and (new.space_id, new.month, new.limit_cents)
      is not distinct from (old.space_id, old.month, old.limit_cents) then
    new.updated_by := actor;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (new.space_id, new.category_id, new.month)
      is distinct from (old.space_id, old.category_id, old.month) then
    raise exception 'budget limit identity is immutable' using errcode = '22023';
  end if;
  if new.category_id is null then
    raise exception 'an active category is required' using errcode = '22023';
  end if;

  select category.* into selected_category
  from public.categories as category
  where category.id = new.category_id
    and category.space_id = new.space_id
    and category.archived_at is null;

  if selected_category.id is null then
    raise exception 'category not found in this budget' using errcode = '22023';
  end if;

  new.category_name := selected_category.name;
  new.category_color := upper(selected_category.color);
  new.category_icon := selected_category.icon;
  new.updated_by := actor;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := actor;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger category_budget_limits_prepare
before insert or update on public.category_budget_limits
for each row execute function private.prepare_category_budget_limit();

create function private.remove_future_category_budget_limits()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.category_budget_limits
  where category_id = old.id
    and month > date_trunc('month', current_date)::date;
  return old;
end;
$$;

create trigger categories_remove_future_budget_limits
before delete on public.categories
for each row execute function private.remove_future_category_budget_limits();

revoke execute on function private.prepare_category_budget_limit()
from public, anon, authenticated;
revoke execute on function private.remove_future_category_budget_limits()
from public, anon, authenticated;

alter table public.category_budget_limits enable row level security;

create policy category_budget_limits_select_member
on public.category_budget_limits for select to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = category_budget_limits.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy category_budget_limits_insert_member
on public.category_budget_limits for insert to authenticated
with check (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = category_budget_limits.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy category_budget_limits_update_member
on public.category_budget_limits for update to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = category_budget_limits.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = category_budget_limits.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy category_budget_limits_delete_member
on public.category_budget_limits for delete to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = category_budget_limits.space_id
      and member.user_id = (select auth.uid())
  )
);

create function public.set_category_budget_limit(
  p_space_id uuid,
  p_category_id uuid,
  p_month date,
  p_limit_cents bigint
)
returns public.category_budget_limits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_month date := date_trunc('month', p_month)::date;
  result public.category_budget_limits;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_limit_cents not between 1 and 10000000000 then
    raise exception 'budget limit is out of range' using errcode = '22023';
  end if;

  insert into public.category_budget_limits (
    space_id,
    category_id,
    category_name,
    category_color,
    category_icon,
    month,
    limit_cents
  ) values (
    p_space_id,
    p_category_id,
    'pending',
    '#000000',
    'wallet-outline',
    normalized_month,
    p_limit_cents
  )
  on conflict (space_id, category_id, month)
    where category_id is not null
  do update set limit_cents = excluded.limit_cents
  returning * into result;

  return result;
end;
$$;

create function public.delete_category_budget_limit(
  p_space_id uuid,
  p_category_id uuid,
  p_month date
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.category_budget_limits
  where space_id = p_space_id
    and category_id = p_category_id
    and month = date_trunc('month', p_month)::date;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create function public.get_category_budget_positions(
  p_space_id uuid,
  p_month date default current_date
)
returns table (
  limit_id uuid,
  category_id uuid,
  category_name text,
  category_color text,
  category_icon text,
  month date,
  limit_cents bigint,
  spent_cents bigint,
  remaining_cents bigint,
  percentage numeric,
  status text,
  previous_spent_cents bigint,
  trend_percentage numeric,
  projected_cents bigint,
  category_active boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_month date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  previous_start date := (date_trunc('month', p_month) - interval '1 month')::date;
  previous_end date := (date_trunc('month', p_month) - interval '1 day')::date;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = p_space_id
      and member.user_id = (select auth.uid())
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  return query
  with current_spending as (
    select expense.category_id, coalesce(sum(expense.amount_cents), 0)::bigint as amount
    from public.expenses as expense
    where expense.space_id = p_space_id
      and expense.spent_at between normalized_month and month_end
    group by expense.category_id
  ),
  previous_spending as (
    select expense.category_id, coalesce(sum(expense.amount_cents), 0)::bigint as amount
    from public.expenses as expense
    where expense.space_id = p_space_id
      and expense.spent_at between previous_start and previous_end
    group by expense.category_id
  ),
  positions as (
    select
      budget_limit.id,
      budget_limit.category_id,
      coalesce(category.name, budget_limit.category_name) as category_name,
      coalesce(category.color, budget_limit.category_color) as category_color,
      coalesce(category.icon, budget_limit.category_icon) as category_icon,
      budget_limit.month,
      budget_limit.limit_cents,
      coalesce(current_spending.amount, 0)::bigint as spent,
      coalesce(previous_spending.amount, 0)::bigint as previous_spent,
      category.id is not null and category.archived_at is null as is_active
    from public.category_budget_limits as budget_limit
    left join public.categories as category on category.id = budget_limit.category_id
    left join current_spending on current_spending.category_id = budget_limit.category_id
    left join previous_spending on previous_spending.category_id = budget_limit.category_id
    where budget_limit.space_id = p_space_id
      and budget_limit.month = normalized_month
  )
  select
    positions.id,
    positions.category_id,
    positions.category_name,
    positions.category_color,
    positions.category_icon,
    positions.month,
    positions.limit_cents,
    positions.spent,
    positions.limit_cents - positions.spent,
    round((positions.spent::numeric * 100) / positions.limit_cents, 1),
    case
      when positions.spent > positions.limit_cents then 'exceeded'
      when positions.spent::numeric * 100 >= positions.limit_cents::numeric * 75 then 'watch'
      else 'healthy'
    end,
    positions.previous_spent,
    case
      when positions.previous_spent = 0 then null
      else round(
        ((positions.spent - positions.previous_spent)::numeric * 100)
          / positions.previous_spent,
        1
      )
    end,
    case
      when normalized_month > date_trunc('month', current_date)::date then 0
      when normalized_month < date_trunc('month', current_date)::date then positions.spent
      else round(
        positions.spent::numeric
          * extract(day from month_end)
          / greatest(extract(day from current_date), 1)
      )::bigint
    end,
    positions.is_active
  from positions
  order by
    case
      when positions.spent > positions.limit_cents then 0
      when positions.spent::numeric * 100 >= positions.limit_cents::numeric * 75 then 1
      else 2
    end,
    positions.spent desc,
    positions.category_name;
end;
$$;

revoke all on public.category_budget_limits from public, anon, authenticated;
grant select, insert, delete on public.category_budget_limits to authenticated;
grant update (limit_cents) on public.category_budget_limits to authenticated;

revoke execute on function public.set_category_budget_limit(uuid, uuid, date, bigint)
from public, anon, authenticated;
revoke execute on function public.delete_category_budget_limit(uuid, uuid, date)
from public, anon, authenticated;
revoke execute on function public.get_category_budget_positions(uuid, date)
from public, anon, authenticated;

grant execute on function public.set_category_budget_limit(uuid, uuid, date, bigint)
to authenticated;
grant execute on function public.delete_category_budget_limit(uuid, uuid, date)
to authenticated;
grant execute on function public.get_category_budget_positions(uuid, date)
to authenticated;
