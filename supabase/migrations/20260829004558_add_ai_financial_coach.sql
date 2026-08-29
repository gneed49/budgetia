create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table private.ai_provider_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'openai',
  vault_secret_id uuid not null unique,
  last_four text not null,
  model text not null,
  status text not null default 'active',
  validated_at timestamptz not null,
  last_used_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_credentials_provider check (provider = 'openai'),
  constraint ai_provider_credentials_last_four check (last_four ~ '^[A-Za-z0-9_-]{4}$'),
  constraint ai_provider_credentials_model_length check (char_length(model) between 2 and 80),
  constraint ai_provider_credentials_status check (status in ('active', 'invalid', 'revoked')),
  constraint ai_provider_credentials_error_code_length check (
    last_error_code is null or char_length(last_error_code) between 2 and 80
  )
);

create table public.ai_coach_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  threshold_notifications_enabled boolean not null default true,
  weekly_report_enabled boolean not null default true,
  monthly_report_enabled boolean not null default true,
  push_notifications_enabled boolean not null default false,
  weekly_day smallint not null default 1,
  weekly_hour smallint not null default 9,
  timezone text not null default 'UTC',
  guidance_style text not null default 'balanced',
  hidden_advice_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_coach_preferences_weekly_day check (weekly_day between 1 and 7),
  constraint ai_coach_preferences_weekly_hour check (weekly_hour between 0 and 23),
  constraint ai_coach_preferences_timezone_length check (char_length(timezone) between 1 and 80),
  constraint ai_coach_preferences_guidance_style check (
    guidance_style in ('cautious', 'balanced', 'encouraging')
  ),
  constraint ai_coach_preferences_hidden_types check (
    hidden_advice_types <@ array[
      'reduce_spending',
      'review_subscription',
      'protect_margin',
      'plan_next_month',
      'celebrate_progress'
    ]::text[]
  )
);

create table public.ai_coach_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  report_type text not null,
  period_start date not null,
  period_end date not null,
  generated_by text not null,
  facts jsonb not null,
  advice jsonb not null,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  helpful boolean,
  read_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_coach_reports_type check (report_type in ('weekly', 'monthly', 'manual')),
  constraint ai_coach_reports_period check (period_end >= period_start),
  constraint ai_coach_reports_period_length check (period_end - period_start <= 366),
  constraint ai_coach_reports_generated_by check (generated_by in ('deterministic', 'openai')),
  constraint ai_coach_reports_facts_object check (jsonb_typeof(facts) = 'object'),
  constraint ai_coach_reports_advice_object check (jsonb_typeof(advice) = 'object'),
  constraint ai_coach_reports_provider check (
    (generated_by = 'deterministic' and provider is null and model is null)
    or (generated_by = 'openai' and provider = 'openai' and model is not null)
  ),
  constraint ai_coach_reports_token_counts check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
  )
);

create unique index ai_coach_reports_scheduled_key
  on public.ai_coach_reports (user_id, space_id, report_type, period_start, period_end)
  where report_type in ('weekly', 'monthly');
create index ai_coach_reports_user_space_created_idx
  on public.ai_coach_reports (user_id, space_id, created_at desc);
create index ai_coach_reports_space_id_idx on public.ai_coach_reports (space_id);

create table public.ai_coach_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  report_type text not null,
  period_start date not null,
  period_end date not null,
  requested_by text not null,
  status text not null default 'pending',
  attempts smallint not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  report_id uuid references public.ai_coach_reports(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  constraint ai_coach_jobs_type check (report_type in ('weekly', 'monthly', 'manual')),
  constraint ai_coach_jobs_period check (period_end >= period_start),
  constraint ai_coach_jobs_period_length check (period_end - period_start <= 366),
  constraint ai_coach_jobs_requested_by check (requested_by in ('schedule', 'user', 'mcp')),
  constraint ai_coach_jobs_status check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint ai_coach_jobs_attempts check (attempts between 0 and 5),
  constraint ai_coach_jobs_error_code_length check (
    error_code is null or char_length(error_code) between 2 and 80
  )
);

create unique index ai_coach_jobs_scheduled_key
  on public.ai_coach_jobs (user_id, space_id, report_type, period_start, period_end)
  where requested_by = 'schedule';
create index ai_coach_jobs_pending_idx
  on public.ai_coach_jobs (available_at, created_at)
  where status = 'pending';
create index ai_coach_jobs_user_space_created_idx
  on public.ai_coach_jobs (user_id, space_id, created_at desc);
create index ai_coach_jobs_space_id_idx on public.ai_coach_jobs (space_id);
create index ai_coach_jobs_report_id_idx on public.ai_coach_jobs (report_id)
  where report_id is not null;

