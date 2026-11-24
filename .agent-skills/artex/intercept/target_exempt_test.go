package intercept

import (
	"slices"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// An operator may exempt a private unicast IP literal, never a loopback,
// link-local (cloud metadata), unspecified or multicast one.
func TestValidateExemptionHost(t *testing.T) {
	for _, host := range []string{
		"10.0.0.5", "172.16.0.1", "192.168.1.1", "fd00::1", // private unicast
		"203.0.113.7", "2001:db8::1", // public
		"pypi.org", "internal.corp", "localhost", // names: the void rule's business
	} {
		if err := ValidateExemptionHost(host); err != nil {
			t.Errorf("%s refused: %v", host, err)
		}
	}
	for _, host := range []string{
		"169.254.169.254", "169.254.170.2", "169.254.0.1", "fe80::1", "fe80::1%eth0", // link-local, metadata
		"::ffff:169.254.169.254",           // the same address, IPv4-mapped
		"fd00:ec2::254", "100.100.100.200", // metadata outside link-local
		"127.0.0.1", "127.8.8.8", "::1", "::ffff:127.0.0.1", // loopback
		"0.0.0.0", "::", // unspecified
		"224.0.0.1", "239.255.255.250", "ff02::1", "ff05::2", // multicast
	} {
		if err := ValidateExemptionHost(host); err == nil {
			t.Errorf("%s accepted, want it refused", host)
		}
	}
}

// A proxy endpoint configured without a port is exempt on the port net/http
// dials for it (OPEN-9): the scheme's default, 1080 for socks5. An endpoint
// with no port and no known scheme is not listed.
func TestDerivedExemptionsDefaultProxyPort(t *testing.T) {
	ic := New(nil)
	ic.SetDerivedExemptions(func() []string {
		return []string{"socks5://egress.example.net", "SOCKS5H://dns.example.net", "http://proxy.example.net", "https://gw.example.net", "bare.example.net", "socks5://set.example.net:9050"}
	})
	want := []db.TargetExemption{
		{Host: "egress.example.net", Port: 1080}, {Host: "dns.example.net", Port: 1080}, {Host: "proxy.example.net", Port: 80},
		{Host: "gw.example.net", Port: 443}, {Host: "set.example.net", Port: 9050},
	}
	if got := ic.DerivedExemptions(); !slices.Equal(got, want) {
		t.Fatalf("derived exemptions = %+v, want %+v", got, want)
	}
}
