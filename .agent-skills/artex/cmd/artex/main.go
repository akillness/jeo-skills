// Command artex runs the ARTEX backend: the dual PostgreSQL graph stores,
// the event-driven exploration engine, and the JSON HTTP API consumed by the
// shadcn/ui frontend.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/config"
	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/server"
)

// configSnapshot is the single startup log line describing the effective
// configuration. It carries no credential material: the DSN is passed through
// config.Redact, and no key or token value is ever included.
type configSnapshot struct {
	Version           string   `json:"version"`
	ConfigFile        string   `json:"config_file"`
	ConfigFileFound   bool     `json:"config_file_found"`
	PGDSN             string   `json:"pg_dsn"`
	PGDSNSource       string   `json:"pg_dsn_source"`
	DataDir           string   `json:"data_dir"`
	SkillDir          string   `json:"skill_dir"`
	KeyDir            string   `json:"key_dir"`
	Addr              string   `json:"addr"`
	Proxy             string   `json:"proxy"`
	NoiseProfile      string   `json:"noise_profile"`
	UntrustedBoundary bool     `json:"untrusted_boundary"`
	TrustedProxies    []string `json:"trusted_proxies"`
}

// logConfigSnapshot emits one structured line so an operator can reproduce the
// exact configuration of a run from the logs. A serialization failure is
// reported but never aborts startup.
func logConfigSnapshot(s configSnapshot) {
	b, err := json.Marshal(s)
	if err != nil {
		log.Printf("[config] snapshot unavailable: %v", err)
		return
	}
	log.Printf("[config] snapshot %s", b)
}

// version is the build version, injected at release time via
// -ldflags "-X main.version=<tag>". Defaults to "dev" for local builds.
var version = "dev"

const banner = `
    _    ____ _____ _______  __
   / \  |  _ \_   _| ____\ \/ /
  / _ \ | |_) || | |  _|  \  /
 / ___ \|  _ < | | | |___ /  \
/_/   \_\_| \_\|_| |_____/_/\_\
`

// printBanner writes the startup banner + version/runtime info to stdout.
func printBanner(addr string) {
	fmt.Print(banner)
	fmt.Println("  AI autonomous penetration testing system")
	fmt.Printf("  version %s  ·  %s/%s  ·  %s  ·  listening on %s\n\n",
		version, runtime.GOOS, runtime.GOARCH, runtime.Version(), addr)
}

// main maps run's result onto the process exit code. The body lives in a
// function that can *return* rather than os.Exit, so its own defers still run.
func main() {
	// Started as the Bash shim or as an MCP drop command: drop the identity and exec
	// the real program. It returns only for an ordinary start.
	server.RunExecShimIfRequested(os.Args)
	// Before any listener or child exists: keep the secrets out of /proc/<pid>/environ.
	server.SealProcessEnv()
	os.Exit(run())
}

// flagWasSet reports whether the operator passed the named flag.
func flagWasSet(name string) bool {
	set := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == name {
			set = true
		}
	})
	return set
}

