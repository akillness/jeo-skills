package notify

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

// This file covers the configurable render limits (Message.Limits). The summary
// length and the number of assets listed used to be the fixed constants 120 / 3;
// they now come from the caller, with 0 meaning "no truncation" and nil meaning
// "the old defaults".

// limitsItem returns an item whose summary (200 characters) and asset list (8)
// both exceed the defaults. It contains no markdown/HTML metacharacters, so
// every renderer emits the text verbatim and one set of assertions fits all.
func limitsItem() Item {
	assets := make([]string, 8)
	for i := range assets {
		assets[i] = "host" + itoa(i+1)
	}
	return Item{Severity: "high", Name: "title", Summary: strings.Repeat("Z", 200), Assets: assets}
}

// feishuContent returns the lark_md text of the card's element idx.
func feishuContent(t *testing.T, m Message, idx int) string {
	t.Helper()
	card, _ := feishuCard(m)
	elements, _ := card["elements"].([]any)
	if idx >= len(elements) {
		t.Fatalf("card has %d elements, cannot get element %d", len(elements), idx)
	}
	div, _ := elements[idx].(map[string]any)
	text, _ := div["text"].(map[string]any)
	content, _ := text["content"].(string)
	return content
}

// limitsRenderings returns the body of every channel family that applies the
// limits. For a digest, the Feishu entry is the first item line (element 0 is
// the intro).
func limitsRenderings(t *testing.T, m Message) map[string]string {
	t.Helper()
	md, _ := markdownBody(m, 0)
	tg, _ := telegramHTML(m)
	feishuIdx := 0
	if m.Batch {
		feishuIdx = 1
	}
	return map[string]string{
		"markdown": md,
		"feishu":   feishuContent(t, m, feishuIdx),
		"telegram": tg,
		"email":    htmlBody(m, 0),
	}
}

func TestMessageLimitsApplyToSinglePush(t *testing.T) {
	cases := []struct {
		name  string
		lim   *Limits
		must  []string
		wrong []string
	}{
		{
			name:  "unset keeps the 120 / 3 defaults",
			lim:   nil,
			must:  []string{strings.Repeat("Z", 119) + ellipsis, "host1, host2, host3 and 5 more"},
			wrong: []string{strings.Repeat("Z", 120), "host4"},
		},
		{
			name:  "zero means no truncation",
			lim:   &Limits{},
			must:  []string{strings.Repeat("Z", 200), "host7, host8"},
			wrong: []string{ellipsis, " more"},
		},
		{
			name:  "custom values",
			lim:   &Limits{SummaryRunes: 10, AssetsShown: 1},
			must:  []string{strings.Repeat("Z", 9) + ellipsis, "host1 and 7 more"},
			wrong: []string{strings.Repeat("Z", 10), "host2"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := Message{Items: []Item{limitsItem()}, Limits: tc.lim}
			for channel, got := range limitsRenderings(t, m) {
				for _, want := range tc.must {
					if !strings.Contains(got, want) {
						t.Errorf("%s: missing %q:\n%s", channel, want, got)
					}
				}
				for _, bad := range tc.wrong {
					if strings.Contains(got, bad) {
						t.Errorf("%s: %q should not appear:\n%s", channel, bad, got)
					}
				}
			}
		})
	}
}

// TestMessageLimitsApplyToDigestAssets covers the digest lines, which list the
// assets too. The digest summary is not governed by Limits.SummaryRunes: it
// stays at its own fixed 60 characters (markdown and email), a digest being a
// list of one-liners.
func TestMessageLimitsApplyToDigestAssets(t *testing.T) {
	m := Message{Batch: true, Items: []Item{limitsItem()}}
	for channel, got := range limitsRenderings(t, m) {
		if !strings.Contains(got, "host1, host2, host3 and 5 more") {
			t.Errorf("%s: unset should keep 3 assets:\n%s", channel, got)
		}
	}
	m.Limits = &Limits{}
	for channel, got := range limitsRenderings(t, m) {
		if !strings.Contains(got, "host7, host8") || strings.Contains(got, " more") {
			t.Errorf("%s: 0 should list every asset:\n%s", channel, got)
		}
		if strings.Contains(got, strings.Repeat("Z", 60)) {
			t.Errorf("%s: the digest summary should stay within 60 characters:\n%s", channel, got)
		}
	}
}

// TestFeishuUntruncatedItemStaysWithinBodyLimit is the guard that goes with
// "0 = no truncation". Feishu custom bots reject a request body over 20 KB as a
// whole, so an unbounded summary or asset list would not arrive shortened — it
// would not arrive at all. The body measured here is the real one sent on the
// wire, signature included.
func TestFeishuUntruncatedItemStaysWithinBodyLimit(t *testing.T) {
	const feishuBodyLimit = 20000

	huge := limitsItem()
	huge.DetailURL = "https://artex.local/function/findings/detail?id=42"
	// 36000 bytes of CJK: also checks that the cut lands on a character boundary.
	huge.Summary = strings.Repeat("漏洞摘要", 3000)
	huge.Assets = nil
	for i := 0; i < 1500; i++ {
		huge.Assets = append(huge.Assets, "host"+itoa(i+1)+".example.com")
	}

	cases := []struct {
		name string
		m    Message
		idx  int
	}{
		{"single push", Message{Items: []Item{huge}, Limits: &Limits{}}, 0},
		{"digest whose first item is oversized", Message{
			Batch: true, WindowMinutes: 30, HomeURL: "https://artex.local/function/findings",
			Items: []Item{huge, huge}, Limits: &Limits{},
		}, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			size := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				raw, _ := io.ReadAll(r.Body)
				size = len(raw)
				_, _ = io.WriteString(w, `{"code":0,"msg":"success"}`)
			}))
			defer srv.Close()

			kept, err := (feishuChannel{}).Send(context.Background(), map[string]any{"webhook": srv.URL, "secret": "SECtest123"}, tc.m)
			if err != nil {
				t.Fatalf("delivery failed: %v", err)
			}
			if kept != 1 {
				t.Fatalf("exactly the first item should be reported as delivered, got %d", kept)
			}
			if size == 0 || size > feishuBodyLimit {
				t.Fatalf("request body of %d bytes, want 1..%d", size, feishuBodyLimit)
			}
			content := feishuContent(t, tc.m, tc.idx)
			if !utf8.ValidString(content) || !strings.HasSuffix(content, ellipsis) {
				t.Fatalf("the item should be cut on a character boundary and end with an ellipsis, got tail %q", content[len(content)-12:])
			}
		})
	}
}
