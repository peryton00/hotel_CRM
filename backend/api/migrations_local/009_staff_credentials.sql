-- Preserve legacy logins while removing plaintext password comparisons.
UPDATE staff_members SET pin_hash = crypt(pin_hash, gen_salt('bf', 12))
WHERE pin_hash <> '' AND pin_hash NOT LIKE '$2%' AND pin_hash NOT LIKE '$argon2%';
