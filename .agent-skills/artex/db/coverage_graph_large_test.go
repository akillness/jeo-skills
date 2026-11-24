package db

import (
	"fmt"
	"strings"
	"testing"
)

// largeCoverageFixture is a task scoped by 800 subdomains spread over 200 root
// domains and 20 companies, with 1,000 services, 1,200 endpoints and 2,000
// anchored facts. Every tenth root has no asset row, so the graph needs both
// real and synthetic ("r:<domain>") connector roots.
type largeCoverageFixture struct {
	taskID, expID int64
	suffix        string
}

const (
	lcRoots     = 200
	lcCompanies = 20
	lcSubs      = 800
	lcServices  = 1000
	lcEndpoints = 1200
	lcFacts     = 2000
)

func seedLargeCoverageFixture(tb testing.TB, d *DB) largeCoverageFixture {
	tb.Helper()
	task, err := d.CreateTask("large coverage graph", "large coverage graph", nil, 0, 0)
	if err != nil {
		tb.Fatal(err)
	}
	f := largeCoverageFixture{taskID: task.ID, expID: task.ExplorationID, suffix: fmt.Sprintf("lc%d", task.ID)}
	tb.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, f.expID)
		_ = d.DeleteTask(f.taskID)
		_, _ = d.Exec(`DELETE FROM assets WHERE root_domain LIKE '%-'||$1||'.cov.test'`, f.suffix)
		_, _ = d.Exec(`DELETE FROM companies WHERE nkey LIKE 'lcco-'||$1||'-%'`, f.suffix)
	})
	exec := func(q string, args ...any) {
		tb.Helper()
		if _, err := d.Exec(q, args...); err != nil {
			tb.Fatalf("%v\n%s", err, q)
		}
	}
	// root g: r<g>-<suffix>.cov.test, company 1+(g-1)%lcCompanies.
	// subdomain i: s<i>.<root 1+(i-1)%lcRoots>.
	exec(`INSERT INTO companies(name,nkey)
SELECT 'large co '||g||' '||$1, 'lcco-'||$1||'-'||g FROM generate_series(1,$2) g`, f.suffix, lcCompanies)
	exec(`INSERT INTO assets(type,domain,root_domain,company_id)
SELECT 'root_domain', 'r'||g||'-'||$1||'.cov.test', 'r'||g||'-'||$1||'.cov.test',
       (SELECT id FROM companies WHERE nkey='lcco-'||$1||'-'||(1+(g-1)%$3))
FROM generate_series(1,$2) g WHERE g%10<>0`, f.suffix, lcRoots, lcCompanies)
	exec(`INSERT INTO assets(type,domain,root_domain,company_id)
SELECT 'subdomain', 's'||i||'.r'||r||'-'||$1||'.cov.test', 'r'||r||'-'||$1||'.cov.test',
       (SELECT id FROM companies WHERE nkey='lcco-'||$1||'-'||(1+(r-1)%$4))
FROM generate_series(1,$3) i, LATERAL (SELECT 1+(i-1)%$2 AS r) x`, f.suffix, lcRoots, lcSubs, lcCompanies)
	// service j hangs off subdomain 1+(j-1)%lcSubs: port 443 for the first
	// lcSubs services, 8443 for the rest.
	exec(`INSERT INTO assets(type,service_type,url,domain,root_domain,port,company_id)
SELECT 'service','http', 'https://'||s.domain||':'||p||'/', s.domain, s.root_domain, p, s.company_id
FROM generate_series(1,$2) j
CROSS JOIN LATERAL (SELECT CASE WHEN j<=$3 THEN 443 ELSE 8443 END AS p) port
JOIN assets s ON s.type='subdomain' AND s.root_domain LIKE '%-'||$1||'.cov.test'
 AND s.domain LIKE 's'||(1+(j-1)%$3)||'.%'`, f.suffix, lcServices, lcSubs)
	exec(`INSERT INTO assets(type,url,method,domain,root_domain,port,company_id)
SELECT 'endpoint', 'https://'||s.domain||'/p/'||k, 'GET', s.domain, s.root_domain, 443, s.company_id
FROM generate_series(1,$2) k
JOIN assets s ON s.type='subdomain' AND s.root_domain LIKE '%-'||$1||'.cov.test'
 AND s.domain LIKE 's'||(1+(k-1)%$3)||'.%'`, f.suffix, lcEndpoints, lcSubs)
	exec(`INSERT INTO task_scope(task_id,kind,domain,source)
SELECT $1,'subdomain',domain,'manual' FROM assets
WHERE type='subdomain' AND root_domain LIKE '%-'||$2||'.cov.test'`, f.taskID, f.suffix)
	exec(`INSERT INTO exploration_nodes(exploration_id,kind,state,payload)
SELECT $1,'fact','confirmed',jsonb_build_object('summary','large coverage fact '||g) FROM generate_series(1,$2) g`, f.expID, lcFacts)
	exec(`WITH fn AS (
  SELECT id, row_number() OVER (ORDER BY id) rn FROM exploration_nodes
  WHERE exploration_id=$1 AND kind='fact' AND payload->>'summary' LIKE 'large coverage fact %'),
an AS (
  SELECT id, row_number() OVER (ORDER BY id) rn FROM assets
  WHERE type<>'root_domain' AND root_domain LIKE '%-'||$2||'.cov.test')
INSERT INTO exploration_anchors(node_id,asset_id) SELECT fn.id, an.id FROM fn JOIN an USING (rn)`, f.expID, f.suffix)
	exec(`ANALYZE assets, task_scope, exploration_nodes, exploration_anchors, companies`)
	return f
}