create table public.ai_coach_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.budget_spaces(id) on delete cascade,
  report_id uuid references public.ai_coach_reports(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null,
  severity text not null,
  title text not null,
  body text not null,
  dedupe_key text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  dismissed_at timestamptz,
  pushed_at timestamptz,
  push_attempts smallint not null default 0,
  push_error_code text,
  created_at timestamptz not null default now(),
  constraint ai_coach_notifications_kind check (kind in ('threshold', 'weekly', 'monthly', 'manual')),
  constraint ai_coach_notifications_severity check (severity in ('info', 'watch', 'alert', 'positive')),
  constraint ai_coach_notifications_title_length check (char_length(title) between 2 and 90),
  constraint ai_coach_notifications_body_length check (char_length(body) between 2 and 500),
  constraint ai_coach_notifications_dedupe_length check (char_length(dedupe_key) between 8 and 240),
  constraint ai_coach_notifications_data_object check (jsonb_typeof(data) = 'object'),
  constraint ai_coach_notifications_push_attempts check (push_attempts between 0 and 5),
  constraint ai_coach_notifications_push_error_length check (
    push_error_code is null or char_length(push_error_code) between 2 and 80
  )
);

create unique index ai_coach_notifications_dedupe_key
  on public.ai_coach_notifications (user_id, dedupe_key);
create index ai_coach_notifications_user_unread_idx
  on public.ai_coach_notifications (user_id, created_at desc)
  where read_at is null and dismissed_at is null;
create index ai_coach_notifications_pending_push_idx
  on public.ai_coach_notifications (created_at)
  where pushed_at is null and dismissed_at is null and push_attempts < 5;
create index ai_coach_notifications_space_id_idx
  on public.ai_coach_notifications (space_id);
create index ai_coach_notifications_report_id_idx
  on public.ai_coach_notifications (report_id)
  where report_id is not null;
create index ai_coach_notifications_category_id_idx
  on public.ai_coach_notifications (category_id)
  where category_id is not null;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_receipt_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_token_format check (
    expo_push_token ~ '^(Exponent|Expo)PushToken\\[[A-Za-z0-9_-]+\\]$'
  ),
  constraint push_devices_platform check (platform in ('android', 'ios')),
  constraint push_devices_receipt_length check (
    last_receipt_id is null or char_length(last_receipt_id) between 8 and 120
  ),
  constraint push_devices_error_length check (
    last_error_code is null or char_length(last_error_code) between 2 and 80
  )
);

create index push_devices_user_enabled_idx
  on public.push_devices (user_id, last_seen_at desc)
  where enabled;

create function private.prepare_ai_coach_preferences()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_coach_preferences_prepare
before insert or update on public.ai_coach_preferences
for each row execute function private.prepare_ai_coach_preferences();

create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function private.set_updated_at();

create function private.initialize_ai_coach_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_coach_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create function private.remove_vault_secret_after_credential_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

create trigger ai_provider_credentials_remove_vault_secret
after delete on private.ai_provider_credentials
for each row execute function private.remove_vault_secret_after_credential_delete();

create trigger on_auth_user_created_ai_coach_preferences
after insert on auth.users
for each row execute function private.initialize_ai_coach_preferences();

insert into public.ai_coach_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create function public.register_push_device(
  p_expo_push_token text,
  p_platform text
)
returns public.push_devices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.push_devices;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_expo_push_token !~ '^(Exponent|Expo)PushToken\\[[A-Za-z0-9_-]+\\]$'
    or p_platform not in ('android', 'ios') then
    raise exception 'invalid push device' using errcode = '22023';
  end if;

  insert into public.push_devices (user_id, expo_push_token, platform)
  values (actor, p_expo_push_token, p_platform)
  on conflict (expo_push_token) do update
  set
    user_id = actor,
    platform = excluded.platform,
    enabled = true,
    last_seen_at = now(),
    last_error_code = null
  returning * into result;
  return result;
end;
$$;

