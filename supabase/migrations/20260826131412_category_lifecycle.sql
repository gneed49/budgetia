alter table public.categories
  add column is_fallback boolean not null default false;

update public.categories as category
set is_fallback = true
where category.archived_at is null
  and lower(btrim(category.name)) = 'non classée';

insert into public.categories (
  space_id,
  user_id,
  name,
  color,
  icon,
  is_fallback
)
select
  space.id,
  space.created_by,
  'Non classée',
  '#8B95A5',
  'help-circle-outline',
  true
from public.budget_spaces as space
where not exists (
  select 1
  from public.categories as category
  where category.space_id = space.id
    and category.is_fallback
);

create unique index categories_one_fallback_per_space_key
  on public.categories (space_id)
  where is_fallback;

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

  insert into public.categories (
    space_id,
    user_id,
    name,
    color,
    icon,
    is_fallback
  )
  values
    (p_space_id, p_actor, 'Alimentation', '#52B788', 'basket-outline', false),
    (p_space_id, p_actor, 'Logement', '#93B29A', 'home-outline', false),
    (p_space_id, p_actor, 'Transport', '#F46F61', 'bus-outline', false),
    (p_space_id, p_actor, 'Loisirs', '#26364D', 'game-controller-outline', false),
    (p_space_id, p_actor, 'Santé', '#F2C15D', 'medkit-outline', false),
    (p_space_id, p_actor, 'Abonnements', '#7A77B9', 'repeat-outline', false),
    (p_space_id, p_actor, 'Non classée', '#8B95A5', 'help-circle-outline', true)
  on conflict do nothing;
end;
$$;

create or replace function private.protect_fallback_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_fallback then
    raise exception 'fallback category cannot be deleted' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.is_fallback is distinct from old.is_fallback then
    raise exception 'fallback category status cannot be changed' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger categories_protect_fallback
before update or delete on public.categories
for each row execute function private.protect_fallback_category();

revoke execute on function private.protect_fallback_category()
from public, anon, authenticated;

create policy categories_delete_member
on public.categories for delete to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = categories.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy expenses_update_member
on public.expenses for update to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = expenses.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = expenses.space_id
      and member.user_id = (select auth.uid())
  )
);

create function public.get_budget_category_usage(p_space_id uuid)
returns table (
  category_id uuid,
  expense_count bigint,
  total_cents bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
  select
    category.id,
    count(expense.id)::bigint,
    coalesce(sum(expense.amount_cents), 0)::bigint
  from public.categories as category
  left join public.expenses as expense
    on expense.space_id = category.space_id
   and expense.category_id = category.id
  where category.space_id = p_space_id
    and category.archived_at is null
  group by category.id, category.name
  order by category.name;
end;
$$;

create function public.update_budget_category(
  p_category_id uuid,
  p_name text default null,
  p_color text default null,
  p_transfer_to_category_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_category public.categories;
  target_category public.categories;
  normalized_name text;
  normalized_color text;
  transferred_expense_count bigint := 0;
  result public.categories;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select category.* into source_category
  from public.categories as category
  where category.id = p_category_id
    and category.archived_at is null
  for update;

  if source_category.id is null then
    raise exception 'category not found or inaccessible' using errcode = '42501';
  end if;

  normalized_name := btrim(regexp_replace(
    coalesce(p_name, source_category.name),
    '[[:space:]]+',
    ' ',
    'g'
  ));
  normalized_color := upper(coalesce(p_color, source_category.color));

  if char_length(normalized_name) not between 2 and 40 then
    raise exception 'category name must contain between 2 and 40 characters'
      using errcode = '22023';
  end if;
  if normalized_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'category color must use #RRGGBB' using errcode = '22023';
  end if;

  if p_transfer_to_category_id is not null then
    if p_transfer_to_category_id = source_category.id then
      raise exception 'transfer target must differ from source category'
        using errcode = '22023';
    end if;

    select category.* into target_category
    from public.categories as category
    where category.id = p_transfer_to_category_id
      and category.space_id = source_category.space_id
      and category.archived_at is null
    for update;

    if target_category.id is null then
      raise exception 'transfer target not found in this budget'
        using errcode = '22023';
    end if;

    update public.expenses
    set category_id = target_category.id
    where space_id = source_category.space_id
      and category_id = source_category.id;
    get diagnostics transferred_expense_count = row_count;
  end if;

  update public.categories
  set name = normalized_name,
      color = normalized_color
  where id = source_category.id
  returning * into result;

  return jsonb_build_object(
    'category', to_jsonb(result),
    'transferredExpenseCount', transferred_expense_count
  );
end;
$$;

create function public.delete_budget_category(
  p_category_id uuid,
  p_strategy text,
  p_transfer_to_category_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_category public.categories;
  target_category public.categories;
  affected_expense_count bigint := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_strategy not in ('transfer', 'delete_expenses') then
    raise exception 'strategy must be transfer or delete_expenses'
      using errcode = '22023';
  end if;

  select category.* into source_category
  from public.categories as category
  where category.id = p_category_id
    and category.archived_at is null
  for update;

  if source_category.id is null then
    raise exception 'category not found or inaccessible' using errcode = '42501';
  end if;
  if source_category.is_fallback then
    raise exception 'fallback category cannot be deleted' using errcode = '22023';
  end if;

  if p_strategy = 'transfer' then
    if p_transfer_to_category_id is null
      or p_transfer_to_category_id = source_category.id then
      raise exception 'a distinct transfer target is required'
        using errcode = '22023';
    end if;

    select category.* into target_category
    from public.categories as category
    where category.id = p_transfer_to_category_id
      and category.space_id = source_category.space_id
      and category.archived_at is null
    for update;

    if target_category.id is null then
      raise exception 'transfer target not found in this budget'
        using errcode = '22023';
    end if;

    update public.expenses
    set category_id = target_category.id
    where space_id = source_category.space_id
      and category_id = source_category.id;
    get diagnostics affected_expense_count = row_count;
  else
    delete from public.expenses
    where space_id = source_category.space_id
      and category_id = source_category.id;
    get diagnostics affected_expense_count = row_count;
  end if;

  delete from public.categories
  where id = source_category.id;

  return jsonb_build_object(
    'deletedCategoryId', source_category.id,
    'strategy', p_strategy,
    'affectedExpenseCount', affected_expense_count,
    'transferToCategoryId', target_category.id
  );
end;
$$;

revoke all on public.categories from public, anon, authenticated;
revoke all on public.expenses from public, anon, authenticated;

grant select, insert, delete on public.categories to authenticated;
grant update (name, color, icon, archived_at) on public.categories to authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant update (category_id) on public.expenses to authenticated;

revoke execute on function public.get_budget_category_usage(uuid)
from public, anon, authenticated;
revoke execute on function public.update_budget_category(uuid, text, text, uuid)
from public, anon, authenticated;
revoke execute on function public.delete_budget_category(uuid, text, uuid)
from public, anon, authenticated;

grant execute on function public.get_budget_category_usage(uuid) to authenticated;
grant execute on function public.update_budget_category(uuid, text, text, uuid)
to authenticated;
grant execute on function public.delete_budget_category(uuid, text, uuid)
to authenticated;
