package traffic

import (
	"errors"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// directionStream records c2s "q0","q1",... and s2c "a0","a1",... interleaved
// (q0 a0 q1 a1 ...) on one WebSocket exchange and returns its id.
func directionStream(t *testing.T, pairs int) (*Traffic, string) {
	t.Helper()
	tr, s, f := unitStream(t, "direction.test")
	for i := 0; i < pairs; i++ {
		addWS(f, true, websocket.TextMessage, []byte("q"+string(rune('0'+i))))
		addWS(f, false, websocket.TextMessage, []byte("a"+string(rune('0'+i))))
	}
	s.WebSocketMessage(f)
	s.WebSocketEnd(f)
	return tr, onlyExchange(t, tr)
}

func TestStreamMessagesByDirection(t *testing.T) {
	tr, id := directionStream(t, 3)

	all, total, err := tr.StreamMessagesByDirection(id, "", 0, 50)
	if err != nil || total != 6 || len(all) != 6 {
		t.Fatalf("unfiltered: %d of %d, err %v; want 6 of 6", len(all), total, err)
	}

	for _, tc := range []struct {
		dir      string
		payloads []string
		seqs     []int64
	}{
		{"c2s", []string{"q0", "q1", "q2"}, []int64{1, 3, 5}},
		{"s2c", []string{"a0", "a1", "a2"}, []int64{2, 4, 6}},
	} {
		msgs, total, err := tr.StreamMessagesByDirection(id, tc.dir, 0, 50)
		if err != nil || total != 3 || len(msgs) != 3 {
			t.Fatalf("%s: %d of %d, err %v; want 3 of 3", tc.dir, len(msgs), total, err)
		}
		for i, m := range msgs {
			// Seq stays the position in the whole stream, so a filtered row
			// can be matched against the unfiltered conversation.
			if m.Direction != tc.dir || m.Payload != tc.payloads[i] || m.Seq != tc.seqs[i] {
				t.Fatalf("%s message %d = %+v, want payload %q seq %d", tc.dir, i, m, tc.payloads[i], tc.seqs[i])
			}
		}
		// offset and total apply to the filtered list.
		page, total, err := tr.StreamMessagesByDirection(id, tc.dir, 1, 1)
		if err != nil || total != 3 || len(page) != 1 || page[0].Payload != tc.payloads[1] {
			t.Fatalf("%s offset=1 limit=1: %+v total %d err %v; want %q", tc.dir, page, total, err, tc.payloads[1])
		}
	}

	// StreamMessages is the unfiltered form.
	if msgs, total, err := tr.StreamMessages(id, 0, 50); err != nil || total != 6 || len(msgs) != 6 {
		t.Fatalf("StreamMessages: %d of %d, err %v", len(msgs), total, err)
	}
}

func TestStreamMessagesByDirectionRejectsUnknown(t *testing.T) {
	tr, id := directionStream(t, 1)
	for _, dir := range []string{"meta", "both", "C2S", "c2s' OR 1=1 --"} {
		if _, _, err := tr.StreamMessagesByDirection(id, dir, 0, 50); !errors.Is(err, ErrBadStreamDirection) {
			t.Fatalf("direction %q: err %v, want ErrBadStreamDirection", dir, err)
		}
	}
}

// A filtered page keeps the meta row, so dropped messages are never hidden.
func TestStreamMessagesByDirectionKeepsMetaRow(t *testing.T) {
	tr, s, f := unitStream(t, "direction-meta.test")
	for i := 0; i < maxStreamMessages+4; i++ {
		addWS(f, i%2 == 0, websocket.TextMessage, []byte("m"))
	}
	s.WebSocketMessage(f)
	s.WebSocketEnd(f)
	id := onlyExchange(t, tr)

	_, total, err := tr.StreamMessagesByDirection(id, "s2c", 0, 1)
	if err != nil || total != maxStreamMessages/2+1 {
		t.Fatalf("s2c total %d err %v, want %d messages and the meta row", total, err, maxStreamMessages/2+1)
	}
	last, _, err := tr.StreamMessagesByDirection(id, "s2c", total-1, 1)
	if err != nil || len(last) != 1 || last[0].Type != "meta" {
		t.Fatalf("last s2c row %+v err %v, want the meta row", last, err)
	}
}

func TestStreamMessagePageCounts(t *testing.T) {
	tr, id := directionStream(t, 2)
	if _, err := tr.db.Exec(`INSERT INTO stream_messages(exchange_id,seq,ts,direction,kind,size,payload)
VALUES(?,5,1,'meta',0,2,'{}')`, id); err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		name, exchange, direction string
		offset, total, messages   int
		seq                       int64
	}{
		{"all first page", id, "", 0, 5, 4, 1},
		{"client first page", id, "c2s", 0, 3, 2, 1},
		{"server first page", id, "s2c", 0, 3, 2, 2},
		{"client warning page", id, "c2s", 2, 3, 2, 5},
		{"server past last page", id, "s2c", 3, 3, 2, 0},
		{"unknown exchange", "missing", "c2s", 0, 0, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// Limit 1 keeps the warning off the first page: the message total
			// must describe the whole filtered stream, not only loaded rows.
			page, err := tr.StreamMessagePageByDirection(tc.exchange, tc.direction, tc.offset, 1)
			if err != nil || page.Total != tc.total || page.MessageTotal != tc.messages {
				t.Fatalf("page = %+v, err %v; want total %d and message total %d", page, err, tc.total, tc.messages)
			}
			if tc.seq == 0 {
				if page.Items == nil || len(page.Items) != 0 {
					t.Fatalf("items = %+v, want []", page.Items)
				}
			} else if len(page.Items) != 1 || page.Items[0].Seq != tc.seq {
				t.Fatalf("items = %+v, want seq %d", page.Items, tc.seq)
			}
			if tc.seq == 5 && page.Items[0].Type != "meta" {
				t.Fatalf("warning page = %+v, want meta row", page.Items)
			}
		})
	}

	// A direction with no recorded messages still returns its warning, with a
	// raw pagination total of one and a displayed message total of zero.
	if _, err := tr.db.Exec(`DELETE FROM stream_messages WHERE exchange_id=? AND direction='c2s'`, id); err != nil {
		t.Fatal(err)
	}
	page, err := tr.StreamMessagePageByDirection(id, "c2s", 0, 50)
	if err != nil || page.Total != 1 || page.MessageTotal != 0 || len(page.Items) != 1 || page.Items[0].Type != "meta" {
		t.Fatalf("warning-only page = %+v, err %v", page, err)
	}
}