create function public.get_ai_coach_facts(
  p_space_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous_end date;
  previous_start date;
  result jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null
    or p_period_end < p_period_start
    or p_period_end - p_period_start > 366 then
    raise exception 'invalid coach period' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = p_space_id and member.user_id = actor
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  previous_end := p_period_start - 1;
  previous_start := previous_end - (p_period_end - p_period_start);

  with current_spending as (
    select expense.category_id, sum(expense.amount_cents)::bigint as amount
    from public.expenses as expense
    where expense.space_id = p_space_id
      and expense.spent_at between p_period_start and p_period_end
    group by expense.category_id
  ),
  previous_spending as (
    select expense.category_id, sum(expense.amount_cents)::bigint as amount
    from public.expenses as expense
    where expense.space_id = p_space_id
      and expense.spent_at between previous_start and previous_end
    group by expense.category_id
  ),
  ranked_categories as (
    select
      category.id,
      category.name,
      category.color,
      coalesce(current_spending.amount, 0)::bigint as current_amount,
      coalesce(previous_spending.amount, 0)::bigint as previous_amount,
      row_number() over (
        order by coalesce(current_spending.amount, 0) desc, category.id
      ) as position
    from public.categories as category
    left join current_spending on current_spending.category_id = category.id
    left join previous_spending on previous_spending.category_id = category.id
    where category.space_id = p_space_id
      and category.archived_at is null
      and (
        coalesce(current_spending.amount, 0) > 0
        or coalesce(previous_spending.amount, 0) > 0
      )
  ),
  category_facts as (
    select
      id,
      name,
      color,
      'C' || position::text as alias,
      'F_CATEGORY_' || position::text as fact_id,
      current_amount,
      previous_amount,
      current_amount - previous_amount as delta_amount,
      case
        when previous_amount = 0 then null
        else round(((current_amount - previous_amount)::numeric * 100) / previous_amount, 1)
      end as delta_percentage
    from ranked_categories
  ),
  totals as (
    select
      coalesce(sum(current_amount), 0)::bigint as current_total,
      coalesce(sum(previous_amount), 0)::bigint as previous_total
    from category_facts
  ),
  configured_budget as (
    select coalesce(settings.monthly_budget_cents, 0)::bigint as monthly_budget
    from public.budget_settings as settings
    where settings.space_id = p_space_id
  ),
  category_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'alias', alias,
        'categoryId', id,
        'categoryName', name,
        'categoryColor', color,
        'factId', fact_id,
        'spentCents', current_amount,
        'previousSpentCents', previous_amount,
        'deltaCents', delta_amount,
        'deltaPercentage', delta_percentage
      ) order by current_amount desc, id
    ), '[]'::jsonb) as value
    from category_facts
  ),
  facts_json as (
    select jsonb_build_array(
      jsonb_build_object(
        'id', 'F_TOTAL',
        'kind', 'total_spending',
        'currentCents', totals.current_total,
        'previousCents', totals.previous_total,
        'deltaCents', totals.current_total - totals.previous_total,
        'deltaPercentage', case
          when totals.previous_total = 0 then null
          else round(
            ((totals.current_total - totals.previous_total)::numeric * 100)
            / totals.previous_total,
            1
          )
        end
      ),
      jsonb_build_object(
        'id', 'F_MONTHLY_BUDGET',
        'kind', 'monthly_budget',
        'budgetCents', coalesce(configured_budget.monthly_budget, 0),
        'remainingCents', coalesce(configured_budget.monthly_budget, 0) - totals.current_total
      )
    ) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fact_id,
        'kind', 'category_change',
        'categoryAlias', alias,
        'currentCents', current_amount,
        'previousCents', previous_amount,
        'deltaCents', delta_amount,
        'deltaPercentage', delta_percentage
      ) order by current_amount desc, id)
      from category_facts
    ), '[]'::jsonb) as value
    from totals
    left join configured_budget on true
  )
  select jsonb_build_object(
    'version', 1,
    'currency', 'EUR',
    'period', jsonb_build_object(
      'start', p_period_start,
      'end', p_period_end,
      'previousStart', previous_start,
      'previousEnd', previous_end
    ),
    'summary', jsonb_build_object(
      'spentCents', totals.current_total,
      'previousSpentCents', totals.previous_total,
      'monthlyBudgetCents', coalesce(configured_budget.monthly_budget, 0),
      'remainingCents', coalesce(configured_budget.monthly_budget, 0) - totals.current_total
    ),
    'facts', facts_json.value,
    'categories', category_json.value
  ) into result
  from totals
  left join configured_budget on true
  cross join category_json
  cross join facts_json;

  return result;
end;
$$;

create function private.enqueue_threshold_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_space uuid := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
  selected_category uuid := case when tg_op = 'DELETE' then old.category_id else new.category_id end;
  selected_date date := case when tg_op = 'DELETE' then old.spent_at else new.spent_at end;
  limit_row public.category_budget_limits;
  spent bigint;
  threshold text;
  notification_severity text;
  bucket date;
  member_record record;
