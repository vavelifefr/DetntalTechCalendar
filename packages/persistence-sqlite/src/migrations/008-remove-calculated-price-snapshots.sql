-- Calculated Pricing amounts are form-only guidance; accepted_amount is the sole saved WorkItem amount.
UPDATE work_items
SET unit_price_snapshot = NULL,
    total_price_snapshot = NULL;

PRAGMA user_version = 8;