func TestTrafficMessagesToolDirection(t *testing.T) {
	tr, id := directionStream(t, 2)

	out := toolText(t, tr, "traffic_messages", `{"id":"`+id+`","direction":"s2c"}`)
	if !strings.HasPrefix(out, "[messages 1-2 of 2]") || !strings.Contains(out, `"a0"`) || !strings.Contains(out, `"a1"`) || strings.Contains(out, `"q0"`) {
		t.Fatalf("s2c output:\n%s", out)
	}
	out = toolText(t, tr, "traffic_messages", `{"id":"`+id+`","direction":" C2S "}`)
	if !strings.HasPrefix(out, "[messages 1-2 of 2]") || !strings.Contains(out, `"q1"`) || strings.Contains(out, `"a1"`) {
		t.Fatalf("c2s output (case and spaces normalized):\n%s", out)
	}
	if out := toolText(t, tr, "traffic_messages", `{"id":"`+id+`"}`); !strings.HasPrefix(out, "[messages 1-4 of 4]") {
		t.Fatalf("no direction output:\n%s", out)
	}
	if out := toolText(t, tr, "traffic_messages", `{"id":"`+id+`","direction":"sideways"}`); !strings.Contains(out, "direction must be") {
		t.Fatalf("bad direction output:\n%s", out)
	}
	if out := toolText(t, tr, "traffic_messages", `{"id":"nope","direction":"c2s"}`); !strings.Contains(out, "No c2s stream messages") {
		t.Fatalf("empty filtered output:\n%s", out)
	}
}
