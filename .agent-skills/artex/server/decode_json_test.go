package server

import (
	"encoding/json"
	"testing"
)

func TestDecodeStrMapJSONNull(t *testing.T) {
	m := decodeStrMap(json.RawMessage("null"))
	if m == nil {
		t.Fatal("JSON null must decode to an empty map, not nil")
	}
	m["NODE_EXTRA_CA_CERTS"] = "/tmp/ca.pem"
	if m["NODE_EXTRA_CA_CERTS"] != "/tmp/ca.pem" {
		t.Fatal("decoded map must be writable")
	}

	empty := decodeStrMap(nil)
	if empty == nil {
		t.Fatal("empty input must decode to an empty map")
	}

	got := decodeStrMap(json.RawMessage(`{"FOO":"bar"}`))
	if got["FOO"] != "bar" {
		t.Fatalf("got %#v", got)
	}

	invalid := decodeStrMap(json.RawMessage(`["not","an","object"]`))
	if invalid == nil {
		t.Fatal("invalid JSON must decode to an empty map")
	}
}
