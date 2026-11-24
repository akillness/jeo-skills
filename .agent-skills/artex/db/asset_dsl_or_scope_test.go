package db

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// A top-level OR must be parenthesised as a whole. QueryDSLInScope appends the
// task-scope clause with AND, and AND binds tighter than OR, so an unparenthesised
// disjunction lets the first branch return rows from outside the task scope.
func TestBuildDSLWhereWrapsOr(t *testing.T) {
	node, err := ParseDSL("domain=alpha OR domain=beta")
	if err != nil {
		t.Fatal(err)
	}
	where, _, err := buildDSLWhereBase(node, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(where, "((") || !strings.HasSuffix(where, "))") {
		t.Fatalf("compiled to %q: the whole OR group must be parenthesised", where)
	}
}

// TestQueryDSLInScopeOrDoesNotEscape is the behavioural form: an OR query whose
// first branch matches every row must not return an asset outside the task scope.
func TestQueryDSLInScopeOrDoesNotEscape(t *testing.T) {
	d, assets, _ := testSetup(t)
	t.Cleanup(func() { d.Close() })

	task, err := d.CreateTask("or scope", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	stamp := time.Now().UnixNano()
	root := fmt.Sprintf("in%d.invalid", stamp)
	out := fmt.Sprintf("x%d.invalid", stamp)
	marker := fmt.Sprintf("or%d", stamp)

	if err := assets.upsertTaskScope(TaskScope{TaskID: task.ID, Kind: "root_domain", Domain: root}); err != nil {
		t.Fatalf("seed scope: %v", err)
	}

	var inID, outID int64
	for _, r := range []struct {
		domain, root string
		id           *int64
	}{
		{"a." + root, root, &inID},
		{out, out, &outID},
	} {
		if err := d.QueryRow(`INSERT INTO assets(type,domain,root_domain,page_title,last_seen)
			VALUES ('subdomain',$1,$2,$3,now()) RETURNING id`, r.domain, r.root, marker).Scan(r.id); err != nil {
			t.Fatalf("insert %s: %v", r.domain, err)
		}
	}
	t.Cleanup(func() {
		cleanupExec(t, d, `DELETE FROM assets WHERE id=ANY($1::bigint[])`, []int64{inID, outID})
	})

	// The bare marker matches both rows; the second branch names the out-of-scope
	// host. Only the in-scope row may come back.
	got, err := assets.QueryDSLInScope(marker+" OR domain="+out, "", task.ID, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	var sawIn, sawOut bool
	for _, a := range got {
		switch a.ID {
		case inID:
			sawIn = true
		case outID:
			sawOut = true
		}
	}
	if !sawIn {
		t.Fatalf("in-scope asset %d missing from %+v", inID, got)
	}
	if sawOut {
		t.Fatalf("out-of-scope asset %d leaked through an OR query", outID)
	}
}

// TestQueryDSLForCompanyOrDoesNotEscape: the company clause sits outside the
// compiled DSL, so a top-level OR naming another company returns none of its assets.
func TestQueryDSLForCompanyOrDoesNotEscape(t *testing.T) {
	d, assets, _ := testSetup(t)
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	var companyA, companyB, assetA, assetB int64
	for _, c := range []struct {
		key string
		id  *int64
	}{{fmt.Sprintf("dsl-or-a-%d", stamp), &companyA}, {fmt.Sprintf("dsl-or-b-%d", stamp), &companyB}} {
		if err := d.QueryRow(`INSERT INTO companies(name, nkey) VALUES ($1, $1) RETURNING id`, c.key).Scan(c.id); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		cleanupExec(t, d, `DELETE FROM companies WHERE id=ANY($1::bigint[])`, []int64{companyA, companyB})
	})
	for _, a := range []struct {
		company int64
		id      *int64
	}{{companyA, &assetA}, {companyB, &assetB}} {
		domain := fmt.Sprintf("dsl-or-%d-%d.invalid", a.company, stamp)
		if err := d.QueryRow(`INSERT INTO assets(type,domain,root_domain,company_id,last_seen)
			VALUES ('root_domain',$1,$1,$2,now()) RETURNING id`, domain, a.company).Scan(a.id); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		cleanupExec(t, d, `DELETE FROM assets WHERE id=ANY($1::bigint[])`, []int64{assetA, assetB})
	})

	dsl := fmt.Sprintf("company_id=%d OR company_id=%d", companyA, companyB)
	n, err := assets.CountDSLForCompany(dsl, "", 0, companyA)
	if err != nil {
		t.Fatal(err)
	}
	got, err := assets.QueryDSLForCompany(dsl, "", 0, companyA, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 || len(got) != 1 || got[0].ID != assetA {
		t.Fatalf("want only asset %d, got count=%d rows=%+v", assetA, n, got)
	}
}
