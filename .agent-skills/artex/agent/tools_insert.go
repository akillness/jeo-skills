package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// assetInterceptCandidates extracts the domain/IP/URL candidate strings of an
// asset item pending insertion, for asset-interception matching. A URL's host is
// broken out and classified, so service/endpoint assets that carry "only a URL" can
// still be hit by domain/IP rules.
func assetInterceptCandidates(item assetInputItem) (domains, ips, urls []string) {
	add := func(dst *[]string, s string) {
		if s = strings.TrimSpace(s); s != "" {
			*dst = append(*dst, s)
		}
	}
	add(&domains, item.Domain)
	for _, d := range item.BoundDomains {
		add(&domains, d)
	}
	add(&ips, item.IP)
	add(&ips, item.ServiceIP)
	add(&urls, item.URL)
	if item.URL != "" {
		if u, err := url.Parse(item.URL); err == nil {
			if h := u.Hostname(); h != "" {
				if net.ParseIP(h) != nil {
					add(&ips, h)
				} else {
					add(&domains, h)
				}
			}
		}
	}
	return domains, ips, urls
}

// assetInputLabel returns a short label for an asset item pending insertion, used
// in interception explanation messages.
func assetInputLabel(item assetInputItem) string {
	typ := strings.TrimSpace(item.Type)
	var target string
	switch {
	case strings.TrimSpace(item.Domain) != "":
		target = strings.TrimSpace(item.Domain)
	case strings.TrimSpace(item.URL) != "":
		target = strings.TrimSpace(item.URL)
	case strings.TrimSpace(item.IP) != "":
		target = strings.TrimSpace(item.IP)
	case strings.TrimSpace(item.ServiceIP) != "":
		target = strings.TrimSpace(item.ServiceIP)
	default:
		target = "(unknown)"
	}
	if typ != "" {
		return fmt.Sprintf("[%s] %s", typ, target)
	}
	return target
}

// =====================================================================
// Unified asset insertion tools
// =====================================================================

// SetAssetStore wires the asset store and company store onto this ToolSet
// so the insert_assets, add_company_scope, and list_assets tools are active.
func (t *ToolSet) SetAssetStore(as *db.AssetStore, cs *db.CompanyStore) {
	t.as = as
	t.cs = cs
}

// assetInputItem is one element of the insert_assets "assets" array.
type assetInputItem struct {
	Type string `json:"type"` // root_domain|ip|subdomain|app|service|endpoint

	// ---- root_domain / subdomain ----
	Domain      string   `json:"domain"`
	ICP         string   `json:"icp"`
	RecordType  string   `json:"record_type"`
	RecordValue []string `json:"record_value"`

	// ---- ip ----
	IP           string           `json:"ip"`
	BoundDomains []string         `json:"bound_domains"`
	OpenPorts    []db.PortService `json:"open_ports"`

	// ---- app ----
	AppName     string `json:"app_name"`
	BundleID    string `json:"bundle_id"`
	Category    string `json:"category"`
	Description string `json:"description"`
	AppICP      string `json:"app_icp"`
	CompanyID   *int64 `json:"company_id"` // explicit company link (app only; others auto-attribute via scope)

	// ---- service (http) ----
	URL           string           `json:"url"`
	Technologies  []string         `json:"technologies"`
	StatusCode    *int             `json:"status_code"`
	ContentLength *int64           `json:"content_length"`
	PageTitle     string           `json:"page_title"`
	FaviconMMH3   string           `json:"favicon_mmh3"`
	Auth          []map[string]any `json:"auth"`
	ServiceName   string           `json:"service_name"`
	ServiceIP     string           `json:"service_ip"` // optional enrichment IP

	// ---- service (other) ----
	Port  int    `json:"port"`
	Proto string `json:"proto"`

	// ---- endpoint ----
	Method string           `json:"method"`
	Params []map[string]any `json:"params"`
}

