package agent

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/egress"
)

// noiseProfileHeader starts the code-owned noise block. The block is appended to
// every agent prompt that can launch Bash; with no profile it is empty, so the
// prompts stay byte-for-byte unchanged by default.
const noiseProfileHeader = "[Noise profile: "

// noiseProfileBlock returns the low-and-slow guidance for the current noise
// profile (the noise_profile setting, else ARTEX_NOISE_PROFILE), or "" when the
// profile is off. It is read at each prompt build, so a changed setting shows in
// the next prompt. The text is code-owned and carries no target data.
func noiseProfileBlock() string { return renderNoiseProfile(egress.CurrentProfile()) }

// renderNoiseProfile renders the block for one profile. It is pure: tests cover
// every profile without touching the environment.
func renderNoiseProfile(p egress.Profile) string {
	if p.Name == "" || p.Name == "off" || p.RPS <= 0 {
		return ""
	}
	rps := int(p.RPS + 0.5)
	if rps < 1 {
		rps = 1
	}
	conc := p.MaxPerHost
	if conc < 1 {
		conc = 1
	}
	// The profile's delay between requests is 1/RPS (500 ms, 200 ms, 50 ms).
	delayMS := int((time.Second / time.Duration(rps)) / time.Millisecond)
	delaySec := strconv.FormatFloat(1/float64(rps), 'f', -1, 64)
	inFlight := fmt.Sprintf("%d requests", conc)
	if conc == 1 {
		inFlight = "1 request"
	}
	// nmap and masscan count packets, not requests; the profile's RPS is used as a
	// deliberately conservative packet cap.
	timing := map[string]string{"quiet": "-T2", "balanced": "-T3", "aggressive": "-T4"}[p.Name]
	if timing == "" {
		timing = "-T3"
	}
	retries := "2"
	if p.Name == "aggressive" {
		retries = "1"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s%s. Operator setting, not a target fact.]\n", noiseProfileHeader, p.Name)
	b.WriteString("Scan at a reduced rate. When you run one of these scanners, use the flags exactly:\n")
	fmt.Fprintf(&b, "- nmap: %s --max-rate %d --max-retries %s\n", timing, rps, retries)
	fmt.Fprintf(&b, "- nuclei: -rate-limit %d -c %d\n", rps, conc)
	fmt.Fprintf(&b, "- httpx: -rl %d -t %d\n", rps, conc)
	fmt.Fprintf(&b, "- katana: -rl %d -c %d\n", rps, conc)
	fmt.Fprintf(&b, "- ffuf: -rate %d -t %d\n", rps, conc)
	fmt.Fprintf(&b, "- dalfox scan: --rate-limit %d --workers %d\n", rps, conc)
	fmt.Fprintf(&b, "- sqlmap: --delay=%s --threads=1\n", delaySec)
	fmt.Fprintf(&b, "For any other tool, stay at or below %d requests per second per host, at most %s in flight, and at least %d ms between requests, using the tool's own rate or delay flag. Keep bbot within the same limits with its own rate settings, and do not enable active modules the program policy does not allow.\n", rps, inFlight, delayMS)
	b.WriteString("Prefer passive and read-only checks; test one host at a time; do not run two scanners against the same host in parallel; on 429 or 503 stop and back off; never raise the rate to meet a deadline.\n")
	b.WriteString("ARTEX paces its own WebFetch, http custom tool and enrich traffic with this profile. With traffic capture on, Bash commands that use the capture proxy (curl, wget, python-requests) are paced too, by rate and jitter; raw scanners such as nmap and commands that bypass the proxy are not. These flags remain the brake: do not rely on the proxy.\n")
	return b.String()
}
