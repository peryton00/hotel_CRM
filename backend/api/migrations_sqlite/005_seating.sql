ALTER TABLE tables ADD COLUMN current_seating_session_id TEXT;
UPDATE tables SET qr_token=lower(hex(randomblob(16))) WHERE qr_token LIKE 'tbl-%';
UPDATE tables SET qr_code_identifier=qr_token WHERE qr_code_identifier LIKE 'tbl-%';
