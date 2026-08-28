-- Members may edit the business fields of expenses in spaces they can access.
-- Row access remains governed by expenses_update_member; immutable ownership,
-- source and idempotency fields deliberately keep no UPDATE privilege.
revoke all on public.expenses from public, anon, authenticated;

grant select, insert, delete on public.expenses to authenticated;
grant update (amount_cents, category_id, note, spent_at)
on public.expenses to authenticated;
