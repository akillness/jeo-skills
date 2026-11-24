package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/Autumn-27/artex/db"
)

// Deterministic ingestion of scanner output files (nmap -oX, nuclei -jsonl,
// httpx -json, ffuf -of json). The rules are the bbot parser's: only typed
// fields are read and validated, and every free-text field the target shapes
// (banner, product, title, template name, extracted value) is kept only inside
// one Go-quoted fact detail. It never reaches a summary, a notable
// item or an instruction.

// scanNotableMax caps the notable items returned per type.
const scanNotableMax = 20

// scanMaxItems caps the assets and facts one file may yield. The records past
// it are counted, not ingested, and the result is marked truncated.
const scanMaxItems = 50000

// scanIngest is what one scanner file yields: counters, the insert_assets
// items, the facts, and a capped list of notable items per type.
type scanIngest struct {
	Events, Ports, Skipped, Oversized, OverCap int
	Truncated                                  bool
	hosts, urls                                map[string]bool
	Assets                                     []assetInputItem
	Facts                                      []factItem
	Notable                                    map[string][]string
}

func newScanIngest() *scanIngest {
	return &scanIngest{hosts: map[string]bool{}, urls: map[string]bool{}, Notable: map[string][]string{}}
}

func (s *scanIngest) note(kind, item string) {
	if len(s.Notable[kind]) < scanNotableMax {
		s.Notable[kind] = append(s.Notable[kind], item)
	}
}

// full reports whether the item cap is reached; the record is then counted
// in OverCap and dropped. It is checked once per record, so the last record
// admitted may take the total slightly past the cap.
func (s *scanIngest) full() bool {
	if len(s.Assets)+len(s.Facts) < scanMaxItems {
		return false
	}
	s.OverCap++
	s.Truncated = true
	return true
}

// fact records a tool_output fact: the summary is built by the caller from
// typed fields only, the detail is the compact JSON of detail as one Go-quoted
// inert string.
func (s *scanIngest) fact(summary string, detail any) {
	b, _ := json.Marshal(detail)
	s.Facts = append(s.Facts, factItem{Summary: summary, Detail: strconv.Quote(string(b)), Source: factSourceToolOutput})
}

// scanHost returns h as a lower-case IP or hostname, "" when it is neither.
func scanHost(h string) string {
	h = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(h)), ".")
	if ip := net.ParseIP(h); ip != nil {
		return ip.String()
	}
	if bbotHostRe.MatchString(h) {
		return h
	}
	return ""
}

// scanURL returns raw re-serialized without its userinfo, and its host, when
// it is an http(s) URL with a valid host, "" otherwise.
func scanURL(raw string) (string, string) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", ""
	}
	h := scanHost(u.Hostname())
	if h == "" {
		return "", ""
	}
	u.User = nil // credentials never reach an asset, a note or a fact
	return u.String(), h
}

// stripUserinfo removes the userinfo (user:pass@) from raw, a URL or a bare
// host[:port] as a scanner prints it, and keeps every other byte. It is for
// the raw values kept in a fact detail: unlike scanURL it never rejects, and a
// value with no userinfo, or a path with no authority, is returned unchanged.
func stripUserinfo(raw string) string {
	start := 0 // the authority follows "scheme://" or "//"; a bare value is all authority
	if i := strings.Index(raw, "//"); i == 0 || i > 0 && raw[i-1] == ':' && !strings.ContainsAny(raw[:i-1], "/?#@") {
		start = i + 2
	} else if strings.ContainsAny(raw, "/?#") {
		return raw
	}
	auth := raw[start:]
	if j := strings.IndexAny(auth, "/?#"); j >= 0 {
		auth = auth[:j]
	}
	if at := strings.LastIndex(auth, "@"); at >= 0 {
		return raw[:start] + raw[start+at+1:]
	}
	return raw
}

// scanHostOf reads a host from a URL, a host:port or a bare host.
func scanHostOf(s string) string {
	if _, h := scanURL(s); h != "" {
		return h
	}
	if h, _, err := net.SplitHostPort(strings.TrimSpace(s)); err == nil {
		return scanHost(h)
	}
	return scanHost(s)
}

// ---- nmap -oX ----

