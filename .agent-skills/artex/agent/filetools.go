package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	actool "github.com/Autumn-27/norma/tool"
)

// Confined file tools. The SDK's Read/Write/Edit/MultiEdit/LS/Glob/Grep run inside
// the server process, which is root in the Docker image, and accept any absolute or
// relative path: they would read /app/keys or the config file, and write a skill or
// the config, while the agent's shell runs as the unprivileged executor. These
// replacements keep the SDK tools' names, descriptions and input schemas (the model
// sees no change) and open every path through an os.Root on the run's working
// directory. os.Root resolves each path component inside the root at the syscall
// level, so an absolute path outside, "..", or a symlink leading out of the working
// directory is refused, including a symlink the agent's shell swaps in while a call
// runs. Grep does not start ripgrep: that would read the files with root's rights by
// path.

// confinedFileToolNames are the SDK default tools replaced by defaultTools.
var confinedFileToolNames = map[string]func(*workRoot, json.RawMessage, *actool.ToolContext) (actool.Result, error){
	"Read":      runConfinedRead,
	"Write":     runConfinedWrite,
	"Edit":      runConfinedEdit,
	"MultiEdit": runConfinedMultiEdit,
	"LS":        runConfinedLS,
	"Glob":      runConfinedGlob,
	"Grep":      runConfinedGrep,
}

// defaultTools is actool.DefaultTools() with the file tools confined to the run's
// working directory under base (the data directory the agent's run directories
// live in). Every agent kind builds its tool set from it.
func defaultTools(base string) []actool.CoreTool {
	all := actool.DefaultTools()
	out := make([]actool.CoreTool, 0, len(all))
	for _, t := range all {
		if run, ok := confinedFileToolNames[t.Name()]; ok {
			t = &confinedFileTool{CoreTool: t, base: base, run: run}
		}
		out = append(out, t)
	}
	return out
}

// confinedFileTool keeps the SDK tool's metadata and permission self-check and
// replaces only Call.
type confinedFileTool struct {
	actool.CoreTool
	base string
	run  func(*workRoot, json.RawMessage, *actool.ToolContext) (actool.Result, error)
}

func (t *confinedFileTool) Call(_ context.Context, in json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	dir := ""
	if tc != nil {
		dir = tc.WorkingDir
	}
	var (
		res     actool.Result
		err     error
		capture bool
	)
	// Every file system access of the call, from opening the working directory on,
	// runs as the executor when the privilege drop is active (filetools_identity.go).
	idErr := RunAsFileToolIdentity(func() {
		w, oerr := openWorkRoot(t.base, dir)
		if oerr != nil {
			res = actool.Errorf(fmt.Sprintf("Error: %s cannot run: %v", t.Name(), oerr))
			return
		}
		defer w.Close()
		res, err = t.run(w, in, tc)
		capture = w.captured
	})
	if idErr != nil {
		return actool.Errorf(fmt.Sprintf("Error: %s cannot run: %v", t.Name(), idErr)), nil
	}
	if capture && err == nil {
		// Bounded here, with the server's identity: an output over the cap is spilled
		// to the root-owned spill directory, which the executor cannot write.
		res = actool.Text(actool.Capture(tc, res.Flatten()))
	}
	return res, err
}

// workRoot is the run's working directory opened as an os.Root. dir is the path the
// model knows it by: absolute paths inside it are accepted and outputs use it.
type workRoot struct {
	*os.Root
	dir string
	// captured is set by capture: the result text still has to go through
	// actool.Capture once the call has left the file tool identity.
	captured bool
}

// capture returns s unbounded and marks the call for actool.Capture in Call.
func (w *workRoot) capture(s string) string {
	w.captured = true
	return s
}

var (
	errOutsideWorkDir = errors.New("outside the working directory")
	errNotRegular     = errors.New("not a regular file")
	errHardLinked     = errors.New("the file has other hard links, which can lead outside the working directory")
)

