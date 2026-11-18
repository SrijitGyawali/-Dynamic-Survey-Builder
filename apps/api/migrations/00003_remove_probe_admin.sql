-- +goose Up
-- Data fix: remove a test admin created by accident on the hosted demo while
-- verifying that registration was disabled (a request reached the previous
-- deploy). It owns no surveys; ON DELETE CASCADE would remove any anyway.
DELETE FROM admins WHERE email = 'probe@x.io';

-- +goose Down
-- Nothing to restore: the row was never meant to exist.
SELECT 1;
