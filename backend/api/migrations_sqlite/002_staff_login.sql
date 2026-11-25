ALTER TABLE users ADD COLUMN login_id TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX users_login_id ON users(login_id);