type nmapHost struct {
	Status struct {
		State string `xml:"state,attr"`
	} `xml:"status"`
	Addrs []struct {
		Addr string `xml:"addr,attr"`
		Type string `xml:"addrtype,attr"`
	} `xml:"address"`
	Names []struct {
		Name string `xml:"name,attr"`
		Type string `xml:"type,attr"`
	} `xml:"hostnames>hostname"`
	Ports []struct {
		Proto string `xml:"protocol,attr"`
		ID    string `xml:"portid,attr"`
		State struct {
			State string `xml:"state,attr"`
		} `xml:"state"`
		Svc struct {
			Name    string   `xml:"name,attr"`
			Product string   `xml:"product,attr"`
			Version string   `xml:"version,attr"`
			Tunnel  string   `xml:"tunnel,attr"`
			CPE     []string `xml:"cpe"`
		} `xml:"service"`
	} `xml:"ports>port"`
	OS []struct {
		Name     string `xml:"name,attr"`
		Accuracy string `xml:"accuracy,attr"`
	} `xml:"os>osmatch"`
}

// readNmapXML streams the file and decodes one <host> element at a time. A file
// cut short keeps the hosts read before the cut and is marked truncated; a file
// with no <nmaprun> root, or with no complete host that fails to parse, is an
// error.
func readNmapXML(r io.Reader, s *scanIngest) error {
	dec := xml.NewDecoder(r)
	root := false
	for {
		tok, err := dec.Token()
		if errors.Is(err, io.EOF) {
			if !root {
				return errors.New("no nmaprun element")
			}
			return nil
		}
		if err == nil {
			se, ok := tok.(xml.StartElement)
			root = root || (ok && se.Name.Local == "nmaprun")
			if !ok || se.Name.Local != "host" {
				continue
			}
			var h nmapHost
			if err = dec.DecodeElement(&h, &se); err == nil {
				s.Events++
				s.addNmapHost(h)
				continue
			}
		}
		if s.Events == 0 {
			return err
		}
		s.Truncated = true
		return nil
	}
}

// nmapWebScheme returns the URL scheme of an nmap web service, "" otherwise.
func nmapWebScheme(name, tunnel string) string {
	switch name {
	case "http", "http-alt", "http-proxy":
		if tunnel == "ssl" {
			return "https"
		}
		return "http"
	case "https", "https-alt":
		return "https"
	}
	return ""
}

func (s *scanIngest) addNmapHost(h nmapHost) {
	if h.Status.State != "up" || s.full() {
		return
	}
	ip := ""
	for _, a := range h.Addrs {
		if ip == "" && (a.Type == "ipv4" || a.Type == "ipv6") && net.ParseIP(a.Addr) != nil {
			ip = scanHost(a.Addr)
		}
	}
	if ip == "" {
		s.Skipped++
		return
	}
	s.hosts[ip] = true
	detail := map[string]any{"ip": ip, "hostnames": h.Names, "os": h.OS}
	var bound []string
	for _, n := range h.Names {
		// Only the name the operator scanned is bound to the IP; a PTR name is
		// third-party data and stays in the fact detail.
		if hn := scanHost(n.Name); n.Type == "user" && hn != "" && net.ParseIP(hn) == nil {
			bound = append(bound, hn)
		}
	}
	var open []db.PortService
	var list []string
	var ports []map[string]any
	for _, p := range h.Ports {
		port, err := strconv.Atoi(p.ID)
		if err != nil || port <= 0 || port > 65535 || p.State.State != "open" ||
			(p.Proto != "tcp" && p.Proto != "udp" && p.Proto != "sctp") {
			continue
		}
		name := bbotToken(p.Svc.Name)
		if name == "" {
			name = "unknown"
		}
		s.Ports++
		pp := fmt.Sprintf("%d/%s", port, p.Proto)
		list = append(list, pp)
		open = append(open, db.PortService{Port: port, Service: name})
		ports = append(ports, map[string]any{"port": pp, "service": p.Svc.Name, "product": p.Svc.Product,
			"version": p.Svc.Version, "tunnel": p.Svc.Tunnel, "cpe": p.Svc.CPE})
		s.note("ports", ip+" "+pp+" "+name)
		if scheme := nmapWebScheme(name, p.Svc.Tunnel); scheme != "" && p.Proto == "tcp" {
			u := scheme + "://" + net.JoinHostPort(ip, strconv.Itoa(port))
			s.urls[u] = true
			s.note("urls", u)
			s.Assets = append(s.Assets, assetInputItem{Type: "service", URL: u, IP: ip})
		} else {
			s.Assets = append(s.Assets, assetInputItem{Type: "service", IP: ip, Port: port, ServiceName: name})
		}
	}
	s.Assets = append(s.Assets, assetInputItem{Type: "ip", IP: ip, BoundDomains: bound, OpenPorts: open})
	s.note("hosts", fmt.Sprintf("%s (%d open ports)", ip, len(list)))
	shown := list
	if len(shown) > 50 {
		shown = shown[:50]
	}
	summary := fmt.Sprintf("nmap: host %s has %d open ports: %s", ip, len(list), strings.Join(shown, ", "))
	if len(list) > len(shown) {
		summary += fmt.Sprintf(" and %d more", len(list)-len(shown))
	}
	detail["ports"] = ports
	s.fact(summary, detail)
}

