ALTER TABLE work_items ADD COLUMN tooth_codes TEXT;

UPDATE work_items
SET tooth_codes = (
  SELECT group_concat(tooth_code, ',')
  FROM (
    SELECT tooth_code
    FROM work_item_teeth
    WHERE work_item_teeth.work_item_id = work_items.id
    ORDER BY tooth_code
  )
)
WHERE EXISTS (
  SELECT 1 FROM work_item_teeth WHERE work_item_teeth.work_item_id = work_items.id
);

DROP TABLE work_item_teeth;

PRAGMA user_version = 4;
