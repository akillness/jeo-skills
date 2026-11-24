package db

import (
	"fmt"
	"math/rand/v2"
	"testing"
	"time"
)

// TestParseScopeLine covers classification + guardrails without a DB.
func TestParseScopeLine(t *testing.T) {
	cases := []struct {
		in      string
		kind    string
		wantErr bool
	}{
		{"example.com", "domain", false},
		{"https://sub.example.com/path", "domain", false},
		{"1.2.3.4", "ip", false},
		{"10.0.0.0/8", "", true}, // over-broad IPv4 (< /16)
		{"198.51.100.0/24", "cidr", false},
		{"co.uk", "", true}, // bare public suffix
		{"not a host", "", true},
		{"1.2.3.1-1.2.3.9", "", true}, // ranges must be CIDR
		{"*.example.com", "domain", false},
		{"https://*.example.co.uk/path", "domain", false},
		{"*.api.example.com", "", true}, // no rule covers only a subdomain's subdomains
		{"*.co.uk", "", true},
		{"*.com", "", true},
		{"*.1.2.3.4", "", true},
		{"api.*.example.com", "", true},
		{"*example.com", "", true},
	}
	for _, c := range cases {
		r, err := ParseScopeLine(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ParseScopeLine(%q) want error, got %+v", c.in, r)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseScopeLine(%q) unexpected error: %v", c.in, err)
			continue
		}
		if r.Kind != c.kind {
			t.Errorf("ParseScopeLine(%q) kind=%q want %q", c.in, r.Kind, c.kind)
		}
	}
}

func TestParseAutoScopeLine(t *testing.T) {
	cases := []struct {
		name       string
		input      string
		kind       string
		normalized string
		wantErr    bool
	}{
		{name: "domain", input: "example.com", kind: "domain", normalized: "example.com"},
		{name: "url", input: "https://sub.example.com/path", kind: "domain", normalized: "sub.example.com"},
		{name: "url query", input: "https://example.com/path?source=x", kind: "domain", normalized: "example.com"},
		{name: "url credentials", input: "https://user:pass@example.com/path", kind: "domain", normalized: "example.com"},
		{name: "url ip", input: "http://203.0.113.10/path", kind: "ip", normalized: "203.0.113.10/32"},
		{name: "ipv4", input: "203.0.113.10", kind: "ip", normalized: "203.0.113.10/32"},
		{name: "ipv6", input: "2001:db8::10", kind: "ip", normalized: "2001:db8::10/128"},
		{name: "cidr", input: "198.51.100.0/24", kind: "cidr", normalized: "198.51.100.0/24"},
		{name: "icp latin", input: "Bei Jing ICP filing 123", kind: "icp", normalized: "beijingicpfiling123"},
		{name: "icp chinese", input: "Shanghai network filing 9988", kind: "icp", normalized: "shanghainetworkfiling9988"},
		{name: "icp domain", input: "icp.example.com", kind: "domain", normalized: "icp.example.com"},
		{name: "icp url query", input: "https://example.com/path?icp=1", kind: "domain", normalized: "example.com"},
		// ICP filing numbers contain no dot: descriptive text that has picked up a
		// domain/version number goes to keyword, otherwise it would be stored as a
		// dead ICP rule that never matches anything.
		{name: "icp with domain text", input: "ICP filing www.example.com", kind: "keyword", normalized: "icp filing www.example.com"},
		{name: "icp with version text", input: "ACME Corp ICP v1.0", kind: "keyword", normalized: "acme corp icp v1.0"},
		{name: "icp fullwidth dot", input: "ICP filing example\uff0ecom", kind: "keyword", normalized: "icp filing example\uff0ecom"},
		{name: "keyword", input: "  ACME   Security  ", kind: "keyword", normalized: "acme security"},
		{name: "colon keyword", input: "ACME: Cloud: Security", kind: "keyword", normalized: "acme: cloud: security"},
		{name: "empty", input: "  ", wantErr: true},
		{name: "invalid cidr", input: "10.0.0.0/not-a-prefix", wantErr: true},
		{name: "invalid ipv4", input: "999.0.0.1", wantErr: true},
		{name: "invalid ipv6", input: "2001:db8::zz", wantErr: true},
		{name: "invalid ipv6 cidr", input: "2001:db8::zz/64", wantErr: true},
		{name: "overbroad cidr", input: "10.0.0.0/8", wantErr: true},
		{name: "bare suffix", input: "co.uk", wantErr: true},
		{name: "empty domain label", input: "foo..example.com", wantErr: true},
		{name: "wildcard domain", input: "*.example.com", kind: "domain", normalized: "example.com"},
		{name: "wildcard url", input: "https://*.Example.com:8443/", kind: "domain", normalized: "example.com"},
		{name: "wildcard idn", input: "*.bücher.de", kind: "domain", normalized: "xn--bcher-kva.de"},
		{name: "wildcard subdomain", input: "*.api.example.com", wantErr: true},
		{name: "wildcard suffix", input: "*.co.uk", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rule, err := ParseAutoScopeLine(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("ParseAutoScopeLine(%q) = %+v, want error", tc.input, rule)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseAutoScopeLine(%q): %v", tc.input, err)
			}
			if rule.Kind != tc.kind {
				t.Fatalf("kind=%q want %q", rule.Kind, tc.kind)
			}
			got := rule.Value
			if rule.Kind == "domain" {
				got = rule.Domain
			} else if rule.Kind == "ip" || rule.Kind == "cidr" {
				got = rule.Net
			}
			if got != tc.normalized {
				t.Fatalf("normalized=%q want %q", got, tc.normalized)
			}
		})
	}
}

