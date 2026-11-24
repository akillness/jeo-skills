package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Typed bbot ingestion (#124, audit F10b). bbot output.json is shaped by the
// target and by third parties writing about it: a DNS record, a page, a
// certificate or a FINDING description can carry text addressed to an AI. This
// parser reads only the typed fields of each event (type, scope_distance, host,
// url, port, and the module names as plain strings) and validates them. The
// free text (data, or data_json, which holds the FINDING description) is kept
// only as one Go-quoted inert string: it is never parsed, and never used for
// scope, routing or an action. Every other key is ignored.
//
// Routing follows the bbot skill: scope_distance == 0 is the only case whose
// typed host may feed insert_assets. Any other value, or a missing one, makes
// the event a third_party_intel item, which is never auto-scoped.

// bbotEvent is one event reduced to its typed, validated fields. A field that
// fails validation is left empty.
type bbotEvent struct {
	Type           string
	ScopeDistance  int
	Host           string
	URL            string
	Port           int
	Module         string
	ModuleSequence string
	Source         string // tool_output in scope, third_party_intel otherwise
	Quoted         string // the free text as an inert Go-quoted string; "" when absent
}

// bbotIngest is the result of parsing one output.json.
type bbotIngest struct {
	InScope []bbotEvent // scope_distance == 0: the only events that may feed insert_assets
	Intel   []bbotEvent // any other scope_distance: third_party_intel, never auto-scoped
	Skipped int         // lines that do not decode as an event
}

// bbotRawEvent lists the only keys decoded; encoding/json drops every other key.
// The free text stays raw until it is quoted.
type bbotRawEvent struct {
	Type           string          `json:"type"`
	ScopeDistance  *int            `json:"scope_distance"`
	Host           string          `json:"host"`
	URL            string          `json:"url"`
	Port           int             `json:"port"`
	Module         string          `json:"module"`
	ModuleSequence string          `json:"module_sequence"`
	Data           json.RawMessage `json:"data"`
	DataJSON       json.RawMessage `json:"data_json"`
}

var (
	bbotTokenRe = regexp.MustCompile(`^[A-Za-z0-9_.>-]{1,128}$`)
	bbotHostRe  = regexp.MustCompile(`^[a-z0-9_.-]{1,253}$`)
)

// parseBbotJSONL parses bbot JSONL output. Pure: it reads r and nothing else.
func parseBbotJSONL(r io.Reader) (bbotIngest, error) {
	var out bbotIngest
	br := bufio.NewReader(r)
	for {
		line, err := br.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			var raw bbotRawEvent
			if json.Unmarshal(line, &raw) != nil {
				out.Skipped++
			} else if ev := bbotTyped(raw); raw.ScopeDistance != nil && *raw.ScopeDistance == 0 {
				ev.Source = factSourceToolOutput
				out.InScope = append(out.InScope, ev)
			} else {
				ev.Source = factSourceThirdPartyIntel
				out.Intel = append(out.Intel, ev)
			}
		}
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return out, err
		}
	}
}

// bbotTyped validates the typed fields and quotes the free text.
func bbotTyped(raw bbotRawEvent) bbotEvent {
	ev := bbotEvent{
		Type:           bbotToken(raw.Type),
		ScopeDistance:  -1,
		Module:         bbotToken(raw.Module),
		ModuleSequence: bbotToken(raw.ModuleSequence),
		Quoted:         bbotQuote(raw.Data, raw.DataJSON),
	}
	if raw.ScopeDistance != nil {
		ev.ScopeDistance = *raw.ScopeDistance
	}
	host := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(raw.Host)), ".")
	if net.ParseIP(host) != nil || bbotHostRe.MatchString(host) {
		ev.Host = host
	}
	if raw.Port > 0 && raw.Port <= 65535 {
		ev.Port = raw.Port
	}
	if u, err := url.Parse(strings.TrimSpace(raw.URL)); err == nil && ev.Host != "" &&
		(u.Scheme == "http" || u.Scheme == "https") && strings.EqualFold(u.Hostname(), ev.Host) {
		u.User = nil // credentials never reach an asset
		ev.URL = u.String()
	}
	return ev
}

func bbotToken(s string) string {
	if bbotTokenRe.MatchString(s) {
		return s
	}
	return ""
}

// bbotQuote returns the free text as one Go-quoted string: a JSON string is
// unwrapped first, an object is kept as its compact JSON text. data wins over
// data_json.
func bbotQuote(data, dataJSON json.RawMessage) string {
	absent := func(m json.RawMessage) bool {
		t := bytes.TrimSpace(m)
		return len(t) == 0 || string(t) == "null"
	}
	raw := data
	if absent(raw) {
		raw = dataJSON
	}
	if absent(raw) {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return strconv.Quote(s)
	}
	var buf bytes.Buffer
	_ = json.Compact(&buf, raw) // raw is valid JSON: the whole line decoded
	return strconv.Quote(buf.String())
}

// assetItems maps the in-scope events to insert_assets items, using only the
// typed host, port and url. Intel events are never read here.
func (in bbotIngest) assetItems() []assetInputItem {
	var items []assetInputItem
	for _, ev := range in.InScope {
		if ev.Host == "" {
			continue
		}
		ip := net.ParseIP(ev.Host) != nil
		switch {
		case ev.Type == "DNS_NAME" && !ip:
			items = append(items, assetInputItem{Type: "subdomain", Domain: ev.Host})
		case ev.Type == "IP_ADDRESS" && ip:
			items = append(items, assetInputItem{Type: "ip", IP: ev.Host})
		case ev.Type == "OPEN_TCP_PORT" && ev.Port > 0:
			item := assetInputItem{Type: "service", Port: ev.Port}
			if ip {
				item.IP = ev.Host
			} else {
				item.Domain = ev.Host
			}
			items = append(items, item)
		case ev.Type == "URL" && ev.URL != "":
			items = append(items, assetInputItem{Type: "service", URL: ev.URL})
		}
	}
	return items
}
