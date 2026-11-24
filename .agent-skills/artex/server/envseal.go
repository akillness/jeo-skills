package server

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"
	"strings"
)

// Sealing the server environment. ScrubSecretEnv removes the secrets from the Go
// environment, but the kernel keeps the environment block the process was executed
// with: /proc/<pid>/environ still shows ARTEX_PG_DSN, ARTEX_PG_PASSWORD,
// ARTEX_SECRET_KEY and the API keys to any process that can read it.
// SealProcessEnv re-executes the server once,
// with those variables left out of the block; the values travel to the new image
// through an inherited pipe and are put back into the Go environment there, so the
// readers that run next see the same configuration.
//
// Only Linux has /proc and an exec that keeps the PID, so the handoff is Linux-only
// (envseal_linux.go). Elsewhere SealProcessEnv logs that the environment is not sealed.

// sealFDEnv names the inherited descriptor that carries the sealed values. It is set
// only for the re-executed image and removed as soon as that image reads it.
const sealFDEnv = "ARTEX_SEALED_FD"

// sealMaxPayload keeps the handoff well inside a pipe buffer (64 KiB on Linux), so the
// write before the exec never blocks. The secrets are a few hundred bytes in practice.
const sealMaxPayload = 16 << 10

// errSealUnsupported reports a platform where the environment block cannot be replaced.
var errSealUnsupported = errors.New("replacing the process environment is not supported on this platform")

// SealProcessEnv keeps the secrets out of the process environment block. Call it first
// in main, before any listener opens or any child starts. In the re-executed image it
// restores the values; a failure to restore is fatal, since the server cannot run
// without its configuration.
func SealProcessEnv() {
	if raw, ok := os.LookupEnv(sealFDEnv); ok {
		os.Unsetenv(sealFDEnv)
		if err := restoreSealedEnv(raw); err != nil {
			log.Fatalf("[env] sealed environment handoff failed: %v", err)
		}
		return
	}
	var kvs []string
	for _, k := range secretEnv {
		if v, ok := os.LookupEnv(k); ok {
			kvs = append(kvs, k+"="+v)
		}
	}
	if len(kvs) == 0 {
		return
	}
	payload := encodeSealedEnv(kvs)
	if len(payload) > sealMaxPayload {
		log.Printf("[env] server environment not sealed: the secrets are too large for the handoff; they remain readable from /proc/<pid>/environ")
		return
	}
	// reexecSealed returns only when the exec did not happen.
	err := reexecSealed(withoutSecretEnv(os.Environ()), payload)
	if errors.Is(err, errSealUnsupported) {
		log.Printf("[env] server environment not sealed on this platform: secrets remain in the process environment")
		return
	}
	log.Printf("[env] server environment not sealed (%v): secrets remain readable from /proc/<pid>/environ", err)
}

// restoreSealedEnv reads the handoff from the descriptor named by raw and sets the
// values in the Go environment.
func restoreSealedEnv(raw string) error {
	fd, err := strconv.Atoi(raw)
	if err != nil || fd < 0 {
		return fmt.Errorf("bad descriptor %q", raw)
	}
	f := os.NewFile(uintptr(fd), "artex-sealed-env")
	data, err := io.ReadAll(f)
	f.Close()
	if err != nil {
		return err
	}
	kvs, err := decodeSealedEnv(data)
	if err != nil {
		return err
	}
	for _, kv := range kvs {
		k, v, _ := strings.Cut(kv, "=")
		if err := os.Setenv(k, v); err != nil {
			return err
		}
	}
	return nil
}

// encodeSealedEnv writes NAME=VALUE entries, each terminated by a NUL. Values may be
// empty or span lines; an environment value cannot contain NUL, so the terminator is
// unambiguous.
func encodeSealedEnv(kvs []string) []byte {
	var b []byte
	for _, kv := range kvs {
		b = append(b, kv...)
		b = append(b, 0)
	}
	return b
}

// decodeSealedEnv parses encodeSealedEnv's output. Only the names in secretEnv are
// accepted: the handoff carries nothing else, and an unknown name means corruption.
func decodeSealedEnv(b []byte) ([]string, error) {
	var kvs []string
	for len(b) > 0 {
		i := bytes.IndexByte(b, 0)
		if i < 0 {
			return nil, errors.New("sealed environment is not terminated")
		}
		entry := string(b[:i])
		b = b[i+1:]
		name, _, ok := strings.Cut(entry, "=")
		if !ok || !isSecretName(name) {
			return nil, fmt.Errorf("unexpected entry in the sealed environment")
		}
		kvs = append(kvs, entry)
	}
	return kvs, nil
}

func isSecretName(name string) bool {
	for _, k := range secretEnv {
		if k == name {
			return true
		}
	}
	return false
}

// withoutSecretEnv returns the environment block without the secret entries.
func withoutSecretEnv(env []string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		name, _, _ := strings.Cut(kv, "=")
		if !isSecretName(name) {
			out = append(out, kv)
		}
	}
	return out
}