// insertAssetsRuleLoadFailure refuses the whole insert_assets call when
// intercept rules cannot be loaded. The underlying error stays in the process
// log so the model never sees a driver string.
func insertAssetsRuleLoadFailure(err error) (actool.Result, bool) {
	if err == nil {
		return actool.Result{}, false
	}
	log.Printf("[insert_assets] intercept rules unavailable: %v", err)
	return actool.Errorf("asset intercept rules are unavailable; insertion refused"), true
}

// insertAssets is the unified insert_assets agent tool.
func (t *ToolSet) insertAssets() actool.CoreTool {
	return writeTool(
		"insert_assets",
		"Register newly discovered assets in bulk; multiple types can be mixed in one call (see the type enum).\n"+
			"Required fields per type: root_domain→domain; ip→ip (must be IPv4/IPv6, not a hostname); subdomain→domain; app→app_name; service(HTTP)→url; service(non-HTTP)→service_name+port (at least one of ip/domain); endpoint→url+method. See each field's own description for the rest.\n"+
			"auth/technologies/params are append-merged, not overwritten.\n"+
			"Returns: {results:[{index,id,type}], errors:[{index,error}]}",
		obj(map[string]any{
			// task_id is not exposed to the model: which task a worker belongs to is
			// authoritatively assigned by the program via SetTaskID (see handler).
			"assets": map[string]any{
				"type":        "array",
				"description": "asset array; each element is one asset record",
				"items": obj(map[string]any{
					"type": map[string]any{
						"type":        "string",
						"enum":        []string{"root_domain", "ip", "subdomain", "app", "service", "endpoint"},
						"description": "asset type",
					},
					// root_domain / subdomain
					"domain":      str("root domain or subdomain (required for root_domain/subdomain)"),
					"icp":         str("ICP registration number (optional)"),
					"record_type": str("DNS record type: A/AAAA/CNAME/MX etc. (optional for subdomain)"),
					"record_value": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "list of DNS record values (optional for subdomain, e.g. [\"1.2.3.4\",\"2.3.4.5\"])",
					},
					// ip
					"ip": str("IP address — must be an IPv4/IPv6 address, not a hostname (for a hostname use the domain field of type=subdomain); required for ip type; may be filled for service/endpoint types to link the IP"),
					"bound_domains": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "list of domains bound to this IP (optional for ip type)",
					},
					"open_ports": map[string]any{
						"type":        "array",
						"description": "list of open ports (optional for ip type)",
						"items": obj(map[string]any{
							"port":    intp("port number"),
							"service": str("service name, e.g. http/ssh/mysql (optional)"),
						}, "port"),
					},
					// app
					"app_name":    str("application name (required for app type)"),
					"bundle_id":   str("Bundle ID (optional for app type)"),
					"category":    str("application category (optional)"),
					"description": str("application description (optional)"),
					"app_icp":     str("application ICP registration (optional)"),
					"company_id":  intp("owning company id (optional for app type; an app cannot be auto-attributed via scope, so specify it explicitly. The id is returned by add_company_scope)"),
					// service (http)
					"url":         str("full URL, including scheme and port (required for HTTP service; service_type is auto-set to http)"),
					"status_code": intp("HTTP response status code, e.g. 200/301/403/404 (optional)"),
					"content_length": map[string]any{
						"type":        "integer",
						"description": "HTTP response body size in bytes (optional)",
					},
					"page_title":   str("page <title> content (optional)"),
					"favicon_mmh3": str("favicon MMH3 hash (optional)"),
					"technologies": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "fingerprint/tech-stack list, e.g. [\"Nginx\",\"Vue\",\"Bootstrap\"] (optional)",
					},
					"auth": map[string]any{
						"type":        "array",
						"description": "list of discovered credentials, each with fields like type/username/password (optional, appended not overwritten)",
						"items":       map[string]any{"type": "object"},
					},
					// service (other, non-HTTP)
					"service_name": str("service name, e.g. ssh/mysql/redis (required for non-HTTP service)"),
					"port":         intp("port number (required for non-HTTP service)"),
					// endpoint
					"method": str("HTTP method: GET/POST/PUT/PATCH/DELETE etc. (required for endpoint)"),
					"params": map[string]any{
						"type":        "array",
						"description": "list of request parameters, each with location(query/body/header/path)/name/value/type (optional, appended not overwritten)",
						"items":       map[string]any{"type": "object"},
					},
				}, "type"),
			},
		}, "assets"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.as == nil {
				return actool.Errorf("insert_assets is not enabled: AssetStore is not initialized"), nil
			}
			var a struct {
				Assets []assetInputItem `json:"assets"`
			}
			if err := json.Unmarshal(in, &a); err != nil {
				return actool.Errorf("invalid input: " + err.Error()), nil
			}
			// task_id is authoritatively assigned by the program (worker: SetTaskID) and
			// not accepted from the model — prevents assets going unattributed or
			// misattributed due to a missing/wrong model-supplied value. Callers without
			// a task context (auto/pentest/chat) have t.taskID=0.
			taskID := t.taskID

			type result struct {
				Index int    `json:"index"`
				ID    int64  `json:"id"`
				Type  string `json:"type"`
			}
			type errEntry struct {
				Index int    `json:"index"`
				Error string `json:"error"`
			}

			var results []result
			var errs []errEntry

			// Interception rules = global ∪ task-level block; allow rules = task-level allow.
			// Fail closed: a rule-load error must not evaluate as an empty set (allow all).
			blockRules, err := t.as.ListAssetInterceptRules()
			if out, refused := insertAssetsRuleLoadFailure(err); refused {
				return out, nil
			}
			var allowRules []db.AssetInterceptRule
			if t.taskID > 0 {
				tb, ta, err := t.as.TaskInterceptRulesSplit(t.taskID)
				if out, refused := insertAssetsRuleLoadFailure(err); refused {
					return out, nil
				}
				blockRules = append(blockRules, tb...)
				allowRules = ta
			}

			for i, item := range a.Assets {
				// Asset gate: intercept before allow; a rejected asset is forbidden from
				// insertion (skip the Upsert and subsequent side effects).
				domains, ips, urls := assetInterceptCandidates(item)
				if d := db.EvaluateAssetGate(blockRules, allowRules, domains, ips, urls); !d.Allowed {
					errs = append(errs, errEntry{
						Index: i,
						Error: fmt.Sprintf("asset %s %s; insertion forbidden", assetInputLabel(item), d.Reason),
					})
					continue
				}

				typ := strings.TrimSpace(item.Type)
				var id int64
				var err error

				switch typ {
				case "root_domain":
					id, err = t.as.UpsertRootDomain(db.UpsertRootDomainReq{
						Domain: item.Domain,
						ICP:    item.ICP,
						TaskID: taskID,
					})

				case "ip":
					id, err = t.as.UpsertIP(db.UpsertIPReq{
						IP:           item.IP,
						BoundDomains: item.BoundDomains,
						OpenPorts:    item.OpenPorts,
						TaskID:       taskID,
					})

				case "subdomain":
					id, err = t.as.UpsertSubdomain(db.UpsertSubdomainReq{
						Domain:      item.Domain,
						RecordType:  item.RecordType,
						RecordValue: item.RecordValue,
						ICP:         item.ICP,
						TaskID:      taskID,
					})

				case "app":
					id, err = t.as.UpsertApp(db.UpsertAppReq{
						Name:        item.AppName,
						BundleID:    item.BundleID,
						Category:    item.Category,
						Description: item.Description,
						ICP:         item.AppICP,
						CompanyID:   item.CompanyID,
						TaskID:      taskID,
					})

				case "service":
					// distinguish HTTP vs other by presence of url
					if item.URL != "" {
						// agent may send "ip" or "service_ip" for the enrichment IP; accept both
						svcIP := item.ServiceIP
						if svcIP == "" {
							svcIP = item.IP
						}
						id, err = t.as.UpsertHTTPService(db.UpsertHTTPServiceReq{
							URL:           item.URL,
							Technologies:  item.Technologies,
							StatusCode:    item.StatusCode,
							ContentLength: item.ContentLength,
							PageTitle:     item.PageTitle,
							FaviconMMH3:   item.FaviconMMH3,
							Auth:          item.Auth,
							IP:            svcIP,
							TaskID:        taskID,
						})
					} else {
						id, err = t.as.UpsertOtherService(db.UpsertOtherServiceReq{
							Domain:      item.Domain,
							IP:          item.IP,
							Port:        item.Port,
							ServiceName: item.ServiceName,
							Auth:        item.Auth,
							TaskID:      taskID,
						})
					}

				case "endpoint":
					id, err = t.as.UpsertEndpoint(db.UpsertEndpointReq{
						URL:    item.URL,
						Method: item.Method,
						Params: item.Params,
						IP:     item.ServiceIP,
						TaskID: taskID,
					})

				default:
					errs = append(errs, errEntry{Index: i, Error: "unknown type: " + typ})
					continue
				}

				if err != nil {
					errs = append(errs, errEntry{Index: i, Error: err.Error()})
					continue
				}
				results = append(results, result{Index: i, ID: id, Type: typ})
				t.writes.Assets++
				t.anchorOwner(id)
				if taskID > 0 {
					var sourceNodeID *int64
					if t.ownerNode > 0 {
						nodeID := t.ownerNode
						sourceNodeID = &nodeID
					}
					summary := "registered by the agent via insert_assets"
					if t.ownerNode > 0 {
						summary = fmt.Sprintf("registered via insert_assets by worker intent #%d", t.ownerNode)
					}
					_ = t.as.SetTaskAssetSource(taskID, id, "agent", summary, sourceNodeID)
				}
				// Auto-join the test scope (source='auto'): only for this item explicitly
				// inserted by the worker at top level, adding a conservative scope per its
				// type; side-effect-derived assets don't go through here, so the scope
				// doesn't widen blindly. No-op when taskID=0.
				// The item may come from target content, so this auto row counts toward
				// coverage and list_untested_assets only under a declared domain or IP
				// root (a non-auto root_domain/subdomain/ip/cidr row: goal target,
				// add_task_scope or manual scope, see db.declaredScopeFilter). task_scope is
				// coverage scope, not enforced: nothing blocks a call outside it.
				// Independent of the coverage switch: task_scope is the task's range
				// boundary (the filter basis for list/query); the coverage switch only
				// decides whether to use it as the denominator for metrics, not whether
				// to accumulate the scope itself.
				{
					svcIP := item.ServiceIP
					if svcIP == "" {
						svcIP = item.IP
					}
					_ = t.as.AddAutoScope(taskID, typ, item.Domain, item.URL, svcIP)
				}
			}

			return jsonResult(map[string]any{
				"results": results,
				"errors":  errs,
			})
		},
	)
}