// readJSONLines calls fn with each non-blank line of r, and returns the number
// of lines skipped for exceeding bbotMaxLineBytes. fn must not keep the line:
// its buffer is reused by the next read.
func readJSONLines(r io.Reader, fn func(line []byte)) (int, error) {
	oversized := 0
	br := bufio.NewReaderSize(r, bbotMaxLineBytes)
	for {
		line, err := br.ReadSlice('\n')
		if errors.Is(err, bufio.ErrBufferFull) {
			for errors.Is(err, bufio.ErrBufferFull) { // drop the rest of the line
				_, err = br.ReadSlice('\n')
			}
			oversized++
			line = nil
		}
		if len(bytes.TrimSpace(line)) > 0 {
			fn(line)
		}
		if errors.Is(err, io.EOF) {
			return oversized, nil
		}
		if err != nil {
			return oversized, err
		}
	}
}

// ---- nuclei -jsonl ----

type nucleiResult struct {
	TemplateID string `json:"template-id"`
	Info       struct {
		Name     string `json:"name"`
		Severity string `json:"severity"`
	} `json:"info"`
	Host        string   `json:"host"`
	MatchedAt   string   `json:"matched-at"`
	MatcherName string   `json:"matcher-name"`
	Extracted   []string `json:"extracted-results"`
}

// addNuclei records one nuclei result as a fact, and the scanned target (not
// the matched path) as an asset when it is valid. No finding: a scanner match
// is unverified until the planner checks it.
func (s *scanIngest) addNuclei(line []byte) {
	var r nucleiResult
	if s.full() {
		return
	}
	if json.Unmarshal(line, &r) != nil {
		s.Skipped++
		return
	}
	host := scanHostOf(r.Host)
	if host == "" {
		host = scanHostOf(r.MatchedAt)
	}
	tid := bbotToken(r.TemplateID)
	if tid == "" || host == "" {
		s.Skipped++
		return
	}
	sev := strings.ToLower(r.Info.Severity)
	switch sev {
	case "info", "low", "medium", "high", "critical":
	default:
		sev = "unknown"
	}
	s.Events++
	s.hosts[host] = true
	if u, _ := scanURL(r.MatchedAt); u != "" {
		s.urls[u] = true
	}
	switch u, _ := scanURL(r.Host); {
	case u != "":
		s.Assets = append(s.Assets, assetInputItem{Type: "service", URL: u})
	case net.ParseIP(host) != nil:
		s.Assets = append(s.Assets, assetInputItem{Type: "ip", IP: host})
	default:
		s.Assets = append(s.Assets, assetInputItem{Type: "subdomain", Domain: host})
	}
	s.note("results", tid+" ("+sev+") on "+host)
	s.fact(fmt.Sprintf("nuclei: template %s (severity %s) matched on %s; unverified scanner result", tid, sev, host),
		map[string]any{"name": r.Info.Name, "host": stripUserinfo(r.Host), "matched_at": stripUserinfo(r.MatchedAt),
			"matcher_name": r.MatcherName, "extracted_results": r.Extracted})
}