// openWorkRoot opens dir, which must lie strictly below base. base is set by the
// server and resolved as is; below it every component is opened inside its parent
// (os.Root.OpenRoot), so a run directory the agent's shell replaced with a symlink
// cannot move the root out of the parent workspace tree (to / or to the data
// directory, for instance). Fails closed on any error.
func openWorkRoot(base, dir string) (*workRoot, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, errors.New("no working directory for this run")
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	absBase, err := filepath.Abs(base)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(absBase, absDir)
	if err != nil || rel == "." || !filepath.IsLocal(rel) {
		return nil, errors.New("the working directory is not inside the data directory")
	}
	realBase, err := filepath.EvalSymlinks(absBase)
	if err != nil {
		return nil, fmt.Errorf("data directory: %w", err)
	}
	// A relative symlink inside the data directory passes os.Root (it stays in the
	// root), so the path is also required to be free of symlinks: the agent's shell
	// can replace a run directory with a link to another run's tree or to a
	// root-only file such as the MITM CA key.
	want := filepath.Join(realBase, rel)
	if got, err := filepath.EvalSymlinks(want); err != nil || got != want {
		return nil, errors.New("the working directory path contains a symlink")
	}
	r, err := os.OpenRoot(realBase)
	if err != nil {
		return nil, fmt.Errorf("data directory: %w", err)
	}
	for _, c := range strings.Split(rel, string(filepath.Separator)) {
		next, err := r.OpenRoot(c)
		r.Close()
		if err != nil {
			return nil, fmt.Errorf("open the working directory: %w", err)
		}
		r = next
	}
	return &workRoot{Root: r, dir: absDir}, nil
}

// rel maps a model-supplied path to a path relative to the root. Empty means the
// working directory itself. An absolute path must lie inside the working directory;
// ".." leading out of it is refused here, and os.Root refuses any symlink that does.
func (w *workRoot) rel(p string) (string, error) {
	if strings.ContainsRune(p, 0) {
		return "", errOutsideWorkDir
	}
	if p == "" {
		return ".", nil
	}
	if filepath.IsAbs(p) {
		r, err := filepath.Rel(w.dir, filepath.Clean(p))
		if err != nil {
			return "", errOutsideWorkDir
		}
		p = r
	}
	p = filepath.Clean(p)
	if !filepath.IsLocal(p) {
		return "", errOutsideWorkDir
	}
	return p, nil
}

// refuse answers a path outside the working directory.
func (w *workRoot) refuse(p string) actool.Result {
	return actool.Errorf(fmt.Sprintf("Error: %s is outside the working directory %s. File tools only reach paths inside it (a symlink that leads out of it is refused too). To read a file elsewhere that your shell may access, use Bash.", p, w.dir))
}

// readFile reads a regular file inside the root. A file with more than one hard
// link is refused: a link made in the working directory to a file outside it would
// otherwise be read with the server's rights.
func (w *workRoot) readFile(rel string) ([]byte, error) {
	if fi, err := w.Stat(rel); err != nil {
		return nil, err
	} else if !fi.Mode().IsRegular() {
		return nil, errNotRegular
	}
	f, err := w.Open(rel)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if err := checkOpened(f); err != nil {
		return nil, err
	}
	return io.ReadAll(f)
}