// addCompanyScope writes to company_scope table and triggers asset attribution.
func (t *ToolSet) addCompanyScope() actool.CoreTool {
	return writeTool(
		"add_company_scope",
		"Add domains/IPs/CIDRs/ICP registrations/company keywords to a company's [asset scope] — domains, networks, and ICPs automatically claim matching assets; keywords are only provided to the agent as scope hints.\n"+
			"Company names are unique: if the company doesn't exist it is created; if it exists it is reused (the scope is just merged in).\n"+
			"scope is one entry per line; the system auto-recognizes: root domain / URL / single IP / CIDR range / ICP registration / company keyword.\n"+
			"Always give reason explaining the attribution basis (whois/certificates/ASN etc.).\n"+
			"Guardrails: bare TLDs and overly wide ranges are rejected (IPv4 prefixes must be /16-/32, IPv6 prefixes /32-/128); invalid lines are skipped and reported in errors.",
		obj(map[string]any{
			"company": str("company name (created if absent, reused if present; names are unique)"),
			"scope":   str("asset scope, one entry per line: domain / URL / IP / CIDR / ICP registration / company keyword"),
			"reason":  str("attribution basis (evidence/source); required"),
			"logo":    str("company logo URL (optional; only effective when creating a new company)"),
		}, "company", "scope"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.cs == nil {
				return actool.Errorf("add_company_scope is not enabled: CompanyStore is not initialized"), nil
			}
			var a struct {
				Company string `json:"company"`
				Scope   string `json:"scope"`
				Reason  string `json:"reason"`
				Logo    string `json:"logo"`
			}
			if err := json.Unmarshal(in, &a); err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if strings.TrimSpace(a.Company) == "" {
				return actool.Errorf("company must not be empty"), nil
			}
			companyID, _, err := t.cs.UpsertCompany(a.Company, a.Logo)
			if err != nil {
				return actool.Errorf("failed to create/get company: " + err.Error()), nil
			}
			lines := splitLines(a.Scope)
			added, skipped, invalid, errMsgs := t.cs.AddScope(companyID, lines, a.Reason)
			out := map[string]any{
				"company_id": companyID,
				"added":      added,
				"skipped":    skipped,
				"invalid":    invalid,
			}
			if len(errMsgs) > 0 {
				out["errors"] = errMsgs
			}
			return jsonResult(out)
		},
	)
}

