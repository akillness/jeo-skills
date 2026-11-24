package db

import (
	"database/sql"
	"strconv"
)

// Settings is a tiny key-value store for global app config the UI toggles at
// runtime (e.g. traffic_capture). Missing keys fall back to caller defaults.

// GetSetting returns the stored value and ok=false when the key is unset. A
// secret setting (secretSettingKeys) is decrypted.
func (d *DB) GetSetting(key string) (value string, ok bool, err error) {
	err = d.QueryRow(`SELECT value FROM settings WHERE key=$1`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if c, secret := secretSetting(key); secret {
		if value, err = openSecret(c, value); err != nil {
			return "", false, err
		}
	}
	return value, true, nil
}

// sealSetting encrypts the value of a secret setting; other values pass as is.
func sealSetting(key, value string) (string, error) {
	if c, secret := secretSetting(key); secret {
		return sealSecret(c, value)
	}
	return value, nil
}

// SetSetting upserts a setting value.
func (d *DB) SetSetting(key, value string) error {
	value, err := sealSetting(key, value)
	if err != nil {
		return err
	}
	_, err = d.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, key, value)
	return err
}

// InsertSettingIfAbsent writes only when the key does not exist yet; an existing key is
// kept as-is and inserted=false is returned.
// For keys like auth.password_hash that "may only be set on first run": the judgment rests
// on the database primary-key constraint. A caller doing GetSetting-then-write is just a
// fast-fail path — on a read error or a concurrent race, the existing value will not be
// silently overwritten by ON CONFLICT DO UPDATE.
func (d *DB) InsertSettingIfAbsent(key, value string) (inserted bool, err error) {
	if value, err = sealSetting(key, value); err != nil {
		return false, err
	}
	res, err := d.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO NOTHING`, key, value)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// RotatePassword stores hash and increments the monotonic version in one
// transaction. A failure leaves both rows unchanged. The returned version is
// the value new sessions must carry.
func (d *DB) RotatePassword(hashKey, hash, versionKey string) (int64, error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	sealed, err := sealSetting(hashKey, hash)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, hashKey, sealed); err != nil {
		return 0, err
	}
	var raw string
	if err := tx.QueryRow(`
INSERT INTO settings(key, value) VALUES ($1, '1')
ON CONFLICT (key) DO UPDATE
SET value = (settings.value::bigint + 1)::text, updated_at = now()
RETURNING value`, versionKey).Scan(&raw); err != nil {
		return 0, err
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return n, nil
}

// InsertPassword writes the hash only when that key is absent, and sets the
// version to 1 in the same transaction. inserted is false when the hash
// already exists; the version row is then left as it was.
func (d *DB) InsertPassword(hashKey, hash, versionKey string) (version int64, inserted bool, err error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()
	sealed, err := sealSetting(hashKey, hash)
	if err != nil {
		return 0, false, err
	}
	res, err := tx.Exec(`
INSERT INTO settings(key, value) VALUES ($1, $2)
ON CONFLICT (key) DO NOTHING`, hashKey, sealed)
	if err != nil {
		return 0, false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, false, err
	}
	if n == 0 {
		return 0, false, nil
	}
	if _, err := tx.Exec(`
INSERT INTO settings(key, value) VALUES ($1, '1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, versionKey); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return 1, true, nil
}

// GetBool returns the boolean setting, or def when unset/unparseable.
func (d *DB) GetBool(key string, def bool) bool {
	v, ok, err := d.GetSetting(key)
	if err != nil || !ok {
		return def
	}
	return v == "true" || v == "1"
}

// SetBool stores a boolean setting as "true"/"false".
func (d *DB) SetBool(key string, val bool) error {
	if val {
		return d.SetSetting(key, "true")
	}
	return d.SetSetting(key, "false")
}