// writeFile replaces the contents of rel, creating it when missing. The checks run
// on the opened file before it is truncated.
func (w *workRoot) writeFile(rel string, data []byte) error {
	if fi, err := w.Stat(rel); err == nil && !fi.Mode().IsRegular() {
		return errNotRegular
	}
	// 0664: the executor group shares the workspace tree (server/execpriv.go).
	f, err := w.OpenFile(rel, os.O_WRONLY|os.O_CREATE, 0o664)
	if err != nil {
		return err
	}
	if err := checkOpened(f); err != nil {
		f.Close()
		return err
	}
	if err := f.Truncate(0); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func checkOpened(f *os.File) error {
	fi, err := f.Stat()
	switch {
	case err != nil:
		return err
	case !fi.Mode().IsRegular():
		return errNotRegular
	case extraHardLinks(fi):
		return errHardLinked
	}
	return nil
}

// ---------- Read ----------

const confinedMaxLineLen = 2000

// confinedReadOutputBonus mirrors the SDK Read tool's extra output budget.
const confinedReadOutputBonus = 1000

func runConfinedRead(w *workRoot, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		FilePath string `json:"file_path"`
		Offset   int    `json:"offset"`
		Limit    int    `json:"limit"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	rel, err := w.rel(in.FilePath)
	if err != nil {
		return w.refuse(in.FilePath), nil
	}
	info, err := w.Stat(rel)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error reading %s: %v", in.FilePath, err)), nil
	}
	if info.IsDir() {
		return actool.Errorf(fmt.Sprintf("Error: %s is a directory, not a file. Use LS or Glob to list its contents.", in.FilePath)), nil
	}
	data, err := w.readFile(rel)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error reading %s: %v", in.FilePath, err)), nil
	}
	if isBinaryData(data) {
		return actool.Text(fmt.Sprintf("[binary file %s not shown — %d bytes]", in.FilePath, len(data))), nil
	}
	lines := strings.Split(string(data), "\n")
	start := 0
	if in.Offset > 0 {
		start = in.Offset - 1
	}
	if start > len(lines) {
		start = len(lines)
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 2000
	}
	end := min(start+limit, len(lines))
	var b strings.Builder
	for i := start; i < end; i++ {
		line := lines[i]
		if len(line) > confinedMaxLineLen {
			line = line[:confinedMaxLineLen] + "… [line truncated]"
		}
		fmt.Fprintf(&b, "%6d\t%s\n", i+1, line)
	}
	if b.Len() == 0 {
		if len(data) == 0 {
			return actool.Text("(file is empty)"), nil
		}
		return actool.Text("(no lines in the requested range)"), nil
	}
	return actool.Text(confinedReadCapture(tc, b.String(), start)), nil
}

// confinedReadCapture bounds Read's output like the SDK tool: it cuts at a line
// boundary and tells the model the offset to continue from.
func confinedReadCapture(tc *actool.ToolContext, s string, start int) string {
	limit := actool.MaxOutput(tc) + confinedReadOutputBonus
	if len(s) <= limit {
		return s
	}
	head := s[:limit]
	if cut := strings.LastIndexByte(head, '\n'); cut >= 0 {
		head = s[:cut+1]
	}
	next := start + strings.Count(head, "\n") + 1
	return head + fmt.Sprintf(
		"\n... [Read truncated to fit the output limit. Continue reading the file with Read offset=%d (and an optional limit), or narrow with Grep/`sed -n`.] ...", next)
}

// isBinaryData reports a NUL byte in the first chunk, the SDK's heuristic.
func isBinaryData(data []byte) bool {
	return bytes.IndexByte(data[:min(len(data), 8000)], 0) >= 0
}

// ---------- Write / Edit / MultiEdit ----------

func runConfinedWrite(w *workRoot, input json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
	var in struct {
		FilePath string `json:"file_path"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	rel, err := w.rel(in.FilePath)
	if err != nil {
		return w.refuse(in.FilePath), nil
	}
	existed := false
	if info, err := w.Stat(rel); err == nil {
		if info.IsDir() {
			return actool.Errorf(fmt.Sprintf("Error: %s is an existing directory, not a file.", in.FilePath)), nil
		}
		existed = true
	}
	if dir := filepath.Dir(rel); dir != "." {
		// 0775: the executor group shares the workspace tree (server/execpriv.go).
		if err := w.MkdirAll(dir, 0o775); err != nil {
			return actool.Errorf(fmt.Sprintf("Error creating directory: %v", err)), nil
		}
	}
	if err := w.writeFile(rel, []byte(in.Content)); err != nil {
		return actool.Errorf(fmt.Sprintf("Error writing %s: %v", in.FilePath, err)), nil
	}
	verb := "Created"
	if existed {
		verb = "Overwrote"
	}
	return actool.Text(fmt.Sprintf("%s %s (%d bytes)", verb, in.FilePath, len(in.Content))), nil
}

func runConfinedEdit(w *workRoot, input json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
	var in struct {
		FilePath   string `json:"file_path"`
		OldString  string `json:"old_string"`
		NewString  string `json:"new_string"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	if in.OldString == in.NewString {
		return actool.Errorf("Error: old_string and new_string are identical"), nil
	}
	rel, err := w.rel(in.FilePath)
	if err != nil {
		return w.refuse(in.FilePath), nil
	}
	data, err := w.readFile(rel)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error reading %s: %v", in.FilePath, err)), nil
	}
	content := string(data)
	count := strings.Count(content, in.OldString)
	if count == 0 {
		return actool.Errorf(fmt.Sprintf("Error: old_string not found in %s", in.FilePath)), nil
	}
	if count > 1 && !in.ReplaceAll {
		return actool.Errorf(fmt.Sprintf("Error: old_string is not unique in %s (%d matches); add context or set replace_all", in.FilePath, count)), nil
	}
	var updated string
	if in.ReplaceAll {
		updated = strings.ReplaceAll(content, in.OldString, in.NewString)
	} else {
		updated = strings.Replace(content, in.OldString, in.NewString, 1)
	}
	if err := w.writeFile(rel, []byte(updated)); err != nil {
		return actool.Errorf(fmt.Sprintf("Error writing %s: %v", in.FilePath, err)), nil
	}
	return actool.Text(fmt.Sprintf("Edited %s (%d replacement(s))", in.FilePath, count)), nil
}

func runConfinedMultiEdit(w *workRoot, input json.RawMessage, _ *actool.ToolContext) (actool.Result, error) {
	var in struct {
		FilePath string `json:"file_path"`
		Edits    []struct {
			OldString  string `json:"old_string"`
			NewString  string `json:"new_string"`
			ReplaceAll bool   `json:"replace_all"`
		} `json:"edits"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	if len(in.Edits) == 0 {
		return actool.Errorf("Error: no edits provided"), nil
	}
	rel, err := w.rel(in.FilePath)
	if err != nil {
		return w.refuse(in.FilePath), nil
	}
	data, err := w.readFile(rel)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error reading %s: %v", in.FilePath, err)), nil
	}
	content := string(data)
	total := 0
	for i, e := range in.Edits {
		if e.OldString == e.NewString {
			return actool.Errorf(fmt.Sprintf("Error in edit %d: old_string and new_string are identical", i+1)), nil
		}
		count := strings.Count(content, e.OldString)
		if count == 0 {
			return actool.Errorf(fmt.Sprintf("Error in edit %d: old_string not found", i+1)), nil
		}
		if count > 1 && !e.ReplaceAll {
			return actool.Errorf(fmt.Sprintf("Error in edit %d: old_string is not unique (%d matches); add context or set replace_all", i+1, count)), nil
		}
		if e.ReplaceAll {
			content = strings.ReplaceAll(content, e.OldString, e.NewString)
		} else {
			content = strings.Replace(content, e.OldString, e.NewString, 1)
		}
		total += count
	}
	if err := w.writeFile(rel, []byte(content)); err != nil {
		return actool.Errorf(fmt.Sprintf("Error writing %s: %v", in.FilePath, err)), nil
	}
	return actool.Text(fmt.Sprintf("Applied %d edits to %s (%d replacement(s))", len(in.Edits), in.FilePath, total)), nil
}

// ---------- LS ----------

func runConfinedLS(w *workRoot, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	rel, err := w.rel(in.Path)
	if err != nil {
		return w.refuse(in.Path), nil
	}
	// Stat first: opening a FIFO to list it would block.
	if info, err := w.Stat(rel); err == nil && !info.IsDir() {
		return actool.Errorf(fmt.Sprintf("Error listing %s: not a directory", in.Path)), nil
	}
	entries, err := fs.ReadDir(w.FS(), filepath.ToSlash(rel))
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error listing %s: %v", in.Path, err)), nil
	}
	if len(entries) == 0 {
		return actool.Text("(empty directory)"), nil
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir() != entries[j].IsDir() {
			return entries[i].IsDir() // directories first
		}
		return entries[i].Name() < entries[j].Name()
	})
	var b strings.Builder
	for _, e := range entries {
		if e.IsDir() {
			fmt.Fprintf(&b, "%s/\n", e.Name())
			continue
		}
		var size int64
		if info, err := w.Lstat(filepath.Join(rel, e.Name())); err == nil {
			size = info.Size()
		}
		fmt.Fprintf(&b, "%s\t%d bytes\n", e.Name(), size)
	}
	return actool.Text(w.capture(b.String())), nil
}