func TestExplicitCompanyAttributionSurvivesScopeRebuild(t *testing.T) {
	d, as, cs := testSetup(t)
	defer d.Close()

	stamp := time.Now().UnixNano()
	explicitCompany, _, err := cs.UpsertCompany(fmt.Sprintf("Explicit Attribution %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	autoCompany, _, err := cs.UpsertCompany(fmt.Sprintf("Automatic Attribution %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupCompany(d, explicitCompany)
	defer cleanupCompany(d, autoCompany)

	domain := fmt.Sprintf("explicit-%d.invalid", stamp)
	icp := fmt.Sprintf("ICP-%d", stamp)
	network := fmt.Sprintf("2001:db8:%x::/64", uint64(stamp)&0xffff)
	ip := fmt.Sprintf("2001:db8:%x::10", uint64(stamp)&0xffff)

	// A pre-existing row with company_id and no provenance value represents old
	// installations. The schema default conservatively treats it as explicit.
	var assetID int64
	if err := d.QueryRow(`INSERT INTO assets(type,domain,root_domain,company_id)
		VALUES ('root_domain',$1,$1,$2) RETURNING id`, domain, explicitCompany).Scan(&assetID); err != nil {
		t.Fatal(err)
	}
	defer deleteAsset(d, assetID)
	appID, err := as.UpsertApp(UpsertAppReq{
		Name: fmt.Sprintf("explicit-app-%d", stamp), ICP: icp, CompanyID: &explicitCompany,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer deleteAsset(d, appID)
	autoAssetID, err := as.UpsertIP(UpsertIPReq{IP: ip})
	if err != nil {
		t.Fatal(err)
	}
	defer deleteAsset(d, autoAssetID)

	rules := []ScopeInput{
		{Kind: "domain", Value: domain},
		{Kind: "icp", Value: icp},
		{Kind: "cidr", Value: network},
	}
	if added, _, invalid, errs := cs.AddScopeInputs(autoCompany, rules, "test"); added != len(rules) || invalid != 0 {
		t.Fatalf("AddScopeInputs: added=%d invalid=%d errors=%v", added, invalid, errs)
	}

	assertCompany := func(id, want int64, source string) {
		t.Helper()
		var got *int64
		var gotSource string
		if err := d.QueryRow(`SELECT company_id,company_source FROM assets WHERE id=$1`, id).Scan(&got, &gotSource); err != nil {
			t.Fatal(err)
		}
		if got == nil || *got != want || gotSource != source {
			t.Fatalf("asset %d company=%v source=%q, want %d/%q", id, got, gotSource, want, source)
		}
	}
	assertCompany(assetID, explicitCompany, "explicit")
	assertCompany(appID, explicitCompany, "explicit")
	assertCompany(autoAssetID, autoCompany, "scope")

	// Replacing every matching rule detaches only the automatically-owned row.
	if _, invalid, errs := cs.UpdateScopeInputs(autoCompany, []ScopeInput{
		{Kind: "domain", Value: fmt.Sprintf("replacement-%d.invalid", stamp)},
	}, "test"); invalid != 0 || len(errs) != 0 {
		t.Fatalf("UpdateScopeInputs: invalid=%d errors=%v", invalid, errs)
	}
	assertCompany(assetID, explicitCompany, "explicit")
	assertCompany(appID, explicitCompany, "explicit")
	var autoCompanyID *int64
	var autoSource string
	if err := d.QueryRow(`SELECT company_id,company_source FROM assets WHERE id=$1`, autoAssetID).Scan(&autoCompanyID, &autoSource); err != nil {
		t.Fatal(err)
	}
	if autoCompanyID != nil || autoSource != "scope" {
		t.Fatalf("automatic asset was not detached: company=%v source=%q", autoCompanyID, autoSource)
	}

	if err := cs.RecomputeAttribution(); err != nil {
		t.Fatal(err)
	}
	assertCompany(assetID, explicitCompany, "explicit")
	assertCompany(appID, explicitCompany, "explicit")

	// Deleting the explicitly selected company detaches through the FK, then the
	// transactional rebuild may adopt the assets into a still-valid scope.
	if _, invalid, errs := cs.UpdateScopeInputs(autoCompany, []ScopeInput{
		{Kind: "domain", Value: domain},
		{Kind: "icp", Value: icp},
	}, "test"); invalid != 0 || len(errs) != 0 {
		t.Fatalf("restore fallback scope: invalid=%d errors=%v", invalid, errs)
	}
	if err := cs.DeleteCompany(explicitCompany); err != nil {
		t.Fatal(err)
	}
	assertCompany(assetID, autoCompany, "scope")
	assertCompany(appID, autoCompany, "scope")
}

func TestParseStructuredCompanyScope(t *testing.T) {
	icp, err := ParseScopeInput(ScopeInput{Kind: "ICP", Value: " Beijing ICP filing 123-1\t"})
	if err != nil {
		t.Fatalf("parse ICP: %v", err)
	}
	if icp.Kind != "icp" || icp.Value != "beijingicpfiling123-1" {
		t.Fatalf("unexpected normalized ICP: %+v", icp)
	}
	keyword, err := ParseScopeInput(ScopeInput{Kind: "keyword", Value: "  ACME   Security  "})
	if err != nil {
		t.Fatalf("parse keyword: %v", err)
	}
	if keyword.Value != "acme security" {
		t.Fatalf("unexpected normalized keyword: %+v", keyword)
	}
	if _, err := ParseScopeInput(ScopeInput{Kind: "ip", Value: "example.com"}); err == nil {
		t.Fatal("typed IP accepted a domain")
	}
}

func TestCompanyICPAttribution(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Closing the connection must go through t.Cleanup and be **registered before
	// the data cleanup**: t.Cleanup is last-in-first-out, so registering Close
	// first means it runs last and the cleanup below can still reach the database.
	// This used to be `defer d.Close()`: defer runs when the function returns,
	// before t.Cleanup, so the cleanup statements all landed on an **already closed
	// connection**, and the errors were discarded by `_, _ =` — assets and the
	// company stayed in the database forever. Leftover rows do not fail
	// immediately, but this test uses `MAX(companies.id)+1` as a fake TaskID tag
	// for its assets (see suffix below); once that number collides with another
	// test's task id, that test's "exactly N assets" assertion fails out of
	// nowhere — extremely expensive to debug.
	t.Cleanup(func() { d.Close() })

	var suffix int64
	if err := d.QueryRow(`SELECT COALESCE(MAX(id),0)+1 FROM companies`).Scan(&suffix); err != nil {
		t.Fatal(err)
	}
	cs := d.Companies()
	as := d.Assets()
	companyID, _, err := cs.UpsertCompany(fmt.Sprintf("ICP Scope Co %d", suffix), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		// Do not swallow errors: a failed cleanup pollutes later tests and must
		// surface in this run.
		if _, err := d.Exec(`DELETE FROM assets WHERE task_ids @> ARRAY[$1]::bigint[]`, suffix); err != nil {
			t.Errorf("failed to clean up test assets: %v", err)
		}
		if _, err := d.Exec(`DELETE FROM companies WHERE id=$1`, companyID); err != nil {
			t.Errorf("failed to clean up test company: %v", err)
		}
	})

	// A keyword can guide an Agent, but must never claim an asset by its name.
	added, _, invalid, errs := cs.AddScopeInputs(companyID, []ScopeInput{
		{Kind: "icp", Value: "Beijing ICP filing 998877"},
		{Kind: "keyword", Value: "ICP Scope"},
	}, "unit test")
	if added != 2 || invalid != 0 || len(errs) != 0 {
		t.Fatalf("add structured scope: added=%d invalid=%d errors=%v", added, invalid, errs)
	}

	rootID, err := as.UpsertRootDomain(UpsertRootDomainReq{
		Domain: fmt.Sprintf("icp-scope-%d.example", suffix), ICP: "beijingicpfiling998877", TaskID: suffix,
	})
	if err != nil {
		t.Fatal(err)
	}
	appID, err := as.UpsertApp(UpsertAppReq{
		Name: fmt.Sprintf("ICP Scope Keyword Only %d", suffix), TaskID: suffix,
	})
	if err != nil {
		t.Fatal(err)
	}
	icpAppID, err := as.UpsertApp(UpsertAppReq{
		Name: fmt.Sprintf("ICP Matched App %d", suffix), ICP: " Beijing ICP filing 998877 ", TaskID: suffix,
	})
	if err != nil {
		t.Fatal(err)
	}

	assertCompany := func(assetID int64, want *int64) {
		t.Helper()
		var got *int64
		if err := d.QueryRow(`SELECT company_id FROM assets WHERE id=$1`, assetID).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if want == nil && got != nil {
			t.Fatalf("asset %d attributed by keyword: %d", assetID, *got)
		}
		if want != nil && (got == nil || *got != *want) {
			t.Fatalf("asset %d company=%v want %d", assetID, got, *want)
		}
	}
	assertCompany(rootID, &companyID)
	assertCompany(appID, nil)
	assertCompany(icpAppID, &companyID)
}

// TestCompanyScopeAttribution exercises the full loop against dev PG: create
// company (unique name), add scope, and verify auto-attribution at insert time,
// backfill of a pre-existing asset, CIDR + domain-suffix matching, and that
// out-of-scope assets stay unattributed.
func TestCompanyScopeAttribution(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	as := d.Assets()
	cs := d.Companies()

	var startMax int64
	if err := d.QueryRow(`SELECT COALESCE(MAX(id),0) FROM assets`).Scan(&startMax); err != nil {
		d.Close()
		t.Fatalf("startMax: %v", err)
	}
	// Remove everything the test creates, or the next pass on the same database
	// finds this company's scope and attributes its assets to it. Assets first
	// (they reference the company), then the company; its scope rows cascade.
	var cid int64
	t.Cleanup(func() {
		defer d.Close()
		if _, err := d.Exec(`DELETE FROM assets WHERE id > $1`, startMax); err != nil {
			t.Errorf("cleanup assets: %v", err)
		}
		if cid != 0 {
			if _, err := d.Exec(`DELETE FROM companies WHERE id = $1`, cid); err != nil {
				t.Errorf("cleanup company %d: %v", cid, err)
			}
		}
	})

	// Unique per run: MAX(assets.id) comes back to the same value after cleanup,
	// so it cannot tell one pass from the next. The in-scope /24 is picked per
	// run from 198.18.0.0/15 so a scope left by an interrupted run cannot claim
	// this run's IP.
	uniq := fmt.Sprintf("%d%d", time.Now().UnixNano(), rand.Uint32())
	n := rand.IntN(512)
	cidr := fmt.Sprintf("198.%d.%d.0/24", 18+n/256, n%256)
	root := fmt.Sprintf("scopetest%s.com", uniq)
	sub := "api." + root
	ipIn := fmt.Sprintf("198.%d.%d.9", 18+n/256, n%256)
	ipOut := "203.0.113.9"
	outDomain := fmt.Sprintf("other%s.net", uniq)

	cid, _, err = cs.UpsertCompany(fmt.Sprintf("ScopeCo %s", uniq), "")
	if err != nil {
		t.Fatalf("UpsertCompany: %v", err)
	}

	// a pre-existing asset (inserted BEFORE any scope) — must be back-filled.
	preID, err := as.UpsertSubdomain(UpsertSubdomainReq{Domain: sub})
	if err != nil {
		t.Fatalf("pre upsert: %v", err)
	}
	var preCompanyID *int64
	d.QueryRow(`SELECT company_id FROM assets WHERE id = $1`, preID).Scan(&preCompanyID)
	if preCompanyID != nil {
		t.Fatalf("pre-scope asset should be unattributed, got %v", *preCompanyID)
	}

	cs.AddScope(cid, []string{root, cidr}, "unit test")

	mustCid := func(id int64, want int64, label string) {
		var cID *int64
		d.QueryRow(`SELECT company_id FROM assets WHERE id = $1`, id).Scan(&cID)
		if cID == nil {
			t.Fatalf("%s company_id = nil, want %d", label, want)
		}
		if *cID != want {
			t.Fatalf("%s company_id = %d, want %d", label, *cID, want)
		}
	}
	mustNil := func(id int64, label string) {
		var cID *int64
		d.QueryRow(`SELECT company_id FROM assets WHERE id = $1`, id).Scan(&cID)
		if cID != nil {
			t.Fatalf("%s should be unattributed, got %d", label, *cID)
		}
	}

	// backfill attributed the pre-existing subdomain (domain suffix match).
	mustCid(preID, cid, "pre-existing subdomain (backfill)")

	// insert-time attribution: ip in CIDR, another subdomain.
	ipInID, err := as.UpsertIP(UpsertIPReq{IP: ipIn})
	if err != nil {
		t.Fatalf("UpsertIP in: %v", err)
	}
	mustCid(ipInID, cid, "in-CIDR ip (insert-time)")

	sub2ID, err := as.UpsertSubdomain(UpsertSubdomainReq{Domain: "www." + root})
	if err != nil {
		t.Fatalf("UpsertSubdomain: %v", err)
	}
	mustCid(sub2ID, cid, "new subdomain (insert-time)")

	// out of scope stays unattributed.
	outID, err := as.UpsertRootDomain(UpsertRootDomainReq{Domain: outDomain})
	if err != nil {
		t.Fatalf("UpsertRootDomain out: %v", err)
	}
	mustNil(outID, "out-of-scope domain")

	ipOutID, err := as.UpsertIP(UpsertIPReq{IP: ipOut})
	if err != nil {
		t.Fatalf("UpsertIP out: %v", err)
	}
	mustNil(ipOutID, "out-of-CIDR ip")
}

// A "*.example.com" line is stored as the example.com domain rule, so it
// attributes the subdomains just as a plain example.com line does.
func TestCompanyScopeWildcardAttribution(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	as := d.Assets()
	cs := d.Companies()

	var startMax int64
	if err := d.QueryRow(`SELECT COALESCE(MAX(id),0) FROM assets`).Scan(&startMax); err != nil {
		d.Close()
		t.Fatalf("startMax: %v", err)
	}
	var cid int64
	t.Cleanup(func() {
		defer d.Close()
		if _, err := d.Exec(`DELETE FROM assets WHERE id > $1`, startMax); err != nil {
			t.Errorf("cleanup assets: %v", err)
		}
		if cid != 0 {
			if _, err := d.Exec(`DELETE FROM companies WHERE id = $1`, cid); err != nil {
				t.Errorf("cleanup company %d: %v", cid, err)
			}
		}
	})

	uniq := fmt.Sprintf("%d%d", time.Now().UnixNano(), rand.Uint32())
	root := fmt.Sprintf("wildcardtest%s.com", uniq)
	cid, _, err = cs.UpsertCompany(fmt.Sprintf("WildcardCo %s", uniq), "")
	if err != nil {
		t.Fatalf("UpsertCompany: %v", err)
	}
	cs.AddScope(cid, []string{"*." + root}, "unit test")

	var domain string
	if err := d.QueryRow(`SELECT domain FROM company_scope WHERE company_id = $1 AND kind = 'domain'`, cid).Scan(&domain); err != nil {
		t.Fatalf("read scope: %v", err)
	}
	if domain != root {
		t.Fatalf("stored domain = %q, want %q", domain, root)
	}

	id, err := as.UpsertSubdomain(UpsertSubdomainReq{Domain: "api." + root})
	if err != nil {
		t.Fatalf("UpsertSubdomain: %v", err)
	}
	var got *int64
	d.QueryRow(`SELECT company_id FROM assets WHERE id = $1`, id).Scan(&got)
	if got == nil || *got != cid {
		t.Fatalf("api.%s company_id = %v, want %d", root, got, cid)
	}
}
