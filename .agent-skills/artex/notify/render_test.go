package notify

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTruncateBytesKeepsValidUTF8(t *testing.T) {
	// This is the most critical invariant of the package. WeCom limits by
	// **bytes**, and a multi-byte character takes several bytes; any
	// implementation that cuts raw bytes will split a character in half,
	// producing invalid UTF-8 that the platform rejects. Use several mixed
	// multi-byte inputs with coprime lengths to hit every possible cut point.
	inputs := []string{
		"éééééé",
		"mixed éé content content",
		"aébécédé",
		"🔴🟠🟡🔵", // 4-byte emoji; a wrong cut is even more obvious
		strings.Repeat("éé", 100),
	}
	for _, in := range inputs {
		for max := 1; max <= len(in)+2; max++ {
			got := TruncateBytes(in, max)
			if !utf8.ValidString(got) {
				t.Fatalf("input %q max=%d: produced invalid UTF-8 %q", in, max, got)
			}
			if len(got) > max {
				t.Fatalf("input %q max=%d: result of %d bytes exceeds the limit", in, max, len(got))
			}
			// Content must not be modified when not truncated.
			if len(in) <= max && got != in {
				t.Fatalf("input %q max=%d: content modified despite being within the limit -> %q", in, max, got)
			}
		}
	}
}

func TestTruncateBytesZeroMeansUnlimited(t *testing.T) {
	long := strings.Repeat("x", 10000)
	if got := TruncateBytes(long, 0); got != long {
		t.Fatal("max=0 should mean unlimited")
	}
	if got := TruncateBytes(long, -5); got != long {
		t.Fatal("max<0 should mean unlimited")
	}
}

func TestTruncateBytesEllipsisBudget(t *testing.T) {
	// When max is smaller than the ellipsis itself, appending the ellipsis must
	// not push the result over the limit.
	got := TruncateBytes("abcdefgh", 1)
	if len(got) > 1 {
		t.Fatalf("with max=1 the result %q has length %d, over the limit", got, len(got))
	}
	// The normal case should carry the ellipsis.
	if got := TruncateBytes("abcdefgh", 5); !strings.HasSuffix(got, ellipsis) {
		t.Fatalf("expected the ellipsis, got %q", got)
	}
}

func TestTruncateRunesCountsCharactersNotBytes(t *testing.T) {
	// The difference in convention from TruncateBytes must be preserved: Telegram
	// limits by characters, and the byte convention would cut a multi-byte
	// message down to a fraction.
	s := "éééééééééé"
	got := TruncateRunes(s, 5)
	if n := utf8.RuneCountInString(got); n != 5 {
		t.Fatalf("expected 5 characters, got %d (%q)", n, got)
	}
	// The same string under the byte convention should come out clearly shorter.
	if utf8.RuneCountInString(TruncateBytes(s, 5)) >= 5 {
		t.Fatal("the byte convention should not produce the same character count as the character convention")
	}
}

func TestOneLineCollapsesWhitespace(t *testing.T) {
	got := OneLine("first line\n\nsecond line\twith tab   spaces", 0)
	if strings.ContainsAny(got, "\n\t") {
		t.Fatalf("should collapse all whitespace, got %q", got)
	}
	if strings.Contains(got, "  ") {
		t.Fatalf("should not keep consecutive spaces, got %q", got)
	}
	// After truncation it must still be readable and valid.
	got = OneLine("éééééééééé", 4)
	if n := utf8.RuneCountInString(got); n != 4 {
		t.Fatalf("expected 4 characters, got %d (%q)", n, got)
	}
}

func TestTruncateHTMLNeverCutsTagInHalf(t *testing.T) {
	// Truncating HTML directly can cut out a fragment like `<a href="htt`, and
	// the platform will reject the whole message.
	s := `<b>Title</b>bodybodybody<a href="https://example.com/very/long/path">View details</a>`
	for max := 1; max <= utf8.RuneCountInString(s)+2; max++ {
		got := TruncateHTML(s, max)
		if n := utf8.RuneCountInString(got); max > 0 && n > max {
			t.Fatalf("max=%d: result of %d characters exceeds the limit", max, n)
		}
		// The tail must not have an unclosed `<` (i.e. a `<` with no `>` in the
		// last segment).
		if lt := strings.LastIndex(got, "<"); lt >= 0 && !strings.Contains(got[lt:], ">") {
			t.Fatalf("max=%d: tail tag was cut in half -> %q", max, got)
		}
	}
}

func TestAssetLineOmitsExcess(t *testing.T) {
	if got := assetLine(nil, 3); got != "" {
		t.Fatalf("no assets should return an empty string, got %q", got)
	}
	if got := assetLine([]string{"a", "b"}, 3); got != "a, b" {
		t.Fatalf("within the limit everything should be listed, got %q", got)
	}
	// Over the limit the number of omitted assets must be noted, otherwise
	// readers cannot tell how many assets were left out.
	if got := assetLine([]string{"a", "b", "c", "d", "e"}, 2); got != "a, b and 3 more" {
		t.Fatalf("5 assets with limit 2 should note the 3 omitted, got %q", got)
	}
	if got := assetLine([]string{"a", "b", "c", "d", "e", "f", "g", "h"}, 3); got != "a, b, c and 5 more" {
		t.Fatalf("8 assets with limit 3 should note the 5 omitted, got %q", got)
	}
}

func TestSeverityAndStatusLabels(t *testing.T) {
	if AtLeast("", "low") {
		t.Fatal("an empty severity has ordinal 0 and should be stopped by any threshold")
	}
	if !AtLeast("critical", "") {
		t.Fatal("an empty threshold should let everything through")
	}
	if got := StatusLabel("fixed"); got != "Fixed" {
		t.Fatalf("wrong status mapping, got %q", got)
	}
	// Unknown statuses are echoed as-is; no label is invented.
	if got := StatusLabel("weird_status"); got != "weird_status" {
		t.Fatalf("an unknown status should be echoed as-is, got %q", got)
	}
}

// TestTruncateHTMLNeverCutsEntity covers an omission pointed out in review:
// truncation must avoid not only half-cut tags but also cut HTML entities.
//
// After `&amp;` is cut into `&amp`, a parser that only recognizes entities may
// reject the **whole** message — and oversized digest messages are common enough
// that the cost is too high.
func TestTruncateHTMLNeverCutsEntity(t *testing.T) {
	s := "aaaa&amp;bbbb&lt;cccc&quot;dddd"
	for max := 1; max <= utf8.RuneCountInString(s)+2; max++ {
		got := TruncateHTML(s, max)
		// The tail must not show an entity fragment of "a & with no matching ;".
		if amp := strings.LastIndex(got, "&"); amp >= 0 && !strings.Contains(got[amp:], ";") {
			t.Fatalf("max=%d: entity fragment left at the tail %q", max, got[amp:])
		}
		if strings.Contains(got, "&amp\x00") {
			t.Fatalf("max=%d: malformed entity appeared", max)
		}
	}
}