func run() int {
	var (
		addr    = flag.String("addr", "127.0.0.1:8787", "HTTP listen address")
		dataDir = flag.String("data", filepath.Join(config.BaseDir(), "data"), "runtime data directory: traffic index, task files, transcripts (default: data/ next to the executable)")
		proxy   = flag.String("proxy", "127.0.0.1:8788", "traffic recording proxy address (empty to disable)")
		// Identity of every agent process (Bash, the shell, custom tools, MCP stdio).
		// A negative uid turns the drop off; 0 (root) is refused.
		execUID = flag.Int("exec-uid", server.DefaultExecUID, "uid that agent processes run as (Bash, shell, custom tools, MCP stdio); -1 turns the drop off")
		execGID = flag.Int("exec-gid", server.DefaultExecGID, "gid that agent processes run as")
		// Development escape of the isolation self-test, off by default.
		devNoIsolation = flag.Bool(server.DevNoIsolationFlag, false, "DEVELOPMENT ONLY: on Linux as root, start even when the agent isolation self-test fails; agent processes and file tools may then read the server's keys, config and database credentials")
	)
	flag.Parse()

	// hand the build version to the server package so GET /api/health can report it
	// to the frontend top bar.
	server.BuildVersion = version

	printBanner(*addr)

	// capture backend logs into the in-memory sink (still to stderr) so the /logs
	// page can show a live log stream. Do this first, to catch startup logs too.
	server.StartLogCapture()

	// Resolve every effective setting before starting the stores, then emit a
	// single structured snapshot line. The old code logged the same facts in
	// five scattered lines, which made a run hard to reproduce from logs.
	cfgPath := config.Path() // absolute, so `go run`'s relative CWD is unambiguous
	if abs, e := filepath.Abs(cfgPath); e == nil {
		cfgPath = abs
	}
	_, statErr := os.Stat(cfgPath)
	cfgFound := statErr == nil

	skillDir, err := config.SkillDir()
	if err != nil {
		log.Printf("[config] %v", err)
		return 1
	}
	if abs, e := filepath.Abs(skillDir); e == nil {
		skillDir = abs
	}
	// JWT signing key directory (also holds secret.key, see server.NewManager).
	keyDir := config.KeyDir()
	// Proxies whose X-Forwarded-For the login rate limit reads; empty trusts none.
	trusted, err := server.ParseTrustedProxies(os.Getenv("ARTEX_TRUSTED_PROXIES"))
	if err != nil {
		log.Printf("[config] ARTEX_TRUSTED_PROXIES: %v", err)
		return 1
	}
	trustedAddrs := make([]string, 0, len(trusted))
	for _, p := range trusted {
		trustedAddrs = append(trustedAddrs, p.String())
	}

	// NewManager resolves the DSN too, but does so internally. Calling
	// PostgresDSN here is idempotent (no connection, no side effects) and lets
	// the snapshot show the source and a redacted view even on a failed start.
	dsn, dsnSource, dsnErr := config.PostgresDSN()
	if dsnErr != nil {
		dsn, dsnSource = "", "unavailable"
	}
	logConfigSnapshot(configSnapshot{
		Version:           version,
		ConfigFile:        cfgPath,
		ConfigFileFound:   cfgFound,
		PGDSN:             config.Redact(dsn),
		PGDSNSource:       dsnSource,
		DataDir:           *dataDir,
		SkillDir:          skillDir,
		KeyDir:            keyDir,
		Addr:              *addr,
		Proxy:             *proxy,
		NoiseProfile:      egress.ProfileFromEnv().Name,
		UntrustedBoundary: agent.UntrustedBoundaryEnabled(),
		TrustedProxies:    trustedAddrs,
	})

	// Agent processes run as the executor identity, never as the server's root (see
	// server/execpriv.go). An explicit option that cannot be applied stops the start.
	priv, err := server.ResolveExecPrivilege(*execUID, *execGID, flagWasSet("exec-uid") || flagWasSet("exec-gid"))
	if err != nil {
		log.Printf("[config] %v", err)
		return 1
	}
	if err := server.PrepareExecPrivilege(&priv, *dataDir, config.KeyDir(), config.Path()); err != nil {
		log.Printf("[config] %v", err)
		return 1
	}
	if err := server.InstallBashShim(priv); err != nil {
		log.Printf("[config] %v", err)
		return 1
	}
	// Before the stores open and any agent runs: check that the isolation above holds
	// (server/isolation.go). On Linux as root a failure stops the start unless the
	// escape is set; elsewhere the server starts degraded and says so.
	selfTest := server.IsolationSelfTest(priv, server.IsolationTargets{
		DataDir: *dataDir, KeyDir: keyDir, ConfigPath: cfgPath, SkillDir: skillDir, DSN: dsn,
	})
	isolation, err := server.EnforceIsolation(runtime.GOOS, priv, selfTest, *devNoIsolation)
	if err != nil {
		log.Printf("[config] %v", err)
		return 1
	}

	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, shutdown := shutdownContext(sigCtx)
	defer shutdown(agent.AbortShutdown)

	mgr, err := server.NewManager(*dataDir, *proxy)
	if err != nil {
		log.Fatalf("open stores: %v", err)
	}
	defer mgr.Close()

	srv := server.New(ctx, mgr, skillDir, *dataDir, keyDir, server.WithSecretScrub(), server.WithTrustedProxies(trusted), server.WithExecPrivilege(priv), server.WithIsolationStatus(isolation))
	// ReadTimeout bounds how long the request headers and body may take to arrive.
	// It does not limit how long a handler runs, so an event stream stays open.
	// WriteTimeout is left unset: a write deadline would cut that stream.
	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		log.Printf("ARTEX %s backend listening on %s (data=%s, workers=%d)", version, *addr, *dataDir, mgr.Workers())
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	// Wait for a stop signal.
	<-ctx.Done()

	log.Println("shutting down...")
	// Close the listener before draining. Otherwise a request accepted during
	// the drain can start a detached run, and mgr.Close runs while that run
	// is still writing.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	httpErr := httpSrv.Shutdown(shutdownCtx)
	cancel()
	if httpErr != nil {
		log.Printf("http shutdown: %v", httpErr)
	}
	drainCtx, drainCancel := context.WithTimeout(context.Background(), 15*time.Second)
	drainErr := srv.Wait(drainCtx)
	drainCancel()
	if drainErr != nil {
		log.Printf("task drain: %v", drainErr)
	}
	// The health writer flushes on ctx.Done(). Wait for it before the deferred
	// store close, so the last cooling window is not written at a closed database.
	srv.FlushLLMHealth()
	if httpErr != nil || drainErr != nil {
		return 1
	}
	return 0
}

// shutdownContext deliberately does not derive from signalCtx. If it did, the
// parent's plain context.Canceled could win the race before AbortShutdown was
// attached to the child, losing the diagnostic cause in every running Agent.
func shutdownContext(signalCtx context.Context) (context.Context, context.CancelCauseFunc) {
	ctx, shutdown := context.WithCancelCause(context.Background())
	go func() {
		select {
		case <-signalCtx.Done():
			shutdown(agent.AbortShutdown)
		case <-ctx.Done():
		}
	}()
	return ctx, shutdown
}