// taskScopeLabel is the honest description of task_scope while the RoE is not back:
// it drives coverage and asset filters, and nothing enforces it on tool calls.
const taskScopeLabel = "coverage scope, not enforced"

// addTaskScope lets the plan agent add test scope to THE CURRENT TASK — the coverage
// denominator (coverage scope, not enforced). Worker discoveries are auto-scoped
// (precise host) by insertAssets; this tool is for DELIBERATELY WIDENING: pull a whole
// root domain or whole company into scope, or add a specific subdomain / ip.
func (t *ToolSet) addTaskScope() actool.CoreTool {
	return writeTool(
		"add_task_scope",
		"Add test scope to [this task] — "+taskScopeLabel+": it is the denominator of asset test coverage; nothing blocks a tool call outside it.\n"+
			"Supported kinds: company (all assets under the company) / root_domain (a whole root domain, including all subdomains) / subdomain (a single precise subdomain) / ip / cidr / icp / keyword.\n"+
			"Note: hosts a worker touches one by one are [automatically] added to the scope by the system (precise subdomains), but they count toward coverage and list_untested_assets only under a declared domain or IP root (a root_domain/subdomain/ip/cidr goal target or scope added here or manually; a company/icp/keyword entry is not such a root); this tool is for [deliberate widening] — pulling in a whole root domain / whole company, or adding a specific subdomain/IP.\n"+
			"value: for company pass the company name or id (the company must already exist); for root_domain/subdomain pass a domain; for ip/cidr pass an IP or range; for icp/keyword pass an ICP number or company keyword.\n"+
			"Always give reason explaining the basis (auditable). Use the entries array for multiple entries.",
		obj(map[string]any{
			"entries": map[string]any{"type": "array", "description": "batch: [{kind, value}]. kind ∈ company/root_domain/subdomain/ip/cidr/icp/keyword.", "items": map[string]any{"type": "object"}},
			"kind":    str("[single] company / root_domain / subdomain / ip / cidr / icp / keyword"),
			"value":   str("[single] company name or id / domain / IP / CIDR / ICP / keyword"),
			"reason":  str("basis for adding (for audit); required"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.as == nil {
				return actool.Errorf("add_task_scope is not enabled: AssetStore is not initialized"), nil
			}
			if t.taskID <= 0 {
				return actool.Errorf("add_task_scope requires a task context (no current task)"), nil
			}
			type scopeEntry struct {
				Kind  string `json:"kind"`
				Value string `json:"value"`
			}
			var a struct {
				Entries    []scopeEntry `json:"entries"`
				scopeEntry              // single mode
				Reason     string       `json:"reason"`
			}
			_ = json.Unmarshal(in, &a)
			items := a.Entries
			if len(items) == 0 {
				items = []scopeEntry{a.scopeEntry}
			}
			var added []map[string]any
			errs := map[string]string{}
			for i, e := range items {
				ts, err := t.as.AddAgentScope(t.taskID, strings.TrimSpace(e.Kind), e.Value, a.Reason, "agent")
				if err != nil {
					errs[strconv.Itoa(i)] = err.Error()
					continue
				}
				added = append(added, map[string]any{
					"kind": ts.Kind, "domain": ts.Domain, "net": ts.Net, "value": ts.Value,
					"company_id": ts.CompanyID, "source": ts.Source, "reason": ts.Reason, "expanded": ts.Expanded,
				})
			}
			out := map[string]any{"added": added}
			if len(errs) > 0 {
				out["errors"] = errs
			}
			return jsonResult(out)
		},
	)
}

// listUntestedAssets lets the plan agent pull the current + directly inherited
// scope's not-yet-tested assets on demand (filter by type, paginated).
func (t *ToolSet) listUntestedAssets() actool.CoreTool {
	return readTool(
		"list_untested_assets",
		"Query the assets inside the scope of [this task and directly related tasks] that haven't been covered by fact anchors yet (related scopes are read-only; it informs your own judgment about supplementary testing — it doesn't decide for you).\n"+
			"Optional filter by asset type: root_domain/subdomain/service/app/endpoint/ip.\n"+
			"Pagination: page starts at 1, page_size defaults to 10. Returns {assets:[{id,type,label}], total, page, page_size}. Only available in a task context.",
		obj(map[string]any{
			"type":      str("asset type filter (optional): root_domain/subdomain/service/app/endpoint/ip"),
			"page":      intp("page number, starting at 1 (default 1)"),
			"page_size": intp("entries per page (default 10)"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.as == nil {
				return actool.Errorf("list_untested_assets is not enabled: AssetStore is not initialized"), nil
			}
			if t.taskID <= 0 || t.ts == nil {
				return actool.Errorf("list_untested_assets requires a task context"), nil
			}
			var a struct {
				Type     string `json:"type"`
				Page     int    `json:"page"`
				PageSize int    `json:"page_size"`
			}
			_ = json.Unmarshal(in, &a)
			if a.Page <= 0 {
				a.Page = 1
			}
			if a.PageSize <= 0 {
				a.PageSize = 10
			}
			offset := (a.Page - 1) * a.PageSize
			assets, total, err := t.as.ListUntestedAssetsWithSources(t.taskID, strings.TrimSpace(a.Type), a.PageSize, offset)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(map[string]any{
				"assets": assets, "total": total, "page": a.Page, "page_size": a.PageSize,
			})
		},
	)
}

// listAssets lets an agent query the asset table.
func (t *ToolSet) listAssets() actool.CoreTool {
	return readTool(
		"list_assets",
		"Query the asset library: search by DSL expression, or fetch directly by id/ids; supports pagination. Only returns assets inside the test scope of [this task and directly related tasks].\n"+
			"DSL: field=value fuzzy (ILIKE) | field==value exact | field!=value exclusion | numeric fields support > >= < <= | a bare word = full-text fuzzy; combine with AND/OR (AND binds tighter), parentheses for grouping. The asset type uses the separate type parameter, not the DSL.\n"+
			"When neither id nor ids is passed, dsl must be non-empty (no unconditional full-table queries).\n"+
			"Available fields: domain (root/sub/service domain), root_domain, ip, url, page_title, icp, service_name, app_name, method (e.g. GET/POST), service_type (http|other), record_type (e.g. A/CNAME), technology (array, =fuzzy ==exact), port/status_code/company_id (integer).\n"+
			"Examples: status_code>=400 AND technology=shiro ; (port==80 OR port==443) AND technology=nginx",
		obj(map[string]any{
			"dsl":    str(`DSL query expression (syntax/fields in the tool description). Must be non-empty when id/ids are not passed.`),
			"type":   str("asset type filter: root_domain|ip|subdomain|app|service|endpoint (a separate field, stackable with dsl; type alone is not enough for a query — dsl is still required)"),
			"id":     intp("fetch directly by a single asset id (optional, mutually exclusive with dsl/type)"),
			"ids":    map[string]any{"type": "array", "items": map[string]any{"type": "integer"}, "description": "fetch directly by multiple asset ids (optional, mutually exclusive with dsl/type)"},
			"limit":  intp("return cap, default 10 (optional)"),
			"offset": intp("pagination offset, default 0 (optional)"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.as == nil {
				return actool.Errorf("list_assets is not enabled: AssetStore is not initialized"), nil
			}
			var a struct {
				DSL    string  `json:"dsl"`
				Type   string  `json:"type"`
				ID     int64   `json:"id"`
				IDs    []int64 `json:"ids"`
				Limit  int     `json:"limit"`
				Offset int     `json:"offset"`
			}
			_ = json.Unmarshal(in, &a)
			if a.Limit <= 0 {
				a.Limit = 10
			}

			var assets []*db.Asset
			var err error
			switch {
			case a.ID > 0:
				assets, err = t.as.GetByIDsInScope(t.taskID, []int64{a.ID})
			case len(a.IDs) > 0:
				assets, err = t.as.GetByIDsInScope(t.taskID, a.IDs)
			case a.DSL != "":
				assets, err = t.as.QueryDSLInScope(a.DSL, a.Type, t.taskID, a.Limit, a.Offset)
			default:
				return actool.Errorf("dsl must not be empty when id/ids are not passed: unconditional queries over all assets are not allowed; please provide query conditions"), nil
			}
			if err != nil {
				return actool.Errorf("DSL error: " + err.Error()), nil
			}
			return jsonResult(map[string]any{
				"count":  len(assets),
				"assets": assets,
			})
		},
	)
}

// listCompanies lets an agent enumerate companies with their scope + asset count.
func (t *ToolSet) listCompanies() actool.CoreTool {
	return readTool(
		"list_companies",
		"List the [companies] in the asset library with their asset scopes (scope) and attributed asset counts. Used to see which companies exist and "+
			"to get a company_id (used when insert_assets links an app, or when list_assets filters by company_id)."+
			"The optional search fuzzy-filters by company name (case-insensitive); empty returns all.",
		obj(map[string]any{
			"search": str("fuzzy filter by company name (optional, case-insensitive); empty returns all"),
		}),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			if t.cs == nil {
				return actool.Errorf("list_companies is not enabled: CompanyStore is not initialized"), nil
			}
			var a struct {
				Search string `json:"search"`
			}
			_ = json.Unmarshal(in, &a)
			cos, err := t.cs.ListCompanies()
			if err != nil {
				return actool.Errorf("failed to query companies: " + err.Error()), nil
			}
			q := strings.ToLower(strings.TrimSpace(a.Search))
			type companyOut struct {
				ID         int64    `json:"id"`
				Name       string   `json:"name"`
				AssetCount int      `json:"asset_count"`
				Scope      []string `json:"scope"`
			}
			out := make([]companyOut, 0, len(cos))
			for _, c := range cos {
				if q != "" && !strings.Contains(strings.ToLower(c.Name), q) {
					continue
				}
				scope := make([]string, 0, len(c.Scope))
				for _, r := range c.Scope {
					scope = append(scope, r.Raw)
				}
				out = append(out, companyOut{ID: c.ID, Name: c.Name, AssetCount: c.AssetCount, Scope: scope})
			}
			return jsonResult(map[string]any{"count": len(out), "companies": out})
		},
	)
}

// splitLines splits a multi-line string into non-empty trimmed lines.
func splitLines(s string) []string {
	var out []string
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

// WorkerTools returns the tool set for a work agent.
func (t *ToolSet) WorkerTools() []actool.CoreTool {
	return []actool.CoreTool{
		// list_findings stays: check the task's confirmed findings before reporting, to
		// avoid reporting the same finding twice.
		t.listFindings(),
		t.addFinding(), t.recordFact(),
		// coverage ledger (coverage-only: dropped when coverage_enabled=false).
		t.recordCoverage(),
		// asset management (handlers guard nil store internally).
		// add_company_scope is not given to workers: defining a company's asset scope is
		// the duty of planning/main-control/Auto; a worker only executes exploration.
		t.insertAssets(), t.listAssets(),
		// bbot output by path: in-scope assets via insert_assets, the rest as
		// third_party_intel facts (never auto-scoped).
		t.ingestBbot(),
		// scanner output (nmap -oX) by path, without the raw output.
		t.ingestScanOutput(),
		// Task credentials (#3): reuse user-declared test accounts, record
		// self-registered ones so they are not forgotten.
		t.saveTaskCredential(), t.listTaskCredentials(),
		// Cross-work review: a worker can also reuse other works' observations to avoid
		// duplicate work.
		// search_all_worker_traces: no need to know an intent_id first — fish out matching
		// steps globally by keyword;
		// get_worker_trace: once a work is locked, list steps / search in place / fetch
		// full content.
		t.searchAllWorkerTraces(), t.getWorkerTrace(),
		// node_detail: once a worker has an intent_id/node id, it can look up that node's
		// full detail (pairs with the review above).
		t.nodeDetail(),
		// The following tools are still [not given] to workers, reserved for
		// planner/main (reading context, cross-work retrospection are planning duties; a
		// worker only executes and writes back its single intent):
		// list_facts / list_companies / list_worker_traces.
	}
}

// MainAgentTools returns the human-interface tool set.
func (t *ToolSet) MainAgentTools() []actool.CoreTool {
	return []actool.CoreTool{
		t.graphOverview(), t.listFindings(), t.listFacts(), t.nodeDetail(),
		t.expandDigest(), // cold-digest §6.1
		t.getWorkerOutput(), t.getWorkerTrace(), t.searchAllWorkerTraces(), t.addHint(), t.addIntent(),
		// steer_work: the human can inject a course-correction instruction into a running
		// intent (work) in real time (no interruption, no lost progress).
		t.steerWorkTool(),
		// set_goals: the human can add a new final goal to this task at runtime (the
		// planner re-judges completion accordingly).
		t.setGoals(),
		// set_constraints: the human can add/modify operation constraints (allow/deny) at
		// runtime, bounding the planner/workers' exploration.
		t.setConstraints(),
		// asset management (handlers guard nil store internally)
		t.insertAssets(), t.addCompanyScope(), t.listAssets(),
		t.addFinding(), t.recordFact(),
		t.addTaskScope(),
		// list_untested_assets: query untested assets in this task's scope on demand
		// (by type + paginated), and decide on supplementary testing yourself.
		t.listUntestedAssets(),
	}
}

// AllDomainTools returns the union of all domain tools across all agent types,
// deduped by name (mainagent order wins). Used by the server to build a registry
// for injecting domain tools into agents (Auto, custom) that don't own a per-task
// ToolSet. The caller provides real stores; tools are callable at taskID=0 scope.
func (t *ToolSet) AllDomainTools() []actool.CoreTool {
	seen := map[string]bool{}
	var out []actool.CoreTool
	all := append(append(t.MainAgentTools(), t.PlannerTools()...), t.WorkerTools()...)
	for _, tool := range all {
		if !seen[tool.Name()] {
			seen[tool.Name()] = true
			out = append(out, tool)
		}
	}
	return out
}
