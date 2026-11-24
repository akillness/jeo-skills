package db

import (
	"fmt"
)

// Machine-checked verification state of a finding (S1). Kept apart from
// findings.status, which is the human disposition. Values are validated here
// (server-side), not by a CHECK constraint, like the other findings columns.
const (
	VerificationVerified      = "verified"
	VerificationUnverified    = "unverified"
	VerificationBlocked       = "blocked"
	VerificationNotAssessed   = "not_assessed"
	VerificationFalsePositive = "false_positive"
)

// ValidVerificationStatus reports whether s is a known verification state.
func ValidVerificationStatus(s string) bool {
	switch s {
	case VerificationVerified, VerificationUnverified, VerificationBlocked,
		VerificationNotAssessed, VerificationFalsePositive:
		return true
	}
	return false
}

// SetFindingVerification records the verification state, POE level and note on
// the standalone findings row. It does not touch status, report or evidence.
func (d *DB) SetFindingVerification(findingID int64, status string, poe int, note string) error {
	if !ValidVerificationStatus(status) {
		return fmt.Errorf("invalid verification status %q", status)
	}
	if poe < 0 || poe > 4 {
		return fmt.Errorf("invalid POE level %d (want 0-4)", poe)
	}
	res, err := d.Exec(`UPDATE findings SET verification_status=$2, poe_level=$3, verification_note=$4 WHERE id=$1`,
		findingID, status, poe, note)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrFindingNotFound
	}
	return nil
}
