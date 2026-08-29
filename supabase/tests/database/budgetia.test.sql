begin;

create extension if not exists pgtap with schema extensions;
select plan(126);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'alice@budgetia.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'bob@budgetia.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );

select has_table('public', 'budget_spaces', 'budget spaces table exists');
select has_table('public', 'budget_space_members', 'budget members table exists');
select has_table('public', 'budget_invitations', 'budget invitations table exists');
select has_table('public', 'categories', 'categories table exists');
select has_table('public', 'expenses', 'expenses table exists');
select has_table('public', 'budget_settings', 'budget settings table exists');
select has_table('public', 'receipts', 'receipts table exists');
select has_table('public', 'receipt_items', 'receipt items table exists');
select has_table(
  'public', 'category_budget_limits',
  'category budget limits table exists'
);
select ok(
  has_table_privilege('authenticated', 'public.category_budget_limits', 'SELECT')
  and has_table_privilege('authenticated', 'public.category_budget_limits', 'INSERT')
  and has_table_privilege('authenticated', 'public.category_budget_limits', 'DELETE')
  and not has_table_privilege('authenticated', 'public.category_budget_limits', 'UPDATE'),
  'members can read, create and delete limits without broad update privileges'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.category_budget_limits', 'limit_cents', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.category_budget_limits', 'space_id', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.category_budget_limits', 'created_by', 'UPDATE'
  ),
  'only a category limit amount can be updated directly'
);
select ok(
  has_table_privilege('authenticated', 'public.receipts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.receipts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.receipt_items', 'INSERT'),
  'receipt writes are restricted to the validated RPC'
);
select ok(
  has_column_privilege('authenticated', 'public.expenses', 'amount_cents', 'UPDATE')
  and has_column_privilege('authenticated', 'public.expenses', 'category_id', 'UPDATE')
  and has_column_privilege('authenticated', 'public.expenses', 'note', 'UPDATE')
  and has_column_privilege('authenticated', 'public.expenses', 'spent_at', 'UPDATE'),
  'authenticated members can update only the editable expense fields'
);
select ok(
  not has_column_privilege('authenticated', 'public.expenses', 'space_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.expenses', 'user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.expenses', 'source', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.expenses', 'request_id', 'UPDATE'),
  'expense ownership, source and idempotency fields remain immutable'
);

select is(
  (select count(*)::integer from public.budget_spaces
   where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'),
  1,
  'signup creates exactly one personal budget space'
);
select is(
  (select count(*)::integer from public.categories
   where space_id = (
     select id from public.budget_spaces
     where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'
   )),
  7,
  'signup creates six standard categories and one fallback category'
);
select is(
  (select count(*)::integer from public.categories
   where is_fallback
     and space_id = (
       select id from public.budget_spaces
       where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'
     )),
  1,
  'a personal budget has exactly one fallback category'
);
select is(
  (select name from public.categories
   where is_fallback
     and space_id = (
       select id from public.budget_spaces
       where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'
     )),
  'Non classée',
  'the fallback category is clearly named Non classée'
);
select is(
  (select count(*)::integer from public.budget_settings
   where space_id = (
     select id from public.budget_spaces
     where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'
   )),
  1,
  'signup creates settings for the personal space'
);

select set_config(
  'test.alice_space_id',
  (select id::text from public.budget_spaces
   where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'),
  true
);
select set_config(
  'test.bob_space_id',
  (select id::text from public.budget_spaces
   where kind = 'personal' and created_by = '22222222-2222-4222-8222-222222222222'),
  true
);
select set_config(
  'test.bob_fallback_id',
  (select id::text from public.categories
   where is_fallback
     and space_id = (
       select id from public.budget_spaces
       where kind = 'personal' and created_by = '22222222-2222-4222-8222-222222222222'
     )),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"alice@budgetia.test"}',
  true
);

select is(
  (select count(*)::integer from public.budget_spaces),
  1,
  'RLS exposes only Alice personal space before sharing'
);

select lives_ok(
  $$select public.create_budgetia_expense(
    1250,
    (select id from public.categories where name = 'Alimentation'),
    'Marché', '2026-08-26', 'mobile', 'retry-safe-1', null
  )$$,
  'Alice can create a personal expense'
);
select is(
  (
    select (public.create_budgetia_expense(
      1250,
      (select id from public.categories where name = 'Alimentation'),
      'Marché', '2026-08-26', 'mobile', 'retry-safe-1', null
    )).id::text
  ),
  (select id::text from public.expenses where request_id = 'retry-safe-1'),
  'expense retries return the existing row'
);
select is(
  (select count(*)::integer from public.expenses where request_id = 'retry-safe-1'),
  1,
  'expense retries do not duplicate data'
);
select is(
  (public.get_budgetia_spending_summary('month', '2026-08-26', null, null)->>'totalCents')::bigint,
  1250::bigint,
  'personal summary aggregates the personal expense'
);

select lives_ok(
  $$select public.create_budgetia_receipt_expense(
    (select id from public.categories where name = 'Alimentation'),
    '[{"label":"Pommes","amount_cents":320,"product_group":"fruits_vegetables"},{"label":"Shampoing","amount_cents":580,"product_group":"hygiene"}]'::jsonb,
    'Marché test', 'Ticket contrôlé', '2026-08-26', 'mobile',
    'receipt-personal-1', null
  )$$,
  'Alice can create one expense with validated receipt items'
);
select is(
  (select count(*)::integer from public.receipts),
  1,
  'one receipt is attached to the expense'
);
select is(
  (select count(*)::integer from public.receipt_items),
  2,
  'the validated receipt keeps its two item lines'
);
select is(
  (select sum(amount_cents)::bigint from public.receipt_items),
  900::bigint,
  'receipt items preserve their exact cent total'
);
select is(
  (public.get_budgetia_product_breakdown('month', '2026-08-26', null, null, null)->>'totalCents')::bigint,
  900::bigint,
  'the monthly product breakdown totals receipt lines'
);
select is(
  jsonb_array_length(public.get_budgetia_product_breakdown(
    'month', '2026-08-26', null, null, null
  )->'productGroups'),
  2,
  'the product breakdown separates the two validated groups'
);
select is(
  (
    select count(*)::integer from public.expenses
    where request_id = 'receipt-personal-1'
  ),
  1,
  'a receipt request ID is retry safe'
);
select throws_ok(
  $$update public.expenses set amount_cents = 999
    where request_id = 'receipt-personal-1'$$,
  '22023',
  'receipt total is controlled by its validated items',
  'a normal expense update cannot desynchronize a receipt total'
);
select throws_ok(
  $$select public.create_budgetia_receipt_expense(
    (select id from public.categories where name = 'Alimentation'),
    '[{"label":"Inconnu","amount_cents":100,"product_group":"invented"}]'::jsonb,
    '', '', '2026-08-26', 'mobile', 'receipt-invalid-group', null
  )$$,
  '22023',
  'invalid product group',
  'unknown product groups are rejected before financial data is written'
);

select lives_ok(
  $$select public.set_category_budget_limit(
    current_setting('test.alice_space_id')::uuid,
    (select id from public.categories where name = 'Alimentation'),
    '2026-08-26',
    2000
  )$$,
  'Alice can set a monthly category limit'
);
select is(
  (select month::text from public.category_budget_limits),
  '2026-08-01',
  'a category limit is normalized to the first day of its month'
);
select is(
  (select limit_cents from public.category_budget_limits),
  2000::bigint,
  'the category limit preserves exact cents'
);
select is(
  (select created_by from public.category_budget_limits),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'the category limit creator is captured by the database'
);
select is(
  (
    select spent_cents
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  2150::bigint,
  'category positions aggregate normal and receipt expenses'
);
select is(
  (
    select remaining_cents
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  (-150)::bigint,
  'category positions expose an exact overrun'
);
select is(
  (
    select status
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  'exceeded',
  'spending above a limit is marked exceeded'
);
select is(
  (
    select previous_spent_cents
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  0::bigint,
  'the previous month comparison is deterministic'
);
select is(
  (
    select percentage
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  107.5::numeric,
  'the limit percentage is rounded to one decimal'
);
select lives_ok(
  $$select public.set_category_budget_limit(
    current_setting('test.alice_space_id')::uuid,
    (select id from public.categories where name = 'Alimentation'),
    '2026-08-01',
    3000
  )$$,
  'setting the same category and month updates the limit'
);
select is(
  (select limit_cents from public.category_budget_limits),
  3000::bigint,
  'the upsert does not duplicate a category limit'
);
select is(
  (
    select status
    from public.get_category_budget_positions(
      current_setting('test.alice_space_id')::uuid,
      '2026-08-26'
    )
  ),
  'healthy',
  'spending below seventy-five percent is healthy'
);
select throws_ok(
  format(
    $$insert into public.category_budget_limits (
      space_id, category_id, category_name, category_color, category_icon,
      month, limit_cents
    ) values ('%s', '%s', 'Invalide', '#000000', 'wallet-outline',
      '2026-08-01', 1000)$$,
    current_setting('test.alice_space_id'),
    current_setting('test.bob_fallback_id')
  ),
  '22023',
  'category not found in this budget',
  'a member cannot attach a limit to another budget category'
);
select lives_ok(
  $$select public.delete_category_budget_limit(
    current_setting('test.alice_space_id')::uuid,
    (select id from public.categories where name = 'Alimentation'),
    '2026-08-26'
  )$$,
  'Alice can remove one category limit'
);
select is(
  (select count(*)::integer from public.category_budget_limits),
  0,
  'removing a limit does not affect the category or its expenses'
);

select is_empty(
  $$delete from public.categories where is_fallback returning id$$,
  'RLS prevents direct deletion of the fallback category'
);

insert into public.categories (space_id, name, color, icon)
values
  (current_setting('test.alice_space_id')::uuid, 'À modifier', '#52B788', 'create-outline'),
  (current_setting('test.alice_space_id')::uuid, 'À transférer', '#F46F61', 'swap-horizontal-outline'),
  (current_setting('test.alice_space_id')::uuid, 'À purger', '#26364D', 'trash-outline');

insert into public.expenses (
  space_id, amount_cents, category_id, note, spent_at, source, request_id
)
values
  (
    current_setting('test.alice_space_id')::uuid,
    100,
    (select id from public.categories where name = 'À modifier'),
    'À déplacer pendant la modification',
    '2025-01-01',
    'mobile',
    'category-update-source'
  ),
  (
    current_setting('test.alice_space_id')::uuid,
    200,
    (select id from public.categories where name = 'À transférer'),
    'À conserver pendant la suppression',
    '2025-01-02',
    'mobile',
    'category-delete-transfer'
  ),
  (
    current_setting('test.alice_space_id')::uuid,
    300,
    (select id from public.categories where name = 'À purger'),
    'À supprimer avec la catégorie',
    '2025-01-03',
    'mobile',
    'category-delete-expenses'
  );

select lives_ok(
  $$select public.update_budget_category(
    (select id from public.categories where name = 'À modifier'),
    'Catégorie éditée',
    '#3478F6',
    (select id from public.categories where is_fallback)
  )$$,
  'a category can be renamed and recolored while transferring its expenses'
);
select is(
  (select name || ':' || color from public.categories where name = 'Catégorie éditée'),
  'Catégorie éditée:#3478F6',
  'category edits are persisted'
);
select is(
  (select category_id from public.expenses where request_id = 'category-update-source'),
  (select id from public.categories where is_fallback),
  'editing with a transfer target moves existing expenses'
);

select lives_ok(
  $$select public.set_category_budget_limit(
    current_setting('test.alice_space_id')::uuid,
    (select id from public.categories where name = 'À transférer'),
    date_trunc('month', current_date)::date,
    5000
  )$$,
  'a category can have a limit in the current month before deletion'
);
select lives_ok(
  $$select public.set_category_budget_limit(
    current_setting('test.alice_space_id')::uuid,
    (select id from public.categories where name = 'À transférer'),
    (date_trunc('month', current_date) + interval '1 month')::date,
    5000
  )$$,
  'a category can have a future limit before deletion'
);

select lives_ok(
  $$select public.delete_budget_category(
    (select id from public.categories where name = 'À transférer'),
    'transfer',
    (select id from public.categories where is_fallback)
  )$$,
  'a category can be deleted after transferring its expenses'
);
select is(
  (select count(*)::integer from public.categories where name = 'À transférer'),
  0,
  'delete with transfer removes the source category'
);
select is(
  (select category_id from public.expenses where request_id = 'category-delete-transfer'),
  (select id from public.categories where is_fallback),
  'delete with transfer preserves and reclassifies the expense'
);
select is(
  (
    select category_name || ':' || coalesce(category_id::text, 'orphan')
    from public.category_budget_limits
    where month = date_trunc('month', current_date)::date
  ),
  'À transférer:orphan',
  'category deletion keeps a current historical limit snapshot'
);
select is(
  (
    select count(*)::integer
    from public.category_budget_limits
    where month > date_trunc('month', current_date)::date
  ),
  0,
  'category deletion removes future limits that can no longer be used'
);

select lives_ok(
  $$select public.delete_budget_category(
    (select id from public.categories where name = 'À purger'),
    'delete_expenses',
    null
  )$$,
  'a category can be deleted together with its expenses'
);
select is(
  (
    (select count(*) from public.categories where name = 'À purger')
    +
    (select count(*) from public.expenses where request_id = 'category-delete-expenses')
  )::integer,
  0,
  'delete_expenses removes both category and dependent expenses'
);
select is(
  (select usage.expense_count
   from public.get_budget_category_usage(current_setting('test.alice_space_id')::uuid) as usage
   where usage.category_id = (select id from public.categories where is_fallback)),
  2::bigint,
  'category usage reports the transferred expense count'
);
select is(
  (select usage.total_cents
   from public.get_budget_category_usage(current_setting('test.alice_space_id')::uuid) as usage
   where usage.category_id = (select id from public.categories where is_fallback)),
  300::bigint,
  'category usage reports the transferred amount'
);
select throws_ok(
  $$select public.delete_budget_category(
    (select id from public.categories where is_fallback),
    'delete_expenses',
    null
  )$$,
  '22023',
  null,
  'the fallback category cannot be deleted through the lifecycle API'
);
select throws_ok(
  $$select public.update_budget_category(
    (select id from public.categories where name = 'Catégorie éditée'),
    null,
    null,
    current_setting('test.bob_fallback_id')::uuid
  )$$,
  '22023',
  null,
  'expenses cannot be transferred to a category in another budget'
);
select throws_ok(
  $$select public.update_budget_category(
    current_setting('test.bob_fallback_id')::uuid,
    'Interdit',
    null,
    null
  )$$,
  '42501',
  null,
  'a member cannot edit a category from an inaccessible budget'
);

select lives_ok(
  $$select public.create_shared_budget('Budget du couple')$$,
  'Alice can create a shared budget'
);
select is(
  (select count(*)::integer from public.budget_spaces),
  2,
  'Alice sees her personal and shared spaces'
);
select is(
  (select count(*)::integer from public.categories
   where space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
  7,
  'a shared budget starts with six standard categories and one fallback'
);
select is(
  (select count(*)::integer from public.categories
   where is_fallback
     and space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
  1,
  'a shared budget has exactly one fallback category'
);
select lives_ok(
  $$select public.invite_budget_member(
    (select id from public.budget_spaces where name = 'Budget du couple'),
    'bob@budgetia.test'
  )$$,
  'Alice can invite Bob to the shared budget'
);
select is(
  (select count(*)::integer from public.budget_invitations where status = 'pending'),
  1,
  'the sender can see the pending invitation'
);
select throws_ok(
  $$select public.accept_budget_invitation(
    (select id from public.budget_invitations where email = 'bob@budgetia.test')
  )$$,
  '42501',
  null,
  'the sender cannot accept an invitation addressed to someone else'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"bob@budgetia.test"}',
  true
);

select is(
  (select count(*)::integer from public.budget_spaces),
  1,
  'Bob sees only his personal space before accepting'
);
select is(
  (select count(*)::integer from public.budget_invitations where status = 'pending'),
  1,
  'Bob sees the invitation addressed to his authenticated email'
);
select is(
  (select space_name from public.list_budget_invitations()),
  'Budget du couple',
  'the recipient sees the invited budget name without becoming a member'
);
select is(
  (select count(*)::integer from public.categories
   where space_id = (
     select id from public.budget_spaces where created_by = '11111111-1111-4111-8111-111111111111'
   )),
  0,
  'Bob cannot see Alice personal categories'
);
select throws_ok(
  $$select public.create_budgetia_expense(
    100,
    '00000000-0000-4000-8000-000000000000',
    'Interdit', '2026-08-26', 'mobile', 'cross-space',
    current_setting('test.alice_space_id')::uuid
  )$$,
  '42501',
  null,
  'Bob cannot write into Alice personal space'
);
select is(
  (select count(*)::integer from public.receipts),
  0,
  'Bob cannot read Alice personal receipt'
);
select throws_ok(
  $$select public.create_budgetia_receipt_expense(
    (select id from public.categories where name = 'Alimentation'),
    '[{"label":"Interdit","amount_cents":100,"product_group":"other"}]'::jsonb,
    '', '', '2026-08-26', 'mobile', 'receipt-cross-space',
    current_setting('test.alice_space_id')::uuid
  )$$,
  '42501',
  'budget membership required',
  'Bob cannot create a receipt in Alice personal space'
);
select lives_ok(
  $$select public.accept_budget_invitation(
    (select id from public.budget_invitations where email = 'bob@budgetia.test')
  )$$,
  'Bob can accept his invitation'
);
select is(
  (select count(*)::integer from public.budget_spaces),
  2,
  'Bob sees his personal and the shared space after accepting'
);
select is(
  (select count(*)::integer from public.categories
   where space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
  7,
  'Bob can read the shared categories'
);
select lives_ok(
  $$select public.create_budgetia_expense(
    2300,
    (select id from public.categories
     where name = 'Alimentation'
       and space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
    'Courses communes', '2026-08-26', 'mobile', 'shared-bob-1',
    (select id from public.budget_spaces where name = 'Budget du couple')
  )$$,
  'Bob can add an expense to the shared budget'
);
select lives_ok(
  $$select public.create_budgetia_receipt_expense(
    (select id from public.categories
     where name = 'Alimentation'
       and space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
    '[{"label":"Légumes","amount_cents":700,"product_group":"fruits_vegetables"}]'::jsonb,
    'Primeur', 'Ticket commun', '2026-08-26', 'mobile', 'receipt-shared-bob',
    (select id from public.budget_spaces where name = 'Budget du couple')
  )$$,
  'Bob can add a receipt to a shared budget'
);
select lives_ok(
  $$update public.expenses
    set amount_cents = 2450,
        category_id = (
          select id from public.categories
          where name = 'Transport'
            and space_id = (select id from public.budget_spaces where name = 'Budget du couple')
        ),
        note = 'Courses corrigées',
        spent_at = '2026-08-25'
    where request_id = 'shared-bob-1'$$,
  'a member can edit an expense in a shared budget'
);
select is(
  (select jsonb_build_array(amount_cents, note, spent_at, category_id)
   from public.expenses where request_id = 'shared-bob-1'),
  (select jsonb_build_array(
    2450::bigint,
    'Courses corrigées',
    '2026-08-25'::date,
    id
  ) from public.categories
    where name = 'Transport'
      and space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
  'the editable expense fields are persisted together'
);
select is_empty(
  $$update public.expenses
    set amount_cents = 999
    where request_id = 'retry-safe-1'
    returning id$$,
  'RLS prevents editing an expense from another personal budget'
);
select is(
  (public.get_budgetia_spending_summary(
    'month', '2026-08-26', null,
    (select id from public.budget_spaces where name = 'Budget du couple')
  )->>'totalCents')::bigint,
  3150::bigint,
  'Bob reads the shared total'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"alice@budgetia.test"}',
  true
);

select is(
  (public.get_budgetia_spending_summary(
    'month', '2026-08-26', null,
    (select id from public.budget_spaces where name = 'Budget du couple')
  )->>'totalCents')::bigint,
  3150::bigint,
  'Alice sees the expense added by Bob to their shared space'
);
select is(
  (select count(*)::integer from public.receipts
   where space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
  1,
  'Alice can read the receipt added by Bob to their shared budget'
);
select is(
  (public.get_budgetia_spending_summary('month', '2026-08-26', null, null)->>'totalCents')::bigint,
  2150::bigint,
  'Alice personal summary remains isolated from the shared budget'
);
select is(
  jsonb_array_length(
    public.get_budgetia_spending_summary('year', '2026-08-26', null, null)->'series'
  ),
  12,
  'year summary still returns twelve chart points'
);
select throws_ok(
  $$insert into public.categories (space_id, user_id, name, color, icon)
    values (
      current_setting('test.bob_space_id')::uuid,
      '11111111-1111-4111-8111-111111111111',
      'Interdit', '#52B788', 'lock-closed-outline'
    )$$,
  '42501',
  null,
  'RLS prevents a category write into another personal space'
);

select is(
  (select count(*)::integer
   from public.list_budget_space_members(
     (select id from public.budget_spaces where name = 'Budget du couple')
   )),
  2,
  'both members can be listed from inside the shared budget'
);
select lives_ok(
  $$select public.create_budgetia_receipt_expense(
    (select id from public.categories
     where name = 'Logement'
       and space_id = (select id from public.budget_spaces where name = 'Budget du couple')),
    '[{"label":"Produit commun","amount_cents":980,"product_group":"household"}]'::jsonb,
    'Maison', 'Dépense conservée', '2026-08-27', 'mobile', 'shared-alice-kept',
    (select id from public.budget_spaces where name = 'Budget du couple')
  )$$,
  'Alice can add a shared receipt before deleting her account'
);
select is(
  (public.get_account_deletion_impact()->>'sharedExpenseCountKept')::integer,
  1,
  'the deletion preflight identifies shared expenses that will be anonymized'
);
select throws_ok(
  $$select public.leave_shared_budget(
    (select id from public.budget_spaces where name = 'Budget du couple')
  )$$,
  '22023',
  null,
  'an owner cannot leave without transferring ownership'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"bob@budgetia.test"}',
  true
);
select throws_ok(
  $$select public.invite_budget_member(
    (select id from public.budget_spaces where name = 'Budget du couple'),
    'charlie@budgetia.test'
  )$$,
  '42501',
  null,
  'an editor cannot invite another person'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"alice@budgetia.test"}',
  true
);
select lives_ok(
  $$select public.transfer_budget_space_ownership(
    (select id from public.budget_spaces where name = 'Budget du couple'),
    '22222222-2222-4222-8222-222222222222'
  )$$,
  'Alice can transfer ownership to Bob'
);
select is(
  (select role from public.list_budget_space_members(
     (select id from public.budget_spaces where name = 'Budget du couple')
   ) where user_id = '22222222-2222-4222-8222-222222222222'),
  'owner',
  'Bob becomes the only owner'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"bob@budgetia.test"}',
  true
);
select lives_ok(
  $$select public.transfer_budget_space_ownership(
    (select id from public.budget_spaces where name = 'Budget du couple'),
    '11111111-1111-4111-8111-111111111111'
  )$$,
  'Bob can transfer ownership back to Alice'
);
select is(
  (select role from public.list_budget_space_members(
     (select id from public.budget_spaces where name = 'Budget du couple')
   ) where user_id = '11111111-1111-4111-8111-111111111111'),
  'owner',
  'Alice becomes the only owner again'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"alice@budgetia.test"}',
  true
);
select lives_ok(
  $$select public.create_shared_budget('Gestion membres')$$,
  'Alice can create a second shared budget for lifecycle checks'
);
select lives_ok(
  $$select public.invite_budget_member(
    (select id from public.budget_spaces where name = 'Gestion membres'),
    'bob@budgetia.test'
  )$$,
  'Alice can invite Bob to the lifecycle budget'
);
select lives_ok(
  $$select public.revoke_budget_invitation(
    (select id from public.budget_invitations
     where space_id = (select id from public.budget_spaces where name = 'Gestion membres')
       and status = 'pending')
  )$$,
  'Alice can revoke a pending invitation'
);
select is(
  (select status from public.budget_invitations
   where space_id = (select id from public.budget_spaces where name = 'Gestion membres')
   order by created_at desc limit 1),
  'revoked',
  'the invitation is visibly revoked'
);
select lives_ok(
  $$select public.invite_budget_member(
    (select id from public.budget_spaces where name = 'Gestion membres'),
    'bob@budgetia.test'
  )$$,
  'Alice can invite Bob again after revocation'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","email":"bob@budgetia.test"}',
  true
);
select lives_ok(
  $$select public.accept_budget_invitation(
    (select id from public.list_budget_invitations()
     where space_name = 'Gestion membres')
  )$$,
  'Bob can accept the renewed invitation'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"alice@budgetia.test"}',
  true
);
select lives_ok(
  $$select public.remove_budget_space_member(
    (select id from public.budget_spaces where name = 'Gestion membres'),
    '22222222-2222-4222-8222-222222222222'
  )$$,
  'the owner can remove an editor'
);
select is(
  (select count(*)::integer
   from public.list_budget_space_members(
     (select id from public.budget_spaces where name = 'Gestion membres')
   )),
  1,
  'only the owner remains after removal'
);
select throws_ok(
  $$select public.delete_shared_budget(
    (select id from public.budget_spaces where name = 'Gestion membres'),
    'mauvaise confirmation'
  )$$,
  '22023',
  null,
  'a shared budget cannot be deleted with a mismatched confirmation'
);
select lives_ok(
  $$select public.delete_shared_budget(
    (select id from public.budget_spaces where name = 'Gestion membres'),
    'Gestion membres'
  )$$,
  'the owner can delete a shared budget with its exact name'
);
select is(
  (select count(*)::integer from public.budget_spaces where name = 'Gestion membres'),
  0,
  'the confirmed shared budget deletion cascades completely'
);

reset role;

select lives_ok(
  $$delete from auth.users where id = '11111111-1111-4111-8111-111111111111'$$,
  'Alice can delete her account without breaking a shared budget'
);
select is(
  (select count(*)::integer from public.budget_spaces
   where kind = 'personal' and created_by = '11111111-1111-4111-8111-111111111111'),
  0,
  'account deletion removes the personal budget'
);
select is(
  (select count(*)::integer from public.budget_spaces where name = 'Budget du couple'),
  1,
  'account deletion preserves a shared budget with another member'
);
select is(
  (select role from public.budget_space_members
   where space_id = (select id from public.budget_spaces where name = 'Budget du couple')
     and user_id = '22222222-2222-4222-8222-222222222222'),
  'owner',
  'the remaining member automatically becomes owner'
);
select is(
  (select user_id from public.expenses where request_id = 'shared-alice-kept'),
  null,
  'the deleted account shared expense remains anonymously'
);
select is(
  (select receipt.created_by
   from public.receipts as receipt
   join public.expenses as expense on expense.id = receipt.expense_id
   where expense.request_id = 'shared-alice-kept'),
  null,
  'the preserved shared receipt is anonymized with its expense'
);
select is(
  (select count(*)::integer from public.budget_space_members
   where user_id = '11111111-1111-4111-8111-111111111111'),
  0,
  'the deleted account no longer has any memberships'
);

select has_index(
  'public', 'expenses', 'expenses_space_spent_at_idx',
  'expense date queries have a space-aware index'
);
select has_index(
  'public', 'budget_space_members', 'budget_space_members_user_id_idx',
  'membership RLS lookups have a user index'
);
select has_index(
  'public', 'budget_settings', 'budget_settings_user_id_idx',
  'budget settings user foreign key has a covering index'
);
select has_index(
  'public', 'expenses', 'expenses_user_id_idx',
  'expense user foreign key has a covering index'
);
select has_index(
  'public', 'receipts', 'receipts_space_expense_idx',
  'receipt expense foreign key has a covering index'
);

select * from finish();
rollback;
