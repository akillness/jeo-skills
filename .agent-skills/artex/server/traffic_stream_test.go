package server

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestTrafficStreamRoute(t *testing.T) {
	s, request := ingestServer(t)
	db := s.m.Traffic().DB()
	if _, err := db.Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES('1-0001',1,'ws.example.com','GET','/ws','wss://ws.example.com/ws',101,'websocket',0,0,'')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO exchange_bodies(id,req_head,resp_head) VALUES('1-0001','GET /ws HTTP/1.1\n','HTTP/1.1 101 Switching Protocols\n')`); err != nil {
		t.Fatal(err)
	}
	const total = 250
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= total; i++ {
		kind, payload := 1, []byte("hello")
		if i%2 == 0 {
			kind, payload = 2, []byte{0, 1, 2}
		}
		if _, err := tx.Exec(`INSERT INTO stream_messages(exchange_id,seq,ts,direction,kind,size,payload) VALUES('1-0001',?,1,'c2s',?,?,?)`, i, kind, len(payload), payload); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}

	type page struct {
		Items []struct {
			Seq      int64  `json:"seq"`
			Type     string `json:"type"`
			Payload  string `json:"payload"`
			Encoding string `json:"encoding"`
		} `json:"items"`
		Total        int  `json:"total"`
		MessageTotal *int `json:"message_total"`
	}
	get := func(path string, wantStatus int) page {
		t.Helper()
		w := request("GET", path, "")
		if w.Code != wantStatus {
			t.Fatalf("GET %s = %d %s, want %d", path, w.Code, w.Body, wantStatus)
		}
		var p page
		if wantStatus == 200 {
			if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
				t.Fatalf("GET %s: %v in %s", path, err, w.Body)
			}
			if p.MessageTotal == nil {
				t.Fatalf("GET %s: message_total missing in %s", path, w.Body)
			}
		}
		return p
	}

	get("/api/traffic/stream", 400)
	if p := get("/api/traffic/stream?exchange=nope", 200); p.Items == nil || len(p.Items) != 0 || p.Total != 0 || *p.MessageTotal != 0 {
		t.Fatalf("unknown exchange = %+v, want items [] and total 0", p)
	}
	p := get("/api/traffic/stream?exchange=1-0001", 200)
	if p.Total != total || *p.MessageTotal != total || len(p.Items) != 50 || p.Items[0].Seq != 1 {
		t.Fatalf("default page: total %d, %d items, first seq %d", p.Total, len(p.Items), p.Items[0].Seq)
	}
	if first, second := p.Items[0], p.Items[1]; first.Type != "text" || first.Payload != "hello" || second.Type != "binary" || second.Encoding != "base64" || second.Payload != "AAEC" {
		t.Fatalf("payloads %+v %+v", first, second)
	}
	if p := get("/api/traffic/stream?exchange=1-0001&limit=500", 200); len(p.Items) != 200 {
		t.Fatalf("limit=500 returned %d items, want the 200 cap", len(p.Items))
	}
	if p := get("/api/traffic/stream?exchange=1-0001&offset=-5&limit=1", 200); len(p.Items) != 1 || p.Items[0].Seq != 1 {
		t.Fatalf("negative offset: %+v, want seq 1", p.Items)
	}
	if p := get("/api/traffic/stream?exchange=1-0001&offset=248&limit=10", 200); len(p.Items) != 2 || p.Items[0].Seq != 249 {
		t.Fatalf("last page: %+v, want seqs 249 and 250", p.Items)
	}

	w := request("GET", "/api/traffic/exchange?id=1-0001", "")
	var ex struct {
		StreamCount int    `json:"stream_count"`
		StreamKind  string `json:"stream_kind"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &ex); err != nil || w.Code != 200 || ex.StreamCount != total || ex.StreamKind != "websocket" {
		t.Fatalf("exchange = %d %s", w.Code, w.Body)
	}
}

