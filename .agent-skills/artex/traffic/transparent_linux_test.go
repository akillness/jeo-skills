//go:build linux

package traffic

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"

	"github.com/Autumn-27/artex/egress"
)

const transparentRedirectChildEnv = "ARTEX_TRANSPARENT_REDIRECT_CHILD"

// TestTransparentTCPLinuxRealIptablesRedirect exercises real Linux kernel
// iptables REDIRECT + getsockopt(SOL_IP, SO_ORIGINAL_DST) inside an isolated
// user+network namespace (unshare -rn) so the host firewall is never touched.
// Skips cleanly when unshare/ip/iptables are unavailable in the environment.
func TestTransparentTCPLinuxRealIptablesRedirect(t *testing.T) {
	if os.Getenv(transparentRedirectChildEnv) != "1" {
		for _, bin := range []string{"unshare", "ip", "iptables"} {
			if _, err := exec.LookPath(bin); err != nil {
				t.Skipf("skipping real iptables REDIRECT test: %s not found: %v", bin, err)
			}
		}
		probe := exec.Command("unshare", "-rn", "sh", "-c", "ip link set lo up && iptables -t nat -L OUTPUT -n >/dev/null")
		if out, err := probe.CombinedOutput(); err != nil {
			t.Skipf("skipping real iptables REDIRECT test: isolated netns/iptables unavailable: %v (%s)", err, bytes.TrimSpace(out))
		}

		cmd := exec.Command("unshare", "-rn", os.Args[0], "-test.v", "-test.run", "^TestTransparentTCPLinuxRealIptablesRedirect$")
		cmd.Env = append(os.Environ(), transparentRedirectChildEnv+"=1")
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("isolated netns iptables REDIRECT test failed: %v\n%s", err, string(out))
		}
		return
	}

	// Inside isolated user+network namespace: bring up loopback.
	if out, err := exec.Command("ip", "link", "set", "lo", "up").CombinedOutput(); err != nil {
		t.Fatalf("ip link set lo up: %v (%s)", err, string(out))
	}

	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	// Upstream target echo server listening on 127.0.0.2:<echoPort>.
	echoLn, err := net.Listen("tcp4", "127.0.0.2:0")
	if err != nil {
		t.Fatalf("listen echo on 127.0.0.2:0: %v", err)
	}
	defer echoLn.Close()
	go func() {
		for {
			c, err := echoLn.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				req, _ := io.ReadAll(conn)
				_, _ = conn.Write(append([]byte("NETNS-ECHO:"), req...))
			}(c)
		}
	}()
	echoPort := echoLn.Addr().(*net.TCPAddr).Port

	// Start transparent TCP listener on 127.0.0.1:0 with NO origDst hook (uses real SO_ORIGINAL_DST).
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	bound, err := tr.StartTransparentTCP(TransparentTCPConfig{
		Addr: "127.0.0.1:0",
	})
	if err != nil {
		t.Fatalf("StartTransparentTCP: %v", err)
	}
	transPort := func() int {
		_, p, err := net.SplitHostPort(bound)
		if err != nil {
			t.Fatal(err)
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}()

	// Redirect ONLY packets sourced from 127.0.0.3 destined to 127.0.0.2:<echoPort>
	// into the transparent listener on <transPort>. ARTEX's own outbound dial uses
	// default loopback source 127.0.0.1 and therefore bypasses REDIRECT cleanly.
	iptArgs := []string{
		"-t", "nat", "-A", "OUTPUT",
		"-p", "tcp",
		"-s", "127.0.0.3",
		"-d", "127.0.0.2",
		"--dport", strconv.Itoa(echoPort),
		"-j", "REDIRECT", "--to-ports", strconv.Itoa(transPort),
	}
	if out, err := exec.Command("iptables", iptArgs...).CombinedOutput(); err != nil {
		t.Fatalf("iptables %v: %v (%s)", iptArgs, err, string(out))
	}

	// 1. Real redirected client connection to 127.0.0.2:<echoPort> from 127.0.0.3.
	dialer := net.Dialer{
		Timeout:   2 * time.Second,
		LocalAddr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 3)},
	}
	client, err := dialer.Dial("tcp4", fmt.Sprintf("127.0.0.2:%d", echoPort))
	if err != nil {
		t.Fatalf("dial redirected target: %v", err)
	}
	msg := []byte("real-so-original-dst-payload")
	if _, err := client.Write(msg); err != nil {
		t.Fatal(err)
	}
	if err := client.(*net.TCPConn).CloseWrite(); err != nil {
		t.Fatal(err)
	}
	reply, err := io.ReadAll(client)
	if err != nil {
		t.Fatal(err)
	}
	_ = client.Close()
	want := append([]byte("NETNS-ECHO:"), msg...)
	if !bytes.Equal(reply, want) {
		t.Fatalf("redirected reply = %q, want %q", reply, want)
	}

	// Verify real SO_ORIGINAL_DST recovered 127.0.0.2:<echoPort> and stored raw_tcp_streams row.
	streams := waitForRawStreams(t, tr, 1)
	st := streams[0]
	if st.Protocol != "tcp" || st.Host != "127.0.0.2" || st.Port != echoPort {
		t.Fatalf("recorded stream = %+v, want host=127.0.0.2 port=%d", st, echoPort)
	}
	if st.C2SBytes != int64(len(msg)) || st.S2CBytes != int64(len(want)) {
		t.Fatalf("recorded bytes = (%d, %d), want (%d, %d)", st.C2SBytes, st.S2CBytes, len(msg), len(want))
	}
	var httpCount int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchanges`).Scan(&httpCount); err != nil || httpCount != 0 {
		t.Fatalf("HTTP exchanges = (%d, %v), want 0", httpCount, err)
	}

	// 2. Direct non-redirected connection to the transparent port must be refused as a self-loop.
	direct, err := net.DialTimeout("tcp4", bound, 2*time.Second)
	if err != nil {
		t.Fatalf("dial direct: %v", err)
	}
	_ = direct.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 1)
	if _, rerr := direct.Read(buf); rerr == nil {
		t.Fatal("expected direct non-redirected connection to transparent port to be refused")
	}
	_ = direct.Close()
}
