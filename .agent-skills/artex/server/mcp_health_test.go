package server

import (
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// The health columns must reflect the outcome of every connect attempt and
// transition cleanly down -> ok, so the UI badge and the mcp_status tool can
// show operators why a server's tools are missing (#38).
func TestMCPHealthStateTransitions(t *testing.T) {
	s, _, _ := trafficEvidenceServer(t)
	pg := s.m.pg

	row := &db.MCPServer{Name: "health-test", Transport: "http", URL: "http://127.0.0.1:1/mcp", Enabled: true}
	id, err := pg.SaveMCP(row)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DeleteMCP(id) })

	found := listMCPByName(t, pg, "health-test")
	if found.LastConnectAt != nil || found.LastConnectOK != nil || found.LastConnectErr != nil {
		t.Fatalf("fresh server should have no health state, got %+v", found)
	}

	if err := pg.UpdateMCPHealth(id, false, "connect: no route to host"); err != nil {
		t.Fatal(err)
	}
	found = listMCPByName(t, pg, "health-test")
	if found.LastConnectOK == nil || *found.LastConnectOK {
		t.Fatal("expected last_connect_ok = false after a failed connect")
	}
	if found.LastConnectErr == nil || !strings.Contains(*found.LastConnectErr, "no route") {
		t.Fatalf("expected the failure reason, got %+v", found.LastConnectErr)
	}

	if err := pg.UpdateMCPHealth(id, true, ""); err != nil {
		t.Fatal(err)
	}
	found = listMCPByName(t, pg, "health-test")
	if found.LastConnectOK == nil || !*found.LastConnectOK {
		t.Fatal("expected last_connect_ok = true after a successful connect")
	}
	if found.LastConnectErr != nil {
		t.Fatalf("expected the error cleared on success, got %q", *found.LastConnectErr)
	}
}

func listMCPByName(t *testing.T, pg *db.DB, name string) *db.MCPServer {
	t.Helper()
	rows, err := pg.ListMCP()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == name {
			return r
		}
	}
	t.Fatalf("server %s not found", name)
	return nil
}
