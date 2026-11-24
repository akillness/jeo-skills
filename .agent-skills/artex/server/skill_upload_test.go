package server

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klauspost/compress/zstd"
	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestValidSkillName(t *testing.T) {
	ok := []string{"web-recon", "a", "nuclei2", "chinese-skill", "port-scan-x", "japanese-skill"}
	bad := []string{
		"", "Web-Recon", "-lead", "trail-", "dou--ble", "has space", "chinese skill",
		"dot.name", "a/b", `a\b`, "..", ".", "chinese/skill", "sk\x00ill", "ba‮d",
		strings.Repeat("a", 65), "1abc", "chinese-skill!",
	}
	for _, n := range ok {
		if !validSkillName(n) {
			t.Errorf("validSkillName(%q) = false, want true", n)
		}
	}
	for _, n := range bad {
		if validSkillName(n) {
			t.Errorf("validSkillName(%q) = true, want false", n)
		}
	}
}

func TestSkillRelPath(t *testing.T) {
	ok := map[string]string{
		"SKILL.md":              "SKILL.md",
		"scripts/run.py":        "scripts/run.py",
		"references/notes.md":   "references/notes.md",
		"references/a b.txt":    "references/a b.txt",
		"./SKILL.md":            "SKILL.md",
		"assets/image-1_v2.png": "assets/image-1_v2.png",
	}
	for in, want := range ok {
		got, msg := skillRelPath(in)
		if msg != "" || got != want {
			t.Errorf("skillRelPath(%q) = (%q, %q), want (%q, \"\")", in, got, msg, want)
		}
	}
	bad := []string{
		"", "../etc/passwd", "a/../../b", "/abs/path", "a//b", `..\..\x`,
		"%2e%2e/x", "a\x00b", "chinese name.md", "ba‮d.md", "a#b.md", "a?b.md",
		"a:b.md", string([]byte{0xd6, 0xd0}) + ".md", // raw GBK bytes: invalid UTF-8
		strings.Repeat("a", maxSkillPathLen+1),
	}
	for _, in := range bad {
		if got, msg := skillRelPath(in); msg == "" {
			t.Errorf("skillRelPath(%q) = (%q, \"\"), want rejection", in, got)
		}
	}
}

type nopWriteCloser struct{ io.Writer }

func (nopWriteCloser) Close() error { return nil }

// zipFile describes one entry for buildZip.
type zipFile struct {
	name    string
	body    string
	method  uint16
	nonUTF8 bool // write the name bytes as-is (GBK zip)
}

func buildZip(t *testing.T, files ...zipFile) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	zw.RegisterCompressor(zipMethodZstd, zstd.ZipCompressor())
	// Deflate64 has no pure-Go encoder; the body is written as-is just to tag the entry
	// with method 9 — the assertion checks the message given for an unsupported method,
	// nothing is actually decompressed.
	zw.RegisterCompressor(zipMethodDeflate64, func(w io.Writer) (io.WriteCloser, error) {
		return nopWriteCloser{w}, nil
	})
	for _, f := range files {
		h := &zip.FileHeader{Name: f.name, Method: f.method, NonUTF8: f.nonUTF8}
		w, err := zw.CreateHeader(h)
		if err != nil {
			t.Fatalf("CreateHeader(%q): %v", f.name, err)
		}
		if _, err := io.WriteString(w, f.body); err != nil {
			t.Fatalf("write %q: %v", f.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	return buf.Bytes()
}

// uploadZip posts raw zip bytes to fsUploadSkill and returns the response.
func uploadZip(t *testing.T, skillDir string, filename string, data []byte) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write(data); err != nil {
		t.Fatal(err)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/skills/upload", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rr := httptest.NewRecorder()
	(&Server{skillDir: skillDir}).fsUploadSkill(rr, req)

	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	return rr, out
}

const zhSkillMD = "---\nname: chinese-skill\ndescription: test\n---\nbody\n"

// A zstd-compressed archive (an optional WinZip compression method) used to blow up with
// "zip: unsupported compression"; it now installs like any Deflate archive.
func TestUploadSkillZstdAndChineseNames(t *testing.T) {
	dir := t.TempDir()
	data := buildZip(t,
		zipFile{name: "chinese-skill/SKILL.md", body: zhSkillMD, method: zipMethodZstd},
		zipFile{name: "chinese-skill/references/notes doc.md", body: "reference", method: zipMethodZstd},
		zipFile{name: "chinese-skill/scripts/run.py", body: "print(1)", method: zip.Deflate},
	)
	rr, out := uploadZip(t, dir, "chinese-skill.zip", data)
	if rr.Code != 201 {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body)
	}
	if out["name"] != "chinese-skill" {
		t.Fatalf("name = %v, want chinese-skill", out["name"])
	}
	for _, rel := range []string{"SKILL.md", "references/notes doc.md", "scripts/run.py"} {
		if _, err := os.Stat(filepath.Join(dir, "chinese-skill", rel)); err != nil {
			t.Errorf("missing extracted file %q: %v", rel, err)
		}
	}
}

// GBK-named entries (7-Zip / Explorer on Chinese Windows) must be decoded rather
// than rejected as invalid UTF-8 paths.
func TestUploadSkillGBKNames(t *testing.T) {
	gbk := func(s string) string {
		b, err := simplifiedchinese.GBK.NewEncoder().String(s)
		if err != nil {
			t.Fatalf("gbk encode %q: %v", s, err)
		}
		return b
	}
	dir := t.TempDir()
	data := buildZip(t,
		zipFile{name: gbk("chinese-skill/SKILL.md"), body: zhSkillMD, method: zip.Deflate, nonUTF8: true},
		zipFile{name: gbk("chinese-skill/reference-materials.md"), body: "content", method: zip.Deflate, nonUTF8: true},
	)
	rr, out := uploadZip(t, dir, "skill.zip", data)
	if rr.Code != 201 {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body)
	}
	if out["name"] != "chinese-skill" {
		t.Fatalf("name = %v, want chinese-skill", out["name"])
	}
	if _, err := os.Stat(filepath.Join(dir, "chinese-skill", "reference-materials.md")); err != nil {
		t.Errorf("GBK-named entry not extracted: %v", err)
	}
}

