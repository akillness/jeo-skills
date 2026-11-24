package db

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

const restoreURLHost = "restore-userinfo.example"

// bigintArray renders ids as a PostgreSQL array literal for a $n::bigint[] cast.
func bigintArray(ids ...int64) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = fmt.Sprint(id)
	}
	return "{" + strings.Join(parts, ",") + "}"
}

// archivedAssetRows exports live asset rows the way SnapshotTaskArchive does,
// so the restore tests start from realistic archive JSON.
func archivedAssetRows(t *testing.T, d *DB, ids ...int64) []map[string]any {
	t.Helper()
	raw, _, err := queryArchiveRows(d, `SELECT asset.* FROM assets asset WHERE asset.id = ANY($1::bigint[]) ORDER BY asset.id`, bigintArray(ids...))
	if err != nil {
		t.Fatal(err)
	}
	rows, err := decodeArchiveRows(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != len(ids) {
		t.Fatalf("exported %d archive rows, want %d", len(rows), len(ids))
	}
	return rows
}

// restoreArchivedAssets runs restoreArchiveAssets on rows in a committed tx.
func restoreArchivedAssets(t *testing.T, d *DB, taskID int64, rows []map[string]any) map[int64]int64 {
	t.Helper()
	raw, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := d.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback() //nolint:errcheck
	mapping, _, err := restoreArchiveAssets(tx, taskID, raw)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return mapping
}

func restoreURLCleanup(d *DB) {
	d.Exec(`DELETE FROM assets WHERE url LIKE '%` + restoreURLHost + `%' OR domain LIKE '%` + restoreURLHost + `' OR root_domain = '` + restoreURLHost + `' OR ip = '198.51.100.231'`) //nolint:errcheck
}

func countRestoreURLRows(t *testing.T, d *DB, assetType, cleanURL string) int {
	t.Helper()
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM assets WHERE type=$1 AND (url=$2 OR url LIKE '%@%' || $3::text || '%')`, assetType, cleanURL, restoreURLHost).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func assertNoRestoreURLCredential(t *testing.T, d *DB, id int64) {
	t.Helper()
	var row string
	if err := d.QueryRow(`SELECT row_to_json(a)::text FROM assets a WHERE id=$1`, id).Scan(&row); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"alice", "bob", "s3cr3t"} {
		if strings.Contains(row, secret) {
			t.Fatalf("restored asset %d still carries %q: %s", id, secret, row)
		}
	}
}

func TestRestoreArchiveAssetsStripsURLUserinfo(t *testing.T) {
	d, av2, _ := testSetup(t)
	defer d.Close()
	restoreURLCleanup(d)
	defer restoreURLCleanup(d)
	const taskID = int64(880000001)

	svcURL := "http://" + restoreURLHost + ":8080/admin"
	epURL := "https://api." + restoreURLHost + "/users?id=1"
	svcID, err := av2.UpsertHTTPService(UpsertHTTPServiceReq{URL: svcURL, TaskID: taskID})
	if err != nil {
		t.Fatal(err)
	}
	epID, err := av2.UpsertEndpoint(UpsertEndpointReq{URL: epURL, Method: "GET", TaskID: taskID})
	if err != nil {
		t.Fatal(err)
	}
	rows := archivedAssetRows(t, d, svcID, epID)
	// Simulate an archive taken before normalizeURL dropped userinfo.
	rows[0]["url"] = "http://alice:s3cr3t-one@" + restoreURLHost + ":8080/admin"
	rows[1]["url"] = "https://bob:s3cr3t-two@api." + restoreURLHost + "/users?id=1"
	archived := map[string]map[string]any{"service": {}, "endpoint": {}}
	for _, row := range rows {
		typeName := row["type"].(string)
		for _, key := range []string{"domain", "root_domain", "port", "service_name", "method"} {
			archived[typeName][key] = row[key]
		}
	}
	if _, err := d.Exec(`DELETE FROM assets WHERE id = ANY($1::bigint[])`, bigintArray(svcID, epID)); err != nil {
		t.Fatal(err)
	}

	mapping := restoreArchivedAssets(t, d, taskID, rows)
	for oldID, wantURL := range map[int64]string{svcID: svcURL, epID: epURL} {
		newID := mapping[oldID]
		if newID == 0 {
			t.Fatalf("asset %d was not restored: %v", oldID, mapping)
		}
		var gotURL, typeName string
		var domain, rootDomain, serviceName, method *string
		var port *int64
		if err := d.QueryRow(`SELECT url,type,domain,root_domain,port,service_name,method FROM assets WHERE id=$1`, newID).
			Scan(&gotURL, &typeName, &domain, &rootDomain, &port, &serviceName, &method); err != nil {
			t.Fatal(err)
		}
		if gotURL != wantURL {
			t.Fatalf("restored %s url=%q, want %q", typeName, gotURL, wantURL)
		}
		assertNoRestoreURLCredential(t, d, newID)
		// Only url is normalised: the other columns keep the archived values.
		want := archived[typeName]
		got := map[string]any{"domain": domain, "root_domain": rootDomain, "port": port, "service_name": serviceName, "method": method}
		for key, value := range got {
			gotJSON, _ := json.Marshal(value)
			wantJSON, _ := json.Marshal(want[key])
			if string(gotJSON) != string(wantJSON) {
				t.Errorf("%s %s=%s, want archived %s", typeName, key, gotJSON, wantJSON)
			}
		}
		if n := countRestoreURLRows(t, d, typeName, wantURL); n != 1 {
			t.Fatalf("%s rows for %q = %d, want 1", typeName, wantURL, n)
		}
	}
}

func TestRestoreArchiveAssetsReusesCleanURLRow(t *testing.T) {
	d, av2, _ := testSetup(t)
	defer d.Close()
	restoreURLCleanup(d)
	defer restoreURLCleanup(d)
	const liveTaskID, archivedTaskID = int64(880000002), int64(880000003)

	svcURL := "http://" + restoreURLHost + ":8080/admin"
	epURL := "https://api." + restoreURLHost + "/users?id=1"
	svcID, err := av2.UpsertHTTPService(UpsertHTTPServiceReq{URL: svcURL, TaskID: liveTaskID})
	if err != nil {
		t.Fatal(err)
	}
	epID, err := av2.UpsertEndpoint(UpsertEndpointReq{URL: epURL, Method: "GET", TaskID: liveTaskID})
	if err != nil {
		t.Fatal(err)
	}
	rows := archivedAssetRows(t, d, svcID, epID)
	// The archived rows are other, older rows whose url still carries userinfo.
	rows[0]["id"], rows[0]["url"] = int64(990000101), "http://alice:s3cr3t-one@"+restoreURLHost+":8080/admin"
	rows[1]["id"], rows[1]["url"] = int64(990000102), "https://bob:s3cr3t-two@api."+restoreURLHost+"/users?id=1"
	for _, row := range rows {
		row["task_ids"] = []any{archivedTaskID}
	}

	mapping := restoreArchivedAssets(t, d, archivedTaskID, rows)
	for oldID, existingID := range map[int64]int64{990000101: svcID, 990000102: epID} {
		if mapping[oldID] != existingID {
			t.Fatalf("archived asset %d mapped to %d, want existing clean row %d", oldID, mapping[oldID], existingID)
		}
		var taskIDs string
		if err := d.QueryRow(`SELECT task_ids::text FROM assets WHERE id=$1`, existingID).Scan(&taskIDs); err != nil {
			t.Fatal(err)
		}
		if want := bigintArray(liveTaskID, archivedTaskID); taskIDs != want {
			t.Fatalf("asset %d task_ids=%s, want %s", existingID, taskIDs, want)
		}
		assertNoRestoreURLCredential(t, d, existingID)
		var leftover int
		if err := d.QueryRow(`SELECT count(*) FROM assets WHERE id=$1`, oldID).Scan(&leftover); err != nil {
			t.Fatal(err)
		}
		if leftover != 0 {
			t.Fatalf("archived asset %d inserted beside the clean row", oldID)
		}
	}
	if n := countRestoreURLRows(t, d, "service", svcURL); n != 1 {
		t.Fatalf("service rows = %d, want 1", n)
	}
	if n := countRestoreURLRows(t, d, "endpoint", epURL); n != 1 {
		t.Fatalf("endpoint rows = %d, want 1", n)
	}
}

func TestRestoreArchiveAssetsDedupsURLAcrossCredentials(t *testing.T) {
	d, av2, _ := testSetup(t)
	defer d.Close()
	restoreURLCleanup(d)
	defer restoreURLCleanup(d)
	const taskID = int64(880000004)

	svcURL := "http://" + restoreURLHost + ":8080/admin"
	svcID, err := av2.UpsertHTTPService(UpsertHTTPServiceReq{URL: svcURL, TaskID: taskID})
	if err != nil {
		t.Fatal(err)
	}
	first := archivedAssetRows(t, d, svcID)[0]
	second := archivedAssetRows(t, d, svcID)[0]
	if _, err := d.Exec(`DELETE FROM assets WHERE id=$1`, svcID); err != nil {
		t.Fatal(err)
	}
	first["id"], first["url"] = int64(990000201), "http://alice:s3cr3t-one@"+restoreURLHost+":8080/admin"
	second["id"], second["url"] = int64(990000202), "http://bob:s3cr3t-two@"+restoreURLHost+":8080/admin"

	mapping := restoreArchivedAssets(t, d, taskID, []map[string]any{first, second})
	if mapping[990000201] == 0 || mapping[990000201] != mapping[990000202] {
		t.Fatalf("credential variants restored as separate rows: %v", mapping)
	}
	if n := countRestoreURLRows(t, d, "service", svcURL); n != 1 {
		t.Fatalf("service rows = %d, want exactly 1", n)
	}
	assertNoRestoreURLCredential(t, d, mapping[990000201])
}

func TestRestoreArchiveAssetsLeavesDomainAndIPURLUntouched(t *testing.T) {
	d, av2, _ := testSetup(t)
	defer d.Close()
	restoreURLCleanup(d)
	defer restoreURLCleanup(d)
	const taskID = int64(880000005)

	domainID, err := av2.UpsertRootDomain(UpsertRootDomainReq{Domain: restoreURLHost, TaskID: taskID})
	if err != nil {
		t.Fatal(err)
	}
	ipID, err := av2.UpsertIP(UpsertIPReq{IP: "198.51.100.231", TaskID: taskID})
	if err != nil {
		t.Fatal(err)
	}
	rows := archivedAssetRows(t, d, domainID, ipID)
	// A url normalizeURL would rewrite proves the normalisation is scoped to
	// service and endpoint rows.
	const oddURL = "HTTP://Restore-Userinfo.example/"
	for _, row := range rows {
		row["url"] = oddURL
	}
	want := map[int64][]any{}
	for _, row := range rows {
		id, _ := jsonInt64(row["id"])
		want[id] = []any{row["type"], row["domain"], row["root_domain"], row["ip"]}
	}
	if _, err := d.Exec(`DELETE FROM assets WHERE id = ANY($1::bigint[])`, bigintArray(domainID, ipID)); err != nil {
		t.Fatal(err)
	}

	mapping := restoreArchivedAssets(t, d, taskID, rows)
	for oldID, fields := range want {
		var typeName string
		var domain, rootDomain, ip, gotURL *string
		if err := d.QueryRow(`SELECT type,domain,root_domain,ip,url FROM assets WHERE id=$1`, mapping[oldID]).
			Scan(&typeName, &domain, &rootDomain, &ip, &gotURL); err != nil {
			t.Fatal(err)
		}
		got, _ := json.Marshal([]any{typeName, domain, rootDomain, ip})
		wantJSON, _ := json.Marshal(fields)
		if string(got) != string(wantJSON) {
			t.Errorf("asset %d restored as %s, want %s", oldID, got, wantJSON)
		}
		if gotURL == nil || *gotURL != oddURL {
			t.Errorf("%s asset url changed to %v, want %q", typeName, gotURL, oddURL)
		}
	}
}
