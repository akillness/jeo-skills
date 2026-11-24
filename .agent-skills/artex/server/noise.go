package server

import (
	"log"
	"net/http"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/egress"
)

// startupNoiseProfile is the noise profile to apply at startup: the stored
// noise_profile setting when there is a valid one, else ARTEX_NOISE_PROFILE.
func startupNoiseProfile(pg *db.DB) egress.Profile {
	v, ok, err := pg.GetSetting(settingNoiseProfile)
	if err != nil {
		log.Printf("[egress] read %s setting: %v; using ARTEX_NOISE_PROFILE", settingNoiseProfile, err)
	}
	if ok {
		if p, valid := egress.ProfileByName(v); valid {
			return p
		}
		log.Printf("[egress] stored %s=%q is not off, quiet, balanced or aggressive; using ARTEX_NOISE_PROFILE", settingNoiseProfile, v)
	}
	return egress.ProfileFromEnv()
}

// noiseStatus returns the current noise profile and the per-host counters of
// its governor, read without starting a new minute.
func (s *Server) noiseStatus(w http.ResponseWriter, r *http.Request) {
	g := egress.Current()
	writeJSON(w, 200, map[string]any{"profile": g.Profile().Name, "hosts": g.Snapshot()})
}