// ---------- Glob ----------

var confinedSkipDirs = map[string]bool{".git": true, "node_modules": true, "vendor": true}

// relUnder returns p relative to the walk base (both slash paths from fs.WalkDir).
func relUnder(base, p string) string {
	if base == "." {
		return p
	}
	if p == base {
		return "."
	}
	return strings.TrimPrefix(p, base+"/")
}

func runConfinedGlob(w *workRoot, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	rel, err := w.rel(in.Path)
	if err != nil {
		return w.refuse(in.Path), nil
	}
	base := filepath.ToSlash(rel)
	type match struct {
		path string
		mod  int64
	}
	var matches []match
	_ = fs.WalkDir(w.FS(), base, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if confinedSkipDirs[d.Name()] {
				return fs.SkipDir
			}
			return nil
		}
		if globMatch(in.Pattern, relUnder(base, p)) {
			var mod int64
			if info, e := w.Lstat(filepath.FromSlash(p)); e == nil {
				mod = info.ModTime().UnixNano()
			}
			matches = append(matches, match{filepath.Join(w.dir, filepath.FromSlash(p)), mod})
		}
		return nil
	})
	sort.Slice(matches, func(i, j int) bool { return matches[i].mod > matches[j].mod })
	if len(matches) == 0 {
		return actool.Text("No files found"), nil
	}
	var b strings.Builder
	for _, m := range matches {
		b.WriteString(m.path)
		b.WriteByte('\n')
	}
	return actool.Text(w.capture(b.String())), nil
}

