package agent

import (
	"strings"
	"testing"
)

// readBbotJSONL parses a valid file line by line, and skips and counts a line
// over bbotMaxLineBytes without losing the lines around it. A line exactly at
// the cap, its newline included, is kept.
func TestReadBbotJSONLLineCap(t *testing.T) {
	res, oversized, err := readBbotJSONL(strings.NewReader(bbotFixture))
	if err != nil || oversized != 0 || res.Skipped != 0 || len(res.InScope) != 2 || len(res.Intel) != 1 {
		t.Fatalf("valid file: %d in scope, %d intel, %d skipped, %d oversized, err %v; want 2, 1, 0, 0, nil",
			len(res.InScope), len(res.Intel), res.Skipped, oversized, err)
	}
	if res.InScope[0].Host != "www.example.com" || res.Intel[0].Host != "partner.example.net" || res.InScope[1].Type != "FINDING" {
		t.Fatalf("valid file parsed out of order: %+v / %+v", res.InScope, res.Intel)
	}

	// A valid intel line padded to exactly the cap, newline included.
	head := `{"type":"DNS_NAME","host":"atcap.example.net","scope_distance":1,"pad":"`
	tail := "\"}\n"
	atCap := head + strings.Repeat("a", bbotMaxLineBytes-len(head)-len(tail)) + tail
	overCap := `{"type":"DNS_NAME","host":"overcap.example.com","scope_distance":0,"pad":"` + strings.Repeat("b", bbotMaxLineBytes) + "\"}\n"
	in := `{"type":"DNS_NAME","host":"first.example.com","scope_distance":0}` + "\n" +
		overCap + atCap +
		"not json at all\n" +
		`{"type":"DNS_NAME","host":"last.example.com","scope_distance":0}` // no trailing newline
	res, oversized, err = readBbotJSONL(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if oversized != 1 || res.Skipped != 1 {
		t.Fatalf("oversized=%d skipped=%d, want 1 and 1", oversized, res.Skipped)
	}
	var hosts []string
	for _, ev := range append(append([]bbotEvent{}, res.InScope...), res.Intel...) {
		hosts = append(hosts, ev.Host)
	}
	if got := strings.Join(hosts, ","); got != "first.example.com,last.example.com,atcap.example.net" {
		t.Fatalf("hosts = %s; the over-cap line must be dropped and the others kept", got)
	}

	// A file that is one over-cap line with no newline.
	res, oversized, err = readBbotJSONL(strings.NewReader(strings.Repeat("c", 3*bbotMaxLineBytes)))
	if err != nil || oversized != 1 || len(res.InScope)+len(res.Intel)+res.Skipped != 0 {
		t.Fatalf("single over-cap line: oversized=%d res=%+v err=%v", oversized, res, err)
	}
}
