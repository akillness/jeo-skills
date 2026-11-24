package agent

import (
	"fmt"

	"github.com/Autumn-27/norma/agentcore"
)

// resumeSession reloads the persisted conversation of session id into s. Norma's
// transcript.Store.Load treats a missing file as a fresh session (no records, no
// error); any other failure, such as a corrupt line or an unreadable path, is
// returned so the caller stops before the first model or tool call instead of
// appending a new conversation to the damaged file.
func resumeSession(s *agentcore.Session, id string) error {
	if err := s.Resume(id); err != nil {
		return fmt.Errorf("restore Norma session %q: %w", id, err)
	}
	return nil
}
