create index if not exists budget_settings_user_id_idx
on public.budget_settings (user_id);

create index if not exists expenses_user_id_idx
on public.expenses (user_id);
