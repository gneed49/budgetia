create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#52B788',
  icon text not null default 'wallet-outline',
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint categories_user_id_id_key unique (user_id, id),
  constraint categories_name_length check (char_length(btrim(name)) between 2 and 40),
  constraint categories_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint categories_icon_length check (char_length(icon) between 1 and 80)
);

create unique index categories_active_name_key
  on public.categories (user_id, lower(btrim(name)))
  where archived_at is null;
create index categories_user_id_idx on public.categories (user_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount_cents bigint not null,
  category_id uuid not null,
  note text not null default '',
  spent_at date not null default current_date,
  source text not null default 'mobile',
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_user_category_fkey
    foreign key (user_id, category_id)
    references public.categories(user_id, id),
  constraint expenses_amount_range check (amount_cents between 1 and 10000000000),
  constraint expenses_note_length check (char_length(note) <= 160),
  constraint expenses_source_value check (source in ('mobile', 'chatgpt')),
  constraint expenses_request_id_length check (
    request_id is null or char_length(request_id) between 4 and 100
  )
);

create unique index expenses_user_request_key
  on public.expenses (user_id, request_id)
  where request_id is not null;
create index expenses_user_spent_at_idx
  on public.expenses (user_id, spent_at desc);
create index expenses_user_category_spent_at_idx
  on public.expenses (user_id, category_id, spent_at desc);

create table public.budget_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  currency text not null default 'EUR',
  monthly_budget_cents bigint not null default 200000,
  updated_at timestamptz not null default now(),
  constraint budget_settings_currency check (currency = 'EUR'),
  constraint budget_settings_amount_range check (
    monthly_budget_cents between 1 and 10000000000
  )
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_updated_at();

create trigger budget_settings_set_updated_at
before update on public.budget_settings
for each row execute function private.set_updated_at();

create or replace function private.initialize_budgetia_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.budget_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.categories (user_id, name, color, icon)
  values
    (new.id, 'Alimentation', '#52B788', 'basket-outline'),
    (new.id, 'Logement', '#93B29A', 'home-outline'),
    (new.id, 'Transport', '#F46F61', 'bus-outline'),
    (new.id, 'Loisirs', '#26364D', 'game-controller-outline'),
    (new.id, 'Santé', '#F2C15D', 'medkit-outline'),
    (new.id, 'Abonnements', '#7A77B9', 'repeat-outline')
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function private.initialize_budgetia_user() from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger initialize_budgetia_user_after_signup
after insert on auth.users
for each row execute function private.initialize_budgetia_user();

insert into public.budget_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.categories (user_id, name, color, icon)
select auth_user.id, defaults.name, defaults.color, defaults.icon
from auth.users as auth_user
cross join (
  values
    ('Alimentation', '#52B788', 'basket-outline'),
    ('Logement', '#93B29A', 'home-outline'),
    ('Transport', '#F46F61', 'bus-outline'),
    ('Loisirs', '#26364D', 'game-controller-outline'),
    ('Santé', '#F2C15D', 'medkit-outline'),
    ('Abonnements', '#7A77B9', 'repeat-outline')
) as defaults(name, color, icon)
on conflict do nothing;

alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.budget_settings enable row level security;

create policy categories_select_own on public.categories
for select to authenticated
using ((select auth.uid()) = user_id);

create policy categories_insert_own on public.categories
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy categories_update_own on public.categories
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy expenses_select_own on public.expenses
for select to authenticated
using ((select auth.uid()) = user_id);

create policy expenses_insert_own on public.expenses
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy expenses_delete_own on public.expenses
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy budget_settings_select_own on public.budget_settings
for select to authenticated
using ((select auth.uid()) = user_id);

create policy budget_settings_insert_own on public.budget_settings
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy budget_settings_update_own on public.budget_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.create_budgetia_expense(
  p_amount_cents bigint,
  p_category_id uuid,
  p_note text default '',
  p_spent_at date default current_date,
  p_source text default 'mobile',
  p_request_id text default null
)
returns public.expenses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.expenses;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select expense.* into result
    from public.expenses as expense
    where expense.user_id = actor
      and expense.request_id = p_request_id;
    if found then
      return result;
    end if;
  end if;

  insert into public.expenses (
    user_id,
    amount_cents,
    category_id,
    note,
    spent_at,
    source,
    request_id
  ) values (
    actor,
    p_amount_cents,
    p_category_id,
    btrim(coalesce(p_note, '')),
    p_spent_at,
    p_source,
    nullif(btrim(p_request_id), '')
  )
  on conflict (user_id, request_id) where request_id is not null do nothing
  returning * into result;

  if result.id is null and p_request_id is not null then
    select expense.* into strict result
    from public.expenses as expense
    where expense.user_id = actor
      and expense.request_id = p_request_id;
  end if;

  return result;
end;
$$;

create or replace function public.get_budgetia_spending_summary(
  p_period text default 'month',
  p_reference_date date default current_date,
  p_category_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
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
  where expense.user_id = actor
    and expense.spent_at between range_start and range_end
    and (
      p_category_ids is null
      or cardinality(p_category_ids) = 0
      or expense.category_id = any(p_category_ids)
    );

  select coalesce(sum(expense.amount_cents), 0)
  into previous_total_cents
  from public.expenses as expense
  where expense.user_id = actor
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
  )
  into category_totals
  from (
    select
      expense.category_id,
      category.name,
      category.color,
      category.icon,
      sum(expense.amount_cents)::bigint as amount_cents
    from public.expenses as expense
    join public.categories as category
      on category.user_id = expense.user_id
     and category.id = expense.category_id
    where expense.user_id = actor
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
      where expense.user_id = actor
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
      where expense.user_id = actor
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
      where expense.user_id = actor
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

revoke all on public.categories from public, anon, authenticated;
revoke all on public.expenses from public, anon, authenticated;
revoke all on public.budget_settings from public, anon, authenticated;
revoke execute on function public.create_budgetia_expense(bigint, uuid, text, date, text, text) from public, anon, authenticated;
revoke execute on function public.get_budgetia_spending_summary(text, date, uuid[]) from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant select, insert, update on public.budget_settings to authenticated;
grant execute on function public.create_budgetia_expense(bigint, uuid, text, date, text, text) to authenticated;
grant execute on function public.get_budgetia_spending_summary(text, date, uuid[]) to authenticated;
