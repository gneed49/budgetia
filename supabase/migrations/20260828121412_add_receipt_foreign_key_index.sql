-- Cover both columns of receipts_space_expense_fkey for cascades and joins.
create index receipts_space_expense_idx
on public.receipts (space_id, expense_id);