// An archive we genuinely cannot decode should name the method in the error instead of
// surfacing "zip: unsupported compression algorithm".
func TestUploadSkillUnsupportedMethod(t *testing.T) {
	data := buildZip(t,
		zipFile{name: "demo/SKILL.md", body: "---\nname: demo\n---\n", method: zipMethodDeflate64},
	)
	rr, out := uploadZip(t, t.TempDir(), "demo.zip", data)
	if rr.Code != 400 {
		t.Fatalf("status = %d, want 400 (body %s)", rr.Code, rr.Body)
	}
	msg, _ := out["error"].(string)
	if !strings.Contains(msg, "Deflate64") || !strings.Contains(msg, "unsupported compression method") {
		t.Fatalf("error = %q, want a message naming Deflate64", msg)
	}
}

func TestUploadSkillEncrypted(t *testing.T) {
	data := buildZip(t, zipFile{name: "demo/SKILL.md", body: "---\nname: demo\n---\n", method: zip.Deflate})
	// flip the "encrypted" general-purpose flag bit in the local file header
	// (offset 6) and in the central directory copy (offset 8).
	local := bytes.Index(data, []byte("PK\x03\x04"))
	central := bytes.Index(data, []byte("PK\x01\x02"))
	if local < 0 || central < 0 {
		t.Fatal("could not locate zip headers")
	}
	data[local+6] |= 1
	data[central+8] |= 1

	rr, out := uploadZip(t, t.TempDir(), "demo.zip", data)
	if rr.Code != 400 {
		t.Fatalf("status = %d, want 400 (body %s)", rr.Code, rr.Body)
	}
	if msg, _ := out["error"].(string); !strings.Contains(msg, "archive is encrypted") {
		t.Fatalf("error = %q, want an encryption hint", msg)
	}
}

// Zip-slip must still be refused now that the path check accepts Unicode.
func TestUploadSkillRejectsTraversal(t *testing.T) {
	data := buildZip(t,
		zipFile{name: "demo/SKILL.md", body: "---\nname: demo\n---\n", method: zip.Deflate},
		zipFile{name: "demo/../../evil.sh", body: "rm -rf /", method: zip.Deflate},
	)
	dir := t.TempDir()
	rr, out := uploadZip(t, dir, "demo.zip", data)
	if rr.Code != 400 {
		t.Fatalf("status = %d, want 400 (body %s)", rr.Code, rr.Body)
	}
	if msg, _ := out["error"].(string); !strings.Contains(msg, "illegal path") {
		t.Fatalf("error = %q, want an illegal-path error", msg)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Fatalf("upload left files behind: %v", entries)
	}
}

func TestSkillNameFromFrontmatterQuoted(t *testing.T) {
	got := skillNameFromFrontmatter([]byte("---\nname: \"chinese-skill\"\ndescription: x\n---\n"))
	if got != "chinese-skill" {
		t.Fatalf("name = %q, want chinese-skill", got)
	}
}