// globMatch is the SDK Glob matcher: a pattern without "/" matches the base name,
// "**" matches any number of segments.
func globMatch(pattern, p string) bool {
	pattern = filepath.ToSlash(pattern)
	p = filepath.ToSlash(p)
	if !strings.Contains(pattern, "/") {
		if ok, _ := path.Match(pattern, path.Base(p)); ok {
			return true
		}
	}
	return globSegs(strings.Split(pattern, "/"), strings.Split(p, "/"))
}

func globSegs(pat, name []string) bool {
	if len(pat) == 0 {
		return len(name) == 0
	}
	if pat[0] == "**" {
		for i := 0; i <= len(name); i++ {
			if globSegs(pat[1:], name[i:]) {
				return true
			}
		}
		return false
	}
	if len(name) == 0 {
		return false
	}
	if ok, _ := path.Match(pat[0], name[0]); !ok {
		return false
	}
	return globSegs(pat[1:], name[1:])
}

// ---------- Grep ----------

func runConfinedGrep(w *workRoot, input json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
	var in struct {
		Pattern    string `json:"pattern"`
		Path       string `json:"path"`
		Glob       string `json:"glob"`
		Type       string `json:"type"`
		OutputMode string `json:"output_mode"`
		IgnoreCase bool   `json:"-i"`
		LineNums   *bool  `json:"-n"`
		After      int    `json:"-A"`
		Before     int    `json:"-B"`
		Context    int    `json:"-C"`
		Multiline  bool   `json:"multiline"`
		HeadLimit  *int   `json:"head_limit"`
		Offset     int    `json:"offset"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return actool.Result{}, err
	}
	before, after := in.Before, in.After
	if in.Context > 0 {
		before, after = in.Context, in.Context
	}
	flags := ""
	if in.IgnoreCase {
		flags += "i"
	}
	if in.Multiline {
		flags += "s"
	}
	pat := in.Pattern
	if flags != "" {
		pat = "(?" + flags + ")" + pat
	}
	re, err := regexp.Compile(pat)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error: invalid regex: %v", err)), nil
	}
	rel, err := w.rel(in.Path)
	if err != nil {
		return w.refuse(in.Path), nil
	}
	mode := in.OutputMode
	if mode == "" {
		mode = "files_with_matches"
	}
	showLines := true
	if in.LineNums != nil {
		showLines = *in.LineNums
	}
	typeGlobs := grepTypeGlobs(in.Type)
	var results []grepFileHit
	scan := func(p, shown string) {
		data, err := w.readFile(filepath.FromSlash(p))
		if err != nil || isBinaryData(data) {
			return
		}
		if h := grepScan(data, filepath.FromSlash(shown), re, mode, showLines, in.Multiline, before, after); h != nil {
			results = append(results, *h)
		}
	}
	base := filepath.ToSlash(rel)
	info, err := w.Stat(rel)
	if err != nil {
		return actool.Errorf(fmt.Sprintf("Error: %v", err)), nil
	}
	if info.IsDir() {
		_ = fs.WalkDir(w.FS(), base, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if confinedSkipDirs[d.Name()] {
					return fs.SkipDir
				}
				return nil
			}
			name := path.Base(p)
			if in.Glob != "" {
				if ok, _ := path.Match(in.Glob, name); !ok {
					return nil
				}
			}
			if len(typeGlobs) > 0 && !grepMatchAny(typeGlobs, name) {
				return nil
			}
			scan(p, relUnder(base, p))
			return nil
		})
	} else {
		scan(base, path.Base(base))
	}
	if len(results) == 0 {
		return actool.Text("No matches found"), nil
	}
	sort.Slice(results, func(i, j int) bool { return results[i].path < results[j].path })

	var lines []string
	switch mode {
	case "content":
		for _, r := range results {
			lines = append(lines, r.lines...)
		}
	case "count":
		for _, r := range results {
			lines = append(lines, fmt.Sprintf("%s: %d", r.path, r.count))
		}
	default: // files_with_matches
		for _, r := range results {
			lines = append(lines, r.path)
		}
	}
	headLimit := 250
	if in.HeadLimit != nil {
		headLimit = *in.HeadLimit
	}
	kept, more := grepPage(lines, headLimit, in.Offset)
	out := strings.Join(kept, "\n")
	if len(kept) > 0 {
		out += "\n"
	}
	if more > 0 {
		out += fmt.Sprintf("... [%d more result(s) — page with offset=%d, or head_limit=0 for all] ...\n", more, in.Offset+len(kept))
	}
	return actool.Text(w.capture(out)), nil
}

// grepFileTypes maps a ripgrep-style file type to its globs (the SDK's subset).
var grepFileTypes = map[string][]string{
	"go":       {"*.go"},
	"py":       {"*.py", "*.pyi"},
	"python":   {"*.py", "*.pyi"},
	"js":       {"*.js", "*.jsx", "*.mjs", "*.cjs", "*.vue"},
	"ts":       {"*.ts", "*.tsx", "*.mts", "*.cts"},
	"rust":     {"*.rs"},
	"java":     {"*.java"},
	"kotlin":   {"*.kt", "*.kts"},
	"c":        {"*.c", "*.h"},
	"cpp":      {"*.cpp", "*.cc", "*.cxx", "*.hpp", "*.hh", "*.hxx", "*.h"},
	"cs":       {"*.cs"},
	"rb":       {"*.rb"},
	"ruby":     {"*.rb"},
	"php":      {"*.php"},
	"swift":    {"*.swift"},
	"sh":       {"*.sh", "*.bash", "*.zsh"},
	"html":     {"*.html", "*.htm"},
	"css":      {"*.css", "*.scss", "*.sass", "*.less"},
	"json":     {"*.json"},
	"yaml":     {"*.yaml", "*.yml"},
	"toml":     {"*.toml"},
	"xml":      {"*.xml"},
	"md":       {"*.md", "*.markdown"},
	"markdown": {"*.md", "*.markdown"},
	"sql":      {"*.sql"},
	"proto":    {"*.proto"},
}

// grepTypeGlobs resolves a type name to its globs; an unknown type is treated as a
// bare extension (type:foo → *.foo). Empty type → nil.
func grepTypeGlobs(t string) []string {
	if t == "" {
		return nil
	}
	if g, ok := grepFileTypes[strings.ToLower(t)]; ok {
		return g
	}
	return []string{"*." + t}
}

func grepMatchAny(globs []string, name string) bool {
	for _, g := range globs {
		if ok, _ := path.Match(g, name); ok {
			return true
		}
	}
	return false
}

// grepPage skips the first offset entries then keeps at most limit (0 = unlimited).
func grepPage(lines []string, limit, offset int) (kept []string, more int) {
	if offset > 0 {
		if offset >= len(lines) {
			return nil, 0
		}
		lines = lines[offset:]
	}
	if limit > 0 && len(lines) > limit {
		return lines[:limit], len(lines) - limit
	}
	return lines, 0
}

type grepFileHit struct {
	path  string
	lines []string
	count int
}

// grepScan is the SDK Grep's per-file scan over data already read; shown is the
// path printed for the file.
func grepScan(data []byte, shown string, re *regexp.Regexp, mode string, showLines, multiline bool, before, after int) *grepFileHit {
	lines := strings.Split(string(data), "\n")
	if n := len(lines); n > 0 && lines[n-1] == "" {
		lines = lines[:n-1] // drop the empty element from a trailing newline
	}
	var matches []int
	if multiline {
		lineStart := make([]int, len(lines))
		off := 0
		for i, ln := range lines {
			lineStart[i] = off
			off += len(ln) + 1
		}
		hit := make([]bool, len(lines))
		for _, loc := range re.FindAllIndex(data, -1) {
			s, e := loc[0], loc[1]
			for i := range lines {
				ls, le := lineStart[i], lineStart[i]+len(lines[i])
				if s <= le && e > ls {
					hit[i] = true
				}
			}
		}
		for i, h := range hit {
			if h {
				matches = append(matches, i)
			}
		}
	} else {
		for i, ln := range lines {
			if re.MatchString(ln) {
				matches = append(matches, i)
			}
		}
	}
	if len(matches) == 0 {
		return nil
	}
	res := &grepFileHit{path: shown, count: len(matches)}
	if mode != "content" {
		return res
	}
	isMatch := make(map[int]bool, len(matches))
	for _, m := range matches {
		isMatch[m] = true
	}
	var order []int
	seen := map[int]bool{}
	for _, m := range matches {
		lo, hi := max(m-before, 0), min(m+after, len(lines)-1)
		for j := lo; j <= hi; j++ {
			if !seen[j] {
				seen[j] = true
				order = append(order, j)
			}
		}
	}
	sort.Ints(order)
	hasContext := before > 0 || after > 0
	prev := -2
	for _, j := range order {
		if hasContext && prev >= 0 && j != prev+1 {
			res.lines = append(res.lines, "--")
		}
		sep := "-"
		if isMatch[j] {
			sep = ":"
		}
		if showLines {
			res.lines = append(res.lines, fmt.Sprintf("%s%s%d%s%s", shown, sep, j+1, sep, lines[j]))
		} else {
			res.lines = append(res.lines, fmt.Sprintf("%s%s%s", shown, sep, lines[j]))
		}
		prev = j
	}
	return res
}
