package server

// Static-asset serving for the embedded SPA.
//
// The Next.js export ships ~1.55 MB of JS/CSS. Two properties made that painful
// on a high-latency link (measured from the lab: 211 ms RTT, 0.28 MB/s per SSH
// stream, 17 assets totalling 1,554,053 B):
//
//   - no compression: the handler served raw bytes and ignored Accept-Encoding,
//     so 1.55 MB crossed the wire where ~450 KB would do;
//   - no cache validators: files read out of embed.FS report a zero modtime, so
//     http.ServeContent emitted no Last-Modified, and nothing set an ETag
//     either. With no validator the browser re-downloaded the whole bundle on
//     every page load.
//
// Assets are digested and gzipped once, lazily, and held in memory (~450 KB
// total). Content-hashed Next chunks get immutable caching; HTML stays
// revalidate-only so a rebuild is never served stale.

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	assetGzipMinBytes = 1024
	immutablePrefix   = "_next/static/"
	immutableValue    = "public, max-age=31536000, immutable"
	revalidateValue   = "no-cache"
)

// assetEntry is one embedded file, digested and pre-compressed.
//
// etag and gzETag are distinct strong validators, one per representation: bytes
// on the wire for the raw body differ from those for the gzip body, so a single
// validator shared by both would let a range or a conditional request validated
// against one representation be answered from the other. Vary is not a
// substitute — it only tells caches that the representations differ, it does not
// make one ETag describe both.
type assetEntry struct {
	raw    []byte
	gz     []byte
	etag   string
	gzETag string
	ctype  string
}

// assetCache holds entries keyed by path within the embedded tree.
var assetCache sync.Map

func loadAsset(fsys fs.FS, name string) (*assetEntry, error) {
	if v, ok := assetCache.Load(name); ok {
		return v.(*assetEntry), nil
	}
	raw, err := fs.ReadFile(fsys, name)
	if err != nil {
		return nil, err
	}
	e := &assetEntry{raw: raw, ctype: assetContentType(name)}
	sum := sha256.Sum256(raw)
	e.etag = `"` + hex.EncodeToString(sum[:16]) + `"`
	if len(raw) >= assetGzipMinBytes && assetCompressible(e.ctype) {
		var buf bytes.Buffer
		if zw, zerr := gzip.NewWriterLevel(&buf, gzip.BestCompression); zerr == nil {
			_, _ = zw.Write(raw)
			_ = zw.Close()
			if buf.Len() < len(raw) {
				e.gz = buf.Bytes()
				// Digest the compressed bytes ourselves rather than suffixing
				// the raw validator: the plaintext hash would say nothing about
				// what this representation actually contains.
				gzSum := sha256.Sum256(e.gz)
				e.gzETag = `"` + hex.EncodeToString(gzSum[:16]) + `-gzip"`
			}
		}
	}
	actual, _ := assetCache.LoadOrStore(name, e)
	return actual.(*assetEntry), nil
}

func assetContentType(name string) string {
	if ct := mime.TypeByExtension(path.Ext(name)); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

func assetCompressible(ctype string) bool {
	base := ctype
	if i := strings.IndexByte(base, ';'); i >= 0 {
		base = base[:i]
	}
	switch base {
	case "text/html", "text/css", "text/javascript", "application/javascript",
		"application/json", "image/svg+xml", "text/plain":
		return true
	}
	return false
}

// gzipAccepted reports whether the client accepts gzip with a non-zero q-value.
func gzipAccepted(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		coding := strings.ToLower(strings.TrimSpace(fields[0]))
		if coding != "gzip" && coding != "*" {
			continue
		}
		q := 1.0
		for _, attr := range fields[1:] {
			attr = strings.TrimSpace(attr)
			if strings.HasPrefix(attr, "q=") {
				if v, err := strconv.ParseFloat(strings.TrimPrefix(attr, "q="), 64); err == nil {
					q = v
				}
			}
		}
		if q > 0 {
			return true
		}
	}
	return false
}

// serveWebAsset writes name from fsys with validators, and gzipped when the
// client accepts it. Returns false when the file is absent or unreadable so the
// caller can try the next candidate path.
func serveWebAsset(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string, immutable bool) bool {
	e, err := loadAsset(fsys, name)
	if err != nil {
		return false
	}
	h := w.Header()
	h.Set("Content-Type", e.ctype)
	h.Add("Vary", "Accept-Encoding")
	if immutable {
		h.Set("Cache-Control", immutableValue)
	} else {
		h.Set("Cache-Control", revalidateValue)
	}
	// Pick the representation first, then publish the validator for it. The raw
	// and gzip bodies are different entity-tags: sharing one would let a client
	// that holds the gzip ETag send If-Range and be served raw bytes (or the
	// reverse) as a 206.
	body := e.raw
	etag := e.etag
	if e.gz != nil && gzipAccepted(r) {
		h.Set("Content-Encoding", "gzip")
		body = e.gz
		etag = e.gzETag
	}
	h.Set("ETag", etag)
	// ServeContent handles Range, HEAD and If-None-Match against the ETag we
	// just set for this representation.
	// Zero modtime: content-hashed assets have no meaningful mtime and we do
	// not want a second, weaker validator in play.
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(body))
	return true
}

// webuiImmutable reports whether name may be cached forever. Only the
// content-hashed Next build output qualifies; HTML must revalidate so a rebuild
// is never served stale.
func webuiImmutable(name string) bool {
	return strings.HasPrefix(name, immutablePrefix)
}