func TestBuildCoverageGraphLargeInvariants(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })
	f := seedLargeCoverageFixture(t, d)

	g, err := d.Assets().BuildCoverageGraph(f.taskID, f.expID)
	if err != nil {
		t.Fatal(err)
	}

	const (
		syntheticRoots = lcRoots / 10
		realRoots      = lcRoots - syntheticRoots
		inScope        = lcSubs + lcServices + lcEndpoints
		wantNodes      = inScope + lcRoots + lcCompanies
		// subdomain→root, service→subdomain, endpoint→service (port 443), and
		// real root→company; a synthetic root has no company.
		wantEdges = lcSubs + lcServices + lcEndpoints + realRoots
	)
	if len(g.Nodes) != wantNodes || len(g.Edges) != wantEdges {
		t.Fatalf("graph size: nodes=%d edges=%d, want %d/%d", len(g.Nodes), len(g.Edges), wantNodes, wantEdges)
	}

	byKey := make(map[string]CoverageGraphNode, len(g.Nodes))
	kinds := map[string]int{}
	var tested, scoped, synthetic, realConnector int
	for _, n := range g.Nodes {
		if _, dup := byKey[n.Key]; dup {
			t.Fatalf("duplicate node key %q", n.Key)
		}
		byKey[n.Key] = n
		kinds[n.Kind]++
		if n.Tested {
			tested++
		}
		if n.InScope {
			scoped++
		}
		switch {
		case strings.HasPrefix(n.Key, "r:"):
			synthetic++
			if n.Kind != "root_domain" || n.InScope || n.AssetID != 0 || n.Key != "r:"+n.Domain {
				t.Fatalf("synthetic root: %+v", n)
			}
		case n.Kind == "root_domain":
			realConnector++
			if n.InScope || n.AssetID == 0 || n.CompanyID == 0 {
				t.Fatalf("connector root: %+v", n)
			}
		case n.Kind == "company":
			if n.InScope || n.Label == "" || n.Key != companyKey(n.CompanyID) {
				t.Fatalf("company node: %+v", n)
			}
		}
	}
	if kinds["subdomain"] != lcSubs || kinds["service"] != lcServices || kinds["endpoint"] != lcEndpoints ||
		kinds["root_domain"] != lcRoots || kinds["company"] != lcCompanies {
		t.Fatalf("node kinds: %v", kinds)
	}
	if synthetic != syntheticRoots || realConnector != realRoots {
		t.Fatalf("connector roots: synthetic=%d real=%d, want %d/%d", synthetic, realConnector, syntheticRoots, realRoots)
	}
	if scoped != inScope || tested != lcFacts {
		t.Fatalf("in_scope=%d tested=%d, want %d/%d", scoped, tested, inScope, lcFacts)
	}

	seenEdge := map[CoverageGraphEdge]bool{}
	for _, e := range g.Edges {
		src, okSrc := byKey[e.Src]
		dst, okDst := byKey[e.Dst]
		if !okSrc || !okDst || e.Src == e.Dst {
			t.Fatalf("edge %+v points to a missing node", e)
		}
		if seenEdge[e] {
			t.Fatalf("duplicate edge %+v", e)
		}
		seenEdge[e] = true
		want := map[string]string{"subdomain": "root_domain", "service": "subdomain", "endpoint": "service", "root_domain": "company"}[src.Kind]
		if dst.Kind != want {
			t.Fatalf("edge %s(%s) -> %s(%s), want parent kind %s", e.Src, src.Kind, e.Dst, dst.Kind, want)
		}
	}
}

// BenchmarkBuildCoverageGraphLarge locks in the cost of the coverage graph on
// the large fixture (statement count and query plan). No time assertion.
func BenchmarkBuildCoverageGraphLarge(b *testing.B) {
	dsn, _, err := DSN()
	if err != nil {
		b.Skipf("no database config (%v) - skipping", err)
	}
	d, err := Open(dsn)
	if err != nil {
		b.Skipf("postgres unavailable (%v) - skipping", err)
	}
	b.Cleanup(func() { d.Close() })
	f := seedLargeCoverageFixture(b, d)
	store := d.Assets()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		g, err := store.BuildCoverageGraph(f.taskID, f.expID)
		if err != nil {
			b.Fatal(err)
		}
		if len(g.Nodes) == 0 {
			b.Fatal("empty graph")
		}
	}
}