begin
  if selected_date < date_trunc('month', current_date)::date
    or selected_date >= (date_trunc('month', current_date) + interval '1 month')::date then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select * into limit_row
  from public.category_budget_limits
  where space_id = selected_space
    and category_id = selected_category
    and month = date_trunc('month', selected_date)::date;
  if limit_row.id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select coalesce(sum(amount_cents), 0)::bigint into spent
  from public.expenses
  where space_id = selected_space
    and category_id = selected_category
    and spent_at >= date_trunc('month', selected_date)::date
    and spent_at < (date_trunc('month', selected_date) + interval '1 month')::date;

  if spent > limit_row.limit_cents then
    threshold := 'exceeded';
    notification_severity := 'alert';
  elsif spent::numeric * 100 >= limit_row.limit_cents::numeric * 75 then
    threshold := 'watch';
    notification_severity := 'watch';
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  bucket := current_date - ((extract(isodow from current_date)::integer - 1) % 7);
  for member_record in
    select member.user_id
    from public.budget_space_members as member
    join public.ai_coach_preferences as preferences
      on preferences.user_id = member.user_id
    where member.space_id = selected_space
      and preferences.enabled
      and preferences.threshold_notifications_enabled
  loop
    insert into public.ai_coach_notifications (
      user_id,
      space_id,
      category_id,
      kind,
      severity,
      title,
      body,
      dedupe_key,
      data
    ) values (
      member_record.user_id,
      selected_space,
      selected_category,
      'threshold',
      notification_severity,
      case when threshold = 'exceeded' then 'Plafond dépassé' else 'Plafond à surveiller' end,
      case
        when threshold = 'exceeded' then
          format('%s a dépassé son plafond mensuel.', limit_row.category_name)
        else format('%s a atteint au moins 75 %% de son plafond.', limit_row.category_name)
      end,
      format(
        'threshold:%s:%s:%s:%s',
        selected_space,
        selected_category,
        threshold,
        bucket
      ),
      jsonb_build_object(
        'threshold', threshold,
        'spentCents', spent,
        'limitCents', limit_row.limit_cents
      )
    ) on conflict (user_id, dedupe_key) do nothing;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger expenses_enqueue_threshold_notification
after insert or update of amount_cents, category_id, spent_at or delete
on public.expenses
for each row execute function private.enqueue_threshold_notification();

create function public.enqueue_ai_coach_job(
  p_space_id uuid,
  p_report_type text,
  p_period_start date,
  p_period_end date,
  p_requested_by text default 'user'
)
returns public.ai_coach_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.ai_coach_jobs;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_report_type not in ('weekly', 'monthly', 'manual')
    or p_requested_by not in ('user', 'mcp')
    or p_period_start is null
    or p_period_end < p_period_start
    or p_period_end - p_period_start > 366 then
    raise exception 'invalid coach job' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = p_space_id and member.user_id = actor
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.ai_coach_jobs as job
    where job.user_id = actor
      and job.space_id = p_space_id
      and job.requested_by in ('user', 'mcp')
      and job.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'coach generation rate limit' using errcode = 'P0001';
  end if;

  insert into public.ai_coach_jobs (
    user_id, space_id, report_type, period_start, period_end, requested_by
  ) values (
    actor, p_space_id, p_report_type, p_period_start, p_period_end, p_requested_by
  ) returning * into result;
  return result;
end;
$$;

