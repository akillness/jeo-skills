package server

import (
	"reflect"
	"strings"
	"testing"
)

func TestResolveExecPrivilegeNegativeUIDDisables(t *testing.T) {
	p, err := ResolveExecPrivilege(-1, DefaultExecGID, true)
	if err != nil {
		t.Fatalf("explicit disable must not fail: %v", err)
	}
	if p.Enabled {
		t.Fatal("negative uid must disable the drop")
	}
}

func TestResolveExecPrivilegeRefusesRootIdentity(t *testing.T) {
	for _, c := range [][2]int{{0, DefaultExecGID}, {DefaultExecUID, 0}} {
		if _, err := ResolveExecPrivilege(c[0], c[1], true); err == nil {
			t.Fatalf("uid %d gid %d: root identity must be refused", c[0], c[1])
		}
	}
}

// Without root the drop cannot be applied: an explicit request is a startup error
// (fail closed), the default degrades to a disabled privilege.
func TestResolveExecPrivilegeWithoutRoot(t *testing.T) {
	if serverIsRoot() && execPrivilegeSupported() {
		t.Skip("needs a process that cannot switch identity")
	}
	p, err := ResolveExecPrivilege(DefaultExecUID, DefaultExecGID, false)
	if err != nil || p.Enabled {
		t.Fatalf("default request must degrade quietly: enabled=%v err=%v", p.Enabled, err)
	}
	if _, err := ResolveExecPrivilege(DefaultExecUID, DefaultExecGID, true); err == nil {
		t.Fatal("explicit request must fail closed")
	}
}

func TestResolveExecPrivilegeAsRoot(t *testing.T) {
	if !serverIsRoot() || !execPrivilegeSupported() {
		t.Skip("needs a root process on a platform with credentials")
	}
	p, err := ResolveExecPrivilege(DefaultExecUID, DefaultExecGID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !p.Enabled || p.UID != DefaultExecUID || p.GID != DefaultExecGID {
		t.Fatalf("got %+v", p)
	}
}

func TestExecDropCommandDisabledKeepsCommand(t *testing.T) {
	cmd, args, err := execDropCommand(ExecPrivilege{}, "npx", []string{"-y", "pkg"})
	if err != nil {
		t.Fatal(err)
	}
	if cmd != "npx" || !reflect.DeepEqual(args, []string{"-y", "pkg"}) {
		t.Fatalf("disabled drop must not rewrite the command: %q %v", cmd, args)
	}
}

func TestExecDropCommandWrapsForShim(t *testing.T) {
	p := ExecPrivilege{Enabled: true, UID: 10001, GID: 10002}
	_, args, err := execDropCommand(p, "npx", []string{"-y", "pkg"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{execDropArg, "10001", "10002", "--", "npx", "-y", "pkg"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
}

func TestWithExecPrivilegeSetsServerField(t *testing.T) {
	s := &Server{}
	p := ExecPrivilege{Enabled: true, UID: 10001, GID: 10001}
	WithExecPrivilege(p)(s)
	if s.execPriv != p {
		t.Fatalf("execPriv = %+v, want %+v", s.execPriv, p)
	}
}

func TestSealedEnvRoundTripKeepsEmptyAndMultiline(t *testing.T) {
	in := []string{
		"ARTEX_PG_DSN=postgres://u:p@h/db?sslmode=disable\nsecond line\ttab",
		"ARTEX_SECRET_KEY=",
		"ANTHROPIC_API_KEY=sk-ant-test",
		"OPENAI_API_KEY==leading-equals",
	}
	out, err := decodeSealedEnv(encodeSealedEnv(in))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(out, in) {
		t.Fatalf("round trip changed the values:\n got %q\nwant %q", out, in)
	}
}

func TestSealedEnvRejectsForeignNames(t *testing.T) {
	if _, err := decodeSealedEnv([]byte("PATH=/bin\x00")); err == nil {
		t.Fatal("a name outside secretEnv must be rejected")
	}
	if _, err := decodeSealedEnv([]byte("ANTHROPIC_API_KEY=x")); err == nil {
		t.Fatal("an unterminated entry must be rejected")
	}
}

func TestWithoutSecretEnvDropsOnlySecrets(t *testing.T) {
	env := []string{"PATH=/bin", "ARTEX_PG_DSN=x", "HOME=/root", "OPENAI_API_KEY=", "ARTEX_SECRET_KEY=y"}
	got := withoutSecretEnv(env)
	want := []string{"PATH=/bin", "HOME=/root"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for _, kv := range got {
		if isSecretName(strings.SplitN(kv, "=", 2)[0]) {
			t.Fatalf("secret left in %q", kv)
		}
	}
}