func TestTrafficStreamRouteDirection(t *testing.T) {
	s, request := ingestServer(t)
	db := s.m.Traffic().DB()
	if _, err := db.Exec(`INSERT INTO exchanges(id,ts,host,method,url_template,url,status,content_type,req_len,resp_len,path)
VALUES('1-0002',1,'ws.example.com','GET','/ws','wss://ws.example.com/ws',101,'websocket',0,0,'')`); err != nil {
		t.Fatal(err)
	}
	// seq 1 c2s, 2 s2c, 3 c2s, 4 s2c, 5 meta.
	for i, dir := range []string{"c2s", "s2c", "c2s", "s2c", "meta"} {
		kind := 1
		if dir == "meta" {
			kind = 0
		}
		if _, err := db.Exec(`INSERT INTO stream_messages(exchange_id,seq,ts,direction,kind,size,payload) VALUES('1-0002',?,1,?,?,1,'x')`, i+1, dir, kind); err != nil {
			t.Fatal(err)
		}
	}

	type page struct {
		Items []struct {
			Seq       int64  `json:"seq"`
			Direction string `json:"direction"`
		} `json:"items"`
		Total        int  `json:"total"`
		MessageTotal *int `json:"message_total"`
	}
	get := func(query string) page {
		t.Helper()
		w := request("GET", "/api/traffic/stream?exchange=1-0002"+query, "")
		if w.Code != 200 {
			t.Fatalf("GET %s = %d %s", query, w.Code, w.Body)
		}
		var p page
		if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
			t.Fatal(err)
		}
		if p.MessageTotal == nil {
			t.Fatalf("GET %s: message_total missing in %s", query, w.Body)
		}
		return p
	}
	seqs := func(p page) []int64 {
		out := []int64{}
		for _, it := range p.Items {
			out = append(out, it.Seq)
		}
		return out
	}

	if p := get(""); p.Total != 5 || *p.MessageTotal != 4 || len(p.Items) != 5 {
		t.Fatalf("unfiltered = %+v", p)
	}
	if p := get("&direction=c2s"); p.Total != 3 || *p.MessageTotal != 2 || fmt.Sprint(seqs(p)) != "[1 3 5]" {
		t.Fatalf("c2s = total %d seqs %v, want 3 and [1 3 5]", p.Total, seqs(p))
	}
	if p := get("&direction=S2C"); p.Total != 3 || *p.MessageTotal != 2 || fmt.Sprint(seqs(p)) != "[2 4 5]" {
		t.Fatalf("S2C = total %d seqs %v, want 3 and [2 4 5]", p.Total, seqs(p))
	}
	if p := get("&direction=s2c&offset=1&limit=1"); p.Total != 3 || *p.MessageTotal != 2 || fmt.Sprint(seqs(p)) != "[4]" {
		t.Fatalf("s2c offset=1 limit=1 = total %d seqs %v, want 3 and [4]", p.Total, seqs(p))
	}
	if w := request("GET", "/api/traffic/stream?exchange=1-0002&direction=meta", ""); w.Code != 400 {
		t.Fatalf("direction=meta = %d %s, want 400", w.Code, w.Body)
	}
	if p := get("&direction=c2s&limit=1"); p.Total != 3 || *p.MessageTotal != 2 || fmt.Sprint(seqs(p)) != "[1]" {
		t.Fatalf("first page without warning = %+v", p)
	}
	if p := get("&direction=c2s&offset=2&limit=1"); p.Total != 3 || *p.MessageTotal != 2 || fmt.Sprint(seqs(p)) != "[5]" {
		t.Fatalf("warning page = %+v", p)
	}
	if _, err := db.Exec(`DELETE FROM stream_messages WHERE exchange_id='1-0002' AND direction='c2s'`); err != nil {
		t.Fatal(err)
	}
	if p := get("&direction=c2s"); p.Total != 1 || *p.MessageTotal != 0 || fmt.Sprint(seqs(p)) != "[5]" {
		t.Fatalf("warning-only direction = %+v", p)
	}
}