create function private.enqueue_due_ai_coach_jobs(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  preferences record;
  local_now timestamp;
  selected_period_start date;
  selected_period_end date;
  inserted_count integer := 0;
  affected integer;
begin
  for preferences in
    select * from public.ai_coach_preferences where enabled
  loop
    local_now := p_now at time zone preferences.timezone;
    if preferences.weekly_report_enabled
      and extract(isodow from local_now)::integer = preferences.weekly_day
      and extract(hour from local_now)::integer = preferences.weekly_hour then
      selected_period_end := local_now::date - 1;
      selected_period_start := selected_period_end - 6;
      insert into public.ai_coach_jobs (
        user_id, space_id, report_type, period_start, period_end, requested_by
      )
      select
        preferences.user_id,
        member.space_id,
        'weekly',
        selected_period_start,
        selected_period_end,
        'schedule'
      from public.budget_space_members as member
      where member.user_id = preferences.user_id
      on conflict (user_id, space_id, report_type, period_start, period_end)
        where requested_by = 'schedule'
      do nothing;
      get diagnostics affected = row_count;
      inserted_count := inserted_count + affected;
    end if;

    if preferences.monthly_report_enabled
      and extract(day from local_now)::integer = 1
      and extract(hour from local_now)::integer = preferences.weekly_hour then
      selected_period_end := date_trunc('month', local_now)::date - 1;
      selected_period_start := date_trunc('month', selected_period_end)::date;
      insert into public.ai_coach_jobs (
        user_id, space_id, report_type, period_start, period_end, requested_by
      )
      select
        preferences.user_id,
        member.space_id,
        'monthly',
        selected_period_start,
        selected_period_end,
        'schedule'
      from public.budget_space_members as member
      where member.user_id = preferences.user_id
      on conflict (user_id, space_id, report_type, period_start, period_end)
        where requested_by = 'schedule'
      do nothing;
      get diagnostics affected = row_count;
      inserted_count := inserted_count + affected;
    end if;
  end loop;
  return inserted_count;
end;
$$;

create function public.get_ai_coach_facts_for_worker(
  p_user_id uuid,
  p_space_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = p_space_id and member.user_id = p_user_id
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  select public.get_ai_coach_facts(p_space_id, p_period_start, p_period_end)
  into result;
  return result;
end;
$$;

create function public.enqueue_due_ai_coach_jobs_for_worker(p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.enqueue_due_ai_coach_jobs(p_now);
$$;

create function public.save_ai_coach_report_for_worker(
  p_user_id uuid,
  p_space_id uuid,
  p_report_type text,
  p_period_start date,
  p_period_end date,
  p_generated_by text,
  p_facts jsonb,
  p_advice jsonb,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not exists (
    select 1 from public.budget_space_members as member
    where member.space_id = p_space_id and member.user_id = p_user_id
  ) then
    raise exception 'budget membership required' using errcode = '42501';
  end if;

  if p_report_type = 'manual' then
    insert into public.ai_coach_reports (
      user_id, space_id, report_type, period_start, period_end,
      generated_by, facts, advice, provider, model, input_tokens, output_tokens
    ) values (
      p_user_id, p_space_id, p_report_type, p_period_start, p_period_end,
      p_generated_by, p_facts, p_advice,
      case when p_generated_by = 'openai' then 'openai' else null end,
      p_model, p_input_tokens, p_output_tokens
    ) returning id into saved_id;
  else
    insert into public.ai_coach_reports (
      user_id, space_id, report_type, period_start, period_end,
      generated_by, facts, advice, provider, model, input_tokens, output_tokens
    ) values (
      p_user_id, p_space_id, p_report_type, p_period_start, p_period_end,
      p_generated_by, p_facts, p_advice,
      case when p_generated_by = 'openai' then 'openai' else null end,
      p_model, p_input_tokens, p_output_tokens
    )
    on conflict (user_id, space_id, report_type, period_start, period_end)
      where report_type in ('weekly', 'monthly')
    do update set
      generated_by = excluded.generated_by,
      facts = excluded.facts,
      advice = excluded.advice,
      provider = excluded.provider,
      model = excluded.model,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      helpful = null,
      dismissed_at = null,
      snoozed_until = null,
      created_at = now()
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create function public.claim_ai_coach_jobs_for_worker(p_limit integer default 10)
returns setof public.ai_coach_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 25 then
    raise exception 'invalid worker limit' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select job.id
    from public.ai_coach_jobs as job
    where job.status = 'pending' and job.available_at <= now()
    order by job.available_at, job.created_at
    limit p_limit
    for update skip locked
  )
  update public.ai_coach_jobs as job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    claimed_at = now(),
    error_code = null
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

create function public.complete_ai_coach_job_for_worker(
  p_job_id uuid,
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_coach_jobs
  set status = 'completed', report_id = p_report_id, completed_at = now(), error_code = null
  where id = p_job_id and status = 'processing';
  if not found then
    raise exception 'coach job not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.fail_ai_coach_job_for_worker(
  p_job_id uuid,
  p_error_code text,
  p_retry boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error_code !~ '^[A-Z0-9_]{2,80}$' then
    raise exception 'invalid worker error code' using errcode = '22023';
  end if;
  update public.ai_coach_jobs
  set
    status = case when p_retry and attempts < 5 then 'pending' else 'failed' end,
    available_at = case
      when p_retry and attempts < 5 then now() + make_interval(mins => power(2, attempts)::integer)
      else available_at
    end,
    completed_at = case when p_retry and attempts < 5 then null else now() end,
    error_code = p_error_code
  where id = p_job_id and status = 'processing';
  if not found then
    raise exception 'coach job not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.upsert_ai_provider_credential_for_worker(
  p_user_id uuid,
  p_secret text,
  p_last_four text,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
  secret_name text := 'budgetia_openai_' || p_user_id::text;
begin
  if not exists (select 1 from auth.users where id = p_user_id)
    or char_length(p_secret) not between 20 and 500
    or p_last_four !~ '^[A-Za-z0-9_-]{4}$'
    or char_length(p_model) not between 2 and 80 then
    raise exception 'invalid provider credential' using errcode = '22023';
  end if;

  select vault_secret_id into existing_secret_id
  from private.ai_provider_credentials
  where user_id = p_user_id;
  if existing_secret_id is null then
    select vault.create_secret(
      p_secret,
      secret_name,
      'Budgetia OpenAI BYOK credential for one authenticated user'
    ) into next_secret_id;
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret,
      secret_name,
      'Budgetia OpenAI BYOK credential for one authenticated user'
    );
    next_secret_id := existing_secret_id;
  end if;

  insert into private.ai_provider_credentials (
    user_id, vault_secret_id, last_four, model, status, validated_at, last_error_code
  ) values (
    p_user_id, next_secret_id, p_last_four, p_model, 'active', now(), null
  )
  on conflict (user_id) do update
  set
    vault_secret_id = excluded.vault_secret_id,
    last_four = excluded.last_four,
    model = excluded.model,
    status = 'active',
    validated_at = now(),
    last_error_code = null,
    updated_at = now();
end;
$$;

create function public.get_ai_provider_credential_for_worker(p_user_id uuid)
returns table (
  api_key text,
  model text,
  status text
)
language sql
security definer
set search_path = ''
as $$
  select secret.decrypted_secret, credential.model, credential.status
  from private.ai_provider_credentials as credential
  join vault.decrypted_secrets as secret on secret.id = credential.vault_secret_id
  where credential.user_id = p_user_id;
$$;

create function public.get_ai_provider_credential_status_for_worker(p_user_id uuid)
returns table (
  configured boolean,
  provider text,
  last_four text,
  model text,
  status text,
  validated_at timestamptz,
  last_used_at timestamptz,
  last_error_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    credential.user_id is not null,
    credential.provider,
    credential.last_four,
    credential.model,
    credential.status,
    credential.validated_at,
    credential.last_used_at,
    credential.last_error_code
  from (select p_user_id as user_id) as requested_user
  left join private.ai_provider_credentials as credential
    on credential.user_id = requested_user.user_id;
$$;

create function public.mark_ai_provider_credential_used_for_worker(
  p_user_id uuid,
  p_status text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('active', 'invalid')
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{2,80}$') then
    raise exception 'invalid provider status' using errcode = '22023';
  end if;
  update private.ai_provider_credentials
  set
    status = p_status,
    last_used_at = now(),
    last_error_code = p_error_code,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

create function public.get_my_ai_credential_status()
returns table (
  configured boolean,
  provider text,
  last_four text,
  model text,
  status text,
  validated_at timestamptz,
  last_used_at timestamptz,
  last_error_code text
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
  return query
  select
    credential.user_id is not null,
    credential.provider,
    credential.last_four,
    credential.model,
    credential.status,
    credential.validated_at,
    credential.last_used_at,
    credential.last_error_code
  from (select actor as user_id) as requested_user
  left join private.ai_provider_credentials as credential
    on credential.user_id = requested_user.user_id;
end;
$$;

create function private.delete_ai_provider_credential(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_secret_id uuid;
begin
  delete from private.ai_provider_credentials
  where user_id = p_user_id
  returning vault_secret_id into selected_secret_id;
  if selected_secret_id is null then
    return false;
  end if;
  return true;
end;
$$;

create function public.delete_ai_provider_credential_for_worker(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.delete_ai_provider_credential(p_user_id);
$$;

create function public.delete_my_ai_coach_data(p_delete_credential boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  report_count integer;
  notification_count integer;
  push_device_count integer;
  credential_deleted boolean := false;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.ai_coach_notifications where user_id = actor;
  get diagnostics notification_count = row_count;
  delete from public.ai_coach_jobs where user_id = actor;
  delete from public.ai_coach_reports where user_id = actor;
  get diagnostics report_count = row_count;
  delete from public.push_devices where user_id = actor;
  get diagnostics push_device_count = row_count;
  if p_delete_credential then
    credential_deleted := private.delete_ai_provider_credential(actor);
  end if;
  update public.ai_coach_preferences
  set
    enabled = false,
    threshold_notifications_enabled = true,
    weekly_report_enabled = true,
    monthly_report_enabled = true,
    push_notifications_enabled = false,
    weekly_day = 1,
    weekly_hour = 9,
    timezone = 'UTC',
    guidance_style = 'balanced',
    hidden_advice_types = '{}',
    updated_at = now()
  where user_id = actor;
  return jsonb_build_object(
    'reportsDeleted', report_count,
    'notificationsDeleted', notification_count,
    'pushDevicesDeleted', push_device_count,
    'credentialDeleted', credential_deleted
  );
end;
$$;

create function public.verify_ai_scheduler_secret_for_worker(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'budgetia_ai_scheduler_secret'
      and decrypted_secret = p_secret
  );
$$;

create function public.configure_ai_coach_cron_for_worker(p_project_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_url text := regexp_replace(p_project_url, '/+$', '');
  existing_project_url_id uuid;
  existing_scheduler_id uuid;
  command text;
  job_id bigint;
begin
  if normalized_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'invalid Supabase project URL' using errcode = '22023';
  end if;

  select id into existing_project_url_id
  from vault.secrets where name = 'budgetia_project_url';
  if existing_project_url_id is null then
    perform vault.create_secret(normalized_url, 'budgetia_project_url', 'Budgetia public project URL for pg_cron');
  else
    perform vault.update_secret(
      existing_project_url_id,
      normalized_url,
      'budgetia_project_url',
      'Budgetia public project URL for pg_cron'
    );
  end if;

  select id into existing_scheduler_id
  from vault.secrets where name = 'budgetia_ai_scheduler_secret';
  if existing_scheduler_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'budgetia_ai_scheduler_secret',
      'Budgetia private scheduler bearer secret'
    );
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'budgetia-ai-coach-worker';

  command := $command$
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'budgetia_project_url'
      ) || '/functions/v1/budgetia-ai-coach',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-budgetia-scheduler-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'budgetia_ai_scheduler_secret'
        )
      ),
      body := '{"action":"scheduler.run"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $command$;
  select cron.schedule('budgetia-ai-coach-worker', '*/5 * * * *', command)
  into job_id;
  return jsonb_build_object('configured', true, 'jobId', job_id, 'schedule', '*/5 * * * *');
end;
$$;

alter table public.ai_coach_preferences enable row level security;
alter table public.ai_coach_reports enable row level security;
alter table public.ai_coach_jobs enable row level security;
alter table public.ai_coach_notifications enable row level security;
alter table public.push_devices enable row level security;

create policy ai_coach_preferences_select_own
on public.ai_coach_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy ai_coach_preferences_insert_own
on public.ai_coach_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy ai_coach_preferences_update_own
on public.ai_coach_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy ai_coach_reports_select_own_member
on public.ai_coach_reports for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_reports.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy ai_coach_reports_update_own_member
on public.ai_coach_reports for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_reports.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_reports.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy ai_coach_jobs_select_own_member
on public.ai_coach_jobs for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_jobs.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy ai_coach_notifications_select_own_member
on public.ai_coach_notifications for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_notifications.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy ai_coach_notifications_update_own_member
on public.ai_coach_notifications for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_notifications.space_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.budget_space_members as member
    where member.space_id = ai_coach_notifications.space_id
      and member.user_id = (select auth.uid())
  )
);

create policy push_devices_select_own
on public.push_devices for select to authenticated
using (user_id = (select auth.uid()));

create policy push_devices_insert_own
on public.push_devices for insert to authenticated
with check (user_id = (select auth.uid()));

create policy push_devices_update_own
on public.push_devices for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy push_devices_delete_own
on public.push_devices for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on private.ai_provider_credentials from public, anon, authenticated;
revoke all on public.ai_coach_preferences from public, anon, authenticated;
revoke all on public.ai_coach_reports from public, anon, authenticated;
revoke all on public.ai_coach_jobs from public, anon, authenticated;
revoke all on public.ai_coach_notifications from public, anon, authenticated;
revoke all on public.push_devices from public, anon, authenticated;

grant select, insert on public.ai_coach_preferences to authenticated;
grant update (
  enabled,
  threshold_notifications_enabled,
  weekly_report_enabled,
  monthly_report_enabled,
  push_notifications_enabled,
  weekly_day,
  weekly_hour,
  timezone,
  guidance_style,
  hidden_advice_types
) on public.ai_coach_preferences to authenticated;
grant select on public.ai_coach_reports to authenticated;
grant update (helpful, read_at, dismissed_at, snoozed_until)
on public.ai_coach_reports to authenticated;
grant select on public.ai_coach_jobs to authenticated;
grant select on public.ai_coach_notifications to authenticated;
grant update (read_at, dismissed_at) on public.ai_coach_notifications to authenticated;
grant select, insert, delete on public.push_devices to authenticated;
grant update (platform, enabled, last_seen_at) on public.push_devices to authenticated;
grant select, insert, update, delete on public.ai_coach_preferences to service_role;
grant select, insert, update, delete on public.ai_coach_reports to service_role;
grant select, insert, update, delete on public.ai_coach_jobs to service_role;
grant select, insert, update, delete on public.ai_coach_notifications to service_role;
grant select, insert, update, delete on public.push_devices to service_role;

revoke execute on function private.prepare_ai_coach_preferences() from public, anon, authenticated;
revoke execute on function private.initialize_ai_coach_preferences() from public, anon, authenticated;
revoke execute on function private.remove_vault_secret_after_credential_delete() from public, anon, authenticated;
revoke execute on function private.enqueue_threshold_notification() from public, anon, authenticated;
revoke execute on function private.enqueue_due_ai_coach_jobs(timestamptz) from public, anon, authenticated;
revoke execute on function private.delete_ai_provider_credential(uuid) from public, anon, authenticated;

revoke execute on function public.register_push_device(text, text) from public, anon, authenticated;
revoke execute on function public.get_ai_coach_facts(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.enqueue_ai_coach_job(uuid, text, date, date, text) from public, anon, authenticated;
revoke execute on function public.get_my_ai_credential_status() from public, anon, authenticated;
revoke execute on function public.delete_my_ai_coach_data(boolean) from public, anon, authenticated;

grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.get_ai_coach_facts(uuid, date, date) to authenticated;
grant execute on function public.enqueue_ai_coach_job(uuid, text, date, date, text) to authenticated;
grant execute on function public.get_my_ai_credential_status() to authenticated;
grant execute on function public.delete_my_ai_coach_data(boolean) to authenticated;

revoke execute on function public.enqueue_due_ai_coach_jobs_for_worker(timestamptz)
from public, anon, authenticated;
revoke execute on function public.get_ai_coach_facts_for_worker(uuid, uuid, date, date)
from public, anon, authenticated;
revoke execute on function public.save_ai_coach_report_for_worker(
  uuid, uuid, text, date, date, text, jsonb, jsonb, text, integer, integer
) from public, anon, authenticated;
revoke execute on function public.claim_ai_coach_jobs_for_worker(integer)
from public, anon, authenticated;
revoke execute on function public.complete_ai_coach_job_for_worker(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.fail_ai_coach_job_for_worker(uuid, text, boolean)
from public, anon, authenticated;
revoke execute on function public.upsert_ai_provider_credential_for_worker(uuid, text, text, text)
from public, anon, authenticated;
revoke execute on function public.get_ai_provider_credential_for_worker(uuid)
from public, anon, authenticated;
revoke execute on function public.get_ai_provider_credential_status_for_worker(uuid)
from public, anon, authenticated;
revoke execute on function public.mark_ai_provider_credential_used_for_worker(uuid, text, text)
from public, anon, authenticated;
revoke execute on function public.delete_ai_provider_credential_for_worker(uuid)
from public, anon, authenticated;
revoke execute on function public.verify_ai_scheduler_secret_for_worker(text)
from public, anon, authenticated;
revoke execute on function public.configure_ai_coach_cron_for_worker(text)
from public, anon, authenticated;

grant execute on function public.enqueue_due_ai_coach_jobs_for_worker(timestamptz) to service_role;
grant execute on function public.get_ai_coach_facts_for_worker(uuid, uuid, date, date) to service_role;
grant execute on function public.save_ai_coach_report_for_worker(
  uuid, uuid, text, date, date, text, jsonb, jsonb, text, integer, integer
) to service_role;
grant execute on function public.claim_ai_coach_jobs_for_worker(integer) to service_role;
grant execute on function public.complete_ai_coach_job_for_worker(uuid, uuid) to service_role;
grant execute on function public.fail_ai_coach_job_for_worker(uuid, text, boolean) to service_role;
grant execute on function public.upsert_ai_provider_credential_for_worker(uuid, text, text, text) to service_role;
grant execute on function public.get_ai_provider_credential_for_worker(uuid) to service_role;
grant execute on function public.get_ai_provider_credential_status_for_worker(uuid) to service_role;
grant execute on function public.mark_ai_provider_credential_used_for_worker(uuid, text, text) to service_role;
grant execute on function public.delete_ai_provider_credential_for_worker(uuid) to service_role;
grant execute on function public.verify_ai_scheduler_secret_for_worker(text) to service_role;
grant execute on function public.configure_ai_coach_cron_for_worker(text) to service_role;

comment on table private.ai_provider_credentials is
  'Metadata only. The provider key is encrypted in Supabase Vault and never exposed through the Data API.';
comment on function public.get_ai_coach_facts(uuid, date, date) is
  'Returns deterministic financial facts. It never reads expense notes, receipt merchants or receipt item labels.';
comment on table public.ai_coach_reports is
  'Private per-user reports, including for a shared budget. Another member never sees a user report or BYOK credential.';
