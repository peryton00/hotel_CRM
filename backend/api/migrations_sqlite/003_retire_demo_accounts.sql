-- Retain foreign keys to prototype staff while retiring their built-in credentials.
UPDATE users SET is_active=0, pin_hash=NULL
WHERE (id='44444444-0000-0000-0000-000000000001' AND pin_hash='Admin@123')
   OR (id='44444444-0000-0000-0000-000000000002' AND pin_hash='1234');