// ---- httpx -json ----

type httpxResult struct {
	URL           string          `json:"url"`
	StatusCode    int             `json:"status_code"`
	Title         string          `json:"title"`
	Tech          []string        `json:"tech"`
	Webserver     string          `json:"webserver"`
	ContentLength int64           `json:"content_length"`
	Host          string          `json:"host"`
	IP            string          `json:"ip"`
	TLS           json.RawMessage `json:"tls"`
}

func (s *scanIngest) addHttpx(line []byte) {
	var r httpxResult
	if s.full() {
		return
	}
	if json.Unmarshal(line, &r) != nil {
		s.Skipped++
		return
	}
	u, host := scanURL(r.URL)
	if u == "" {
		s.Skipped++
		return
	}
	s.Events++
	s.hosts[host] = true
	s.urls[u] = true
	item := assetInputItem{Type: "service", URL: u, PageTitle: r.Title, Technologies: r.Tech}
	for _, c := range []string{r.IP, r.Host} {
		if ip := net.ParseIP(strings.TrimSpace(c)); ip != nil {
			item.IP = ip.String()
			break
		}
	}
	if r.StatusCode > 0 {
		item.StatusCode = &r.StatusCode
	}
	if r.ContentLength > 0 {
		item.ContentLength = &r.ContentLength
	}
	s.Assets = append(s.Assets, item)
	s.note("urls", fmt.Sprintf("%s %d", u, r.StatusCode))
	s.fact(fmt.Sprintf("httpx: %s responded with status %d", u, r.StatusCode),
		map[string]any{"title": r.Title, "tech": r.Tech, "webserver": r.Webserver, "content_length": r.ContentLength,
			"host": stripUserinfo(r.Host), "ip": r.IP, "tls": r.TLS})
}

// ---- ffuf -of json ----

type ffufResult struct {
	Input    json.RawMessage `json:"input"`
	Status   int             `json:"status"`
	Length   int64           `json:"length"`
	Words    int             `json:"words"`
	Lines    int             `json:"lines"`
	URL      string          `json:"url"`
	Redirect string          `json:"redirectlocation"`
}

// readFfufJSON walks the top-level object and decodes results[] one element at
// a time. Other keys are skipped. A file cut short keeps the results read
// before the cut and is marked truncated.
func readFfufJSON(r io.Reader, s *scanIngest) error {
	dec := json.NewDecoder(r)
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return errors.New("not a JSON object")
	}
	err := func() error {
		for dec.More() {
			key, err := dec.Token()
			if err != nil {
				return err
			}
			if key != "results" {
				var skip json.RawMessage
				if err := dec.Decode(&skip); err != nil {
					return err
				}
				continue
			}
			if tok, err := dec.Token(); err != nil || tok != json.Delim('[') {
				return errors.New("results is not an array")
			}
			for dec.More() {
				var raw json.RawMessage
				if err := dec.Decode(&raw); err != nil {
					return err
				}
				s.addFfuf(raw)
			}
			if _, err := dec.Token(); err != nil { // ']'
				return err
			}
		}
		_, err := dec.Token() // '}'
		return err
	}()
	if err != nil {
		s.Truncated = true
	}
	return nil
}

func (s *scanIngest) addFfuf(raw json.RawMessage) {
	var r ffufResult
	if s.full() {
		return
	}
	if json.Unmarshal(raw, &r) != nil {
		s.Skipped++
		return
	}
	u, host := scanURL(r.URL)
	if u == "" {
		s.Skipped++
		return
	}
	s.Events++
	s.hosts[host] = true
	s.urls[u] = true
	item := assetInputItem{Type: "service", URL: u}
	if r.Status > 0 {
		item.StatusCode = &r.Status
	}
	if r.Length > 0 {
		item.ContentLength = &r.Length
	}
	s.Assets = append(s.Assets, item)
	s.note("urls", fmt.Sprintf("%s %d", u, r.Status))
	s.fact(fmt.Sprintf("ffuf: %s returned status %d, %d bytes, %d words, %d lines", u, r.Status, r.Length, r.Words, r.Lines),
		map[string]any{"input": r.Input, "redirectlocation": stripUserinfo(r.Redirect)})
}
