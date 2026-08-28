-- A receipt is a validated analytical detail of one expense. Raw OCR text and
-- images deliberately never enter the database.

alter table public.expenses
  add constraint expenses_space_id_id_key unique (space_id, id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  expense_id uuid not null,
  merchant text not null default '',
  source text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint receipts_space_id_id_key unique (space_id, id),
  constraint receipts_expense_id_key unique (expense_id),
  constraint receipts_space_expense_fkey
    foreign key (space_id, expense_id)
    references public.expenses(space_id, id) on delete cascade,
  constraint receipts_merchant_length check (char_length(btrim(merchant)) <= 80),
  constraint receipts_source_value check (source in ('mobile', 'chatgpt'))
);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  receipt_id uuid not null,
  label text not null,
  amount_cents bigint not null,
  product_group text not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint receipt_items_space_receipt_fkey
    foreign key (space_id, receipt_id)
    references public.receipts(space_id, id) on delete cascade,
  constraint receipt_items_receipt_position_key unique (receipt_id, position),
  constraint receipt_items_label_length
    check (char_length(btrim(label)) between 1 and 120),
  constraint receipt_items_amount_range
    check (amount_cents between 1 and 10000000000),
  constraint receipt_items_position_range check (position between 0 and 99),
  constraint receipt_items_product_group_value check (
    product_group in (
      'fruits_vegetables', 'meat_fish', 'dairy_eggs', 'bakery',
      'pantry', 'drinks', 'snacks', 'hygiene', 'household',
      'baby', 'pet', 'other'
    )
  )
);

create index receipts_space_created_at_idx
  on public.receipts (space_id, created_at desc);
create index receipts_created_by_idx
  on public.receipts (created_by);
create index receipt_items_space_receipt_idx
  on public.receipt_items (space_id, receipt_id);
create index receipt_items_space_product_group_idx
  on public.receipt_items (space_id, product_group);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy receipts_select_member
on public.receipts for select to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = receipts.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy receipt_items_select_member
on public.receipt_items for select to authenticated
using (
  exists (
    select 1
    from public.budget_space_members as member
    where member.space_id = receipt_items.space_id
      and member.user_id = (select auth.uid())
  )
);

create function private.protect_receipt_expense_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.amount_cents is distinct from old.amount_cents
     and exists (
       select 1 from public.receipts as receipt
       where receipt.expense_id = old.id
     ) then
    raise exception 'receipt total is controlled by its validated items'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger expenses_protect_receipt_total
before update of amount_cents on public.expenses
for each row execute function private.protect_receipt_expense_total();

revoke execute on function private.protect_receipt_expense_total()
from public, anon, authenticated;

