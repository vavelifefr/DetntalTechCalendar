CREATE TABLE work_item_teeth (
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  tooth_code TEXT NOT NULL CHECK (
    length(tooth_code) = 2 AND tooth_code GLOB '[1-4][1-8]'
  ),
  PRIMARY KEY (work_item_id, tooth_code)
);

CREATE INDEX work_item_teeth_code_idx ON work_item_teeth(tooth_code);

PRAGMA user_version = 3;