create function public.create_budgetia_receipt_expense(
  p_category_id uuid,
  p_items jsonb,
  p_merchant text default '',
  p_note text default '',
  p_spent_at date default current_date,
  p_source text default 'mobile',
  p_request_id text default null,
  p_space_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_space_id uuid := p_space_id;
  target_expense public.expenses;
  target_receipt public.receipts;
  item jsonb;
  item_label text;
  item_group text;
  item_amount bigint;
  total_cents bigint := 0;
  item_count integer := 0;
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
  if not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.space_id = target_space_id
      and category.archived_at is null
  ) then
    raise exception 'active category required' using errcode = '23503';
  end if;
  if p_source not in ('mobile', 'chatgpt') then
    raise exception 'invalid receipt source' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_merchant, ''))) > 80 then
    raise exception 'merchant is limited to 80 characters' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 160 then
    raise exception 'note is limited to 160 characters' using errcode = '22023';
  end if;
  if p_request_id is not null
     and char_length(btrim(p_request_id)) not between 4 and 100 then
    raise exception 'request_id must contain 4 to 100 characters' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'a receipt requires 1 to 100 items' using errcode = '22023';
  end if;

  if p_request_id is not null then
    select expense.* into target_expense
    from public.expenses as expense
    where expense.space_id = target_space_id
      and expense.user_id = actor
      and expense.request_id = btrim(p_request_id);
    if found then
      select receipt.* into target_receipt
      from public.receipts as receipt
      where receipt.expense_id = target_expense.id;
      if found then
        return jsonb_build_object(
          'expenseId', target_expense.id,
          'receiptId', target_receipt.id,
          'totalCents', target_expense.amount_cents,
          'itemCount', (
            select count(*) from public.receipt_items as receipt_item
            where receipt_item.receipt_id = target_receipt.id
          )
        );
      end if;
    end if;
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'each receipt item must be an object' using errcode = '22023';
    end if;
    item_label := btrim(coalesce(item->>'label', ''));
    item_group := item->>'product_group';
    if char_length(item_label) not between 1 and 120 then
      raise exception 'item labels must contain 1 to 120 characters' using errcode = '22023';
    end if;
    if coalesce(item->>'amount_cents', '') !~ '^[0-9]+$' then
      raise exception 'item amounts must be positive integer cents' using errcode = '22023';
    end if;
    item_amount := (item->>'amount_cents')::bigint;
    if item_amount not between 1 and 10000000000 then
      raise exception 'item amount is outside the allowed range' using errcode = '22023';
    end if;
    if item_group not in (
      'fruits_vegetables', 'meat_fish', 'dairy_eggs', 'bakery',
      'pantry', 'drinks', 'snacks', 'hygiene', 'household',
      'baby', 'pet', 'other'
    ) then
      raise exception 'invalid product group' using errcode = '22023';
    end if;
    total_cents := total_cents + item_amount;
    item_count := item_count + 1;
  end loop;

  insert into public.expenses (
    space_id, user_id, amount_cents, category_id, note, spent_at, source, request_id
  ) values (
    target_space_id, actor, total_cents, p_category_id,
    btrim(coalesce(p_note, '')), p_spent_at, p_source,
    nullif(btrim(p_request_id), '')
  )
  returning * into target_expense;

  insert into public.receipts (
    space_id, expense_id, merchant, source, created_by
  ) values (
    target_space_id, target_expense.id,
    btrim(coalesce(p_merchant, '')), p_source, actor
  )
  returning * into target_receipt;

  insert into public.receipt_items (
    space_id, receipt_id, label, amount_cents, product_group, position
  )
  select
    target_space_id,
    target_receipt.id,
    btrim(value->>'label'),
    (value->>'amount_cents')::bigint,
    value->>'product_group',
    (ordinality - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality;

  return jsonb_build_object(
    'expenseId', target_expense.id,
    'receiptId', target_receipt.id,
    'totalCents', total_cents,
    'itemCount', item_count
  );
end;
$$;

create function public.get_budgetia_product_breakdown(
  p_period text default 'month',
  p_reference_date date default current_date,
  p_category_ids uuid[] default null,
  p_product_groups text[] default null,
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
  total_cents bigint;
  receipt_count bigint;
  groups jsonb;
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
    raise exception 'period must be week, month or year' using errcode = '22023';
  end if;
  if p_product_groups is not null and exists (
    select 1 from unnest(p_product_groups) as requested(product_group)
    where requested.product_group not in (
      'fruits_vegetables', 'meat_fish', 'dairy_eggs', 'bakery',
      'pantry', 'drinks', 'snacks', 'hygiene', 'household',
      'baby', 'pet', 'other'
    )
  ) then
    raise exception 'invalid product group filter' using errcode = '22023';
  end if;

  select
    coalesce(sum(receipt_item.amount_cents), 0)::bigint,
    count(distinct receipt.id)::bigint
  into total_cents, receipt_count
  from public.receipt_items as receipt_item
  join public.receipts as receipt on receipt.id = receipt_item.receipt_id
  join public.expenses as expense on expense.id = receipt.expense_id
  where receipt_item.space_id = target_space_id
    and expense.spent_at between range_start and range_end
    and (p_category_ids is null or cardinality(p_category_ids) = 0
      or expense.category_id = any(p_category_ids))
    and (p_product_groups is null or cardinality(p_product_groups) = 0
      or receipt_item.product_group = any(p_product_groups));

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key', grouped.product_group,
      'label', case grouped.product_group
        when 'fruits_vegetables' then 'Fruits et légumes'
        when 'meat_fish' then 'Viande et poisson'
        when 'dairy_eggs' then 'Produits laitiers et œufs'
        when 'bakery' then 'Boulangerie'
        when 'pantry' then 'Épicerie'
        when 'drinks' then 'Boissons'
        when 'snacks' then 'Snacks et sucreries'
        when 'hygiene' then 'Hygiène'
        when 'household' then 'Entretien'
        when 'baby' then 'Bébé'
        when 'pet' then 'Animaux'
        else 'Autres produits'
      end,
      'amountCents', grouped.amount_cents,
      'percentage', case when total_cents = 0 then 0
        else round(grouped.amount_cents::numeric * 1000 / total_cents) / 10 end
    ) order by grouped.amount_cents desc, grouped.product_group
  ), '[]'::jsonb) into groups
  from (
    select receipt_item.product_group, sum(receipt_item.amount_cents)::bigint as amount_cents
    from public.receipt_items as receipt_item
    join public.receipts as receipt on receipt.id = receipt_item.receipt_id
    join public.expenses as expense on expense.id = receipt.expense_id
    where receipt_item.space_id = target_space_id
      and expense.spent_at between range_start and range_end
      and (p_category_ids is null or cardinality(p_category_ids) = 0
        or expense.category_id = any(p_category_ids))
      and (p_product_groups is null or cardinality(p_product_groups) = 0
        or receipt_item.product_group = any(p_product_groups))
    group by receipt_item.product_group
  ) as grouped;

  return jsonb_build_object(
    'period', p_period,
    'range', jsonb_build_object('startDate', range_start, 'endDate', range_end),
    'totalCents', total_cents,
    'receiptCount', receipt_count,
    'productGroups', groups
  );
end;
$$;

revoke all on public.receipts from public, anon, authenticated;
revoke all on public.receipt_items from public, anon, authenticated;
revoke execute on function public.create_budgetia_receipt_expense(
  uuid, jsonb, text, text, date, text, text, uuid
) from public, anon, authenticated;
revoke execute on function public.get_budgetia_product_breakdown(
  text, date, uuid[], text[], uuid
) from public, anon, authenticated;

grant select on public.receipts to authenticated;
grant select on public.receipt_items to authenticated;
grant execute on function public.create_budgetia_receipt_expense(
  uuid, jsonb, text, text, date, text, text, uuid
) to authenticated;
grant execute on function public.get_budgetia_product_breakdown(
  text, date, uuid[], text[], uuid
) to authenticated;
