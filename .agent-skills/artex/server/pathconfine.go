package server

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Autumn-27/norma/skill"
)

var errPathEscape = errors.New("invalid path")

// confinedPath holds the canonicalized result of resolving a user-supplied
// relative path inside a root directory.
type confinedPath struct {
	realRoot  string // canonical root directory after symlink evaluation
	realPath  string // resolved target path (deepest existing ancestor resolved + non-existent remainder)
	entryPath string // resolved parent + final segment (differs from realPath when final segment is a symlink)
	exists    bool   // whether the target itself exists on disk (and, if a symlink, its target exists)
}

// isWithinRoot reports whether target is equal to or strictly beneath realRoot.
// Both paths must be cleaned and canonicalized in the same coordinate space.
func isWithinRoot(realRoot, target string) bool {
	realRoot = filepath.Clean(realRoot)
	target = filepath.Clean(target)
	if target == realRoot {
		return true
	}
	rel, err := filepath.Rel(realRoot, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return false
	}
	return true
}

// resolveRealRoot returns the cleaned, symlink-evaluated absolute path of root.
func resolveRealRoot(root string) (string, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	realRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return "", err
	}
	return filepath.Clean(realRoot), nil
}

// splitRelSegments validates and splits a relative path into individual safe
// path segments. It rejects NUL bytes, volume prefixes, ".." segments, and
// (unless trimLeadingSlash is true) leading separators.
func splitRelSegments(rel string, trimLeadingSlash bool) ([]string, error) {
	if strings.ContainsRune(rel, 0) {
		return nil, errPathEscape
	}
	rel = strings.TrimSpace(rel)
	// Reject Windows drive-letter prefixes (e.g. "C:foo" or "C:/foo").
	if filepath.VolumeName(rel) != "" {
		return nil, errPathEscape
	}
	// Normalize backslashes so "..\foo" is caught uniformly across platforms.
	slashed := strings.ReplaceAll(rel, "\\", "/")
	if trimLeadingSlash {
		slashed = strings.TrimLeft(slashed, "/")
	} else if strings.HasPrefix(slashed, "/") {
		return nil, errPathEscape
	}
	if slashed == "" || slashed == "." {
		return nil, nil
	}
	rawSegs := strings.Split(slashed, "/")
	segs := make([]string, 0, len(rawSegs))
	for _, seg := range rawSegs {
		if seg == "" || seg == "." {
			continue
		}
		if seg == ".." {
			return nil, errPathEscape
		}
		segs = append(segs, seg)
	}
	return segs, nil
}

func isNotDirErr(err error) bool {
	return errors.Is(err, syscall.ENOTDIR)
}

// resolveWithinRoot resolves rel beneath root, walking each path component so
// that symlinks in any component are evaluated and verified to stay within root.
//
// For paths that do not exist yet (write, upload, mkdir), the deepest existing
// ancestor is resolved via Lstat + EvalSymlinks, then the remaining non-existent
// components are re-joined and checked against realRoot.
//
// Broken symlinks, symlink loops, ".." segments, and any symlink whose target
// escapes root return errPathEscape. Symlinks whose resolved target stays inside
// root are permitted.
func resolveWithinRoot(root, rel string, trimLeadingSlash bool) (confinedPath, error) {
	realRoot, err := resolveRealRoot(root)
	if err != nil {
		return confinedPath{}, err
	}
	segs, err := splitRelSegments(rel, trimLeadingSlash)
	if err != nil {
		return confinedPath{}, err
	}
	if len(segs) == 0 {
		return confinedPath{
			realRoot:  realRoot,
			realPath:  realRoot,
			entryPath: realRoot,
			exists:    true,
		}, nil
	}

	cur := realRoot
	for i, seg := range segs {
		candidate := filepath.Join(cur, seg)
		fi, err := os.Lstat(candidate)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) || isNotDirErr(err) {
				// cur is the deepest existing ancestor (already verified within realRoot).
				// Re-join the remaining non-existent segments and verify confinement.
				rem := make([]string, 0, 1+len(segs)-i)
				rem = append(rem, cur)
				rem = append(rem, segs[i:]...)
				full := filepath.Clean(filepath.Join(rem...))
				if !isWithinRoot(realRoot, full) {
					return confinedPath{}, errPathEscape
				}
				return confinedPath{
					realRoot:  realRoot,
					realPath:  full,
					entryPath: full,
					exists:    false,
				}, nil
			}
			return confinedPath{}, errPathEscape
		}

		if fi.Mode()&os.ModeSymlink != 0 {
			target, evalErr := filepath.EvalSymlinks(candidate)
			if evalErr != nil {
				// Broken symlink, symlink loop, or unreadable symlink target.
				return confinedPath{}, errPathEscape
			}
			target = filepath.Clean(target)
			if !isWithinRoot(realRoot, target) {
				return confinedPath{}, errPathEscape
			}
			if i == len(segs)-1 {
				return confinedPath{
					realRoot:  realRoot,
					realPath:  target,
					entryPath: candidate,
					exists:    true,
				}, nil
			}
			cur = target
			continue
		}

		cur = candidate
	}

	if !isWithinRoot(realRoot, cur) {
		return confinedPath{}, errPathEscape
	}
	return confinedPath{
		realRoot:  realRoot,
		realPath:  cur,
		entryPath: cur,
		exists:    true,
	}, nil
}

// resolveSkillDir resolves <skillDir>/<name> and ensures it does not escape skillDir.
// If skillDir itself does not exist yet, it returns (confinedPath{exists: false}, nil)
// so read/delete handlers can return 404 rather than 400.
func resolveSkillDir(skillDir, name string) (confinedPath, error) {
	cp, err := resolveWithinRoot(skillDir, name, false)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return confinedPath{exists: false}, nil
		}
		return confinedPath{}, errPathEscape
	}
	return cp, nil
}

// resolveSkillFile resolves <skillDir>/<name>/<relFile>, confining both the
// skill directory under skillDir and the file under that skill's directory.
func resolveSkillFile(skillDir, name, relFile string) (skillExists bool, cp confinedPath, err error) {
	dirCP, err := resolveSkillDir(skillDir, name)
	if err != nil {
		return false, confinedPath{}, err
	}
	if !dirCP.exists {
		return false, confinedPath{}, nil
	}
	fi, statErr := os.Stat(dirCP.realPath)
	if statErr != nil || !fi.IsDir() {
		return false, confinedPath{}, nil
	}
	fileCP, err := resolveWithinRoot(dirCP.realPath, relFile, false)
	if err != nil {
		return true, confinedPath{}, errPathEscape
	}
	return true, fileCP, nil
}

// loadSkillsConfined loads skills from dir using skill.LoadDir while refusing
// to follow symlinks whose real target leaves dir (or leaves its skill
// subdirectory for <dir>/<name>/SKILL.md).
func loadSkillsConfined(dir string) (*skill.Registry, error) {
	realRoot, err := resolveRealRoot(dir)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(realRoot)
	if err != nil {
		return nil, err
	}

	type safeEntry struct {
		isDir      bool
		entryName  string
		sourcePath string
	}

	hasUnsafe := false
	var safe []safeEntry

	for _, e := range entries {
		name := e.Name()
		switch {
		case e.IsDir():
			// os.ReadDir reports e.IsDir() == false for symlinks, so <realRoot>/<name>
			// is a real directory under realRoot. Verify its SKILL.md stays inside it.
			skillRoot := filepath.Join(realRoot, name)
			cp, rerr := resolveWithinRoot(skillRoot, "SKILL.md", false)
			if rerr != nil {
				hasUnsafe = true
				continue
			}
			if !cp.exists {
				continue
			}
			if fi, serr := os.Stat(cp.realPath); serr != nil || fi.IsDir() {
				continue
			}
			safe = append(safe, safeEntry{
				isDir:      true,
				entryName:  name,
				sourcePath: cp.realPath,
			})
		case strings.HasSuffix(name, ".md"):
			cp, rerr := resolveWithinRoot(realRoot, name, false)
			if rerr != nil {
				hasUnsafe = true
				continue
			}
			if !cp.exists {
				continue
			}
			if fi, serr := os.Stat(cp.realPath); serr != nil || fi.IsDir() {
				continue
			}
			safe = append(safe, safeEntry{
				isDir:      false,
				entryName:  name,
				sourcePath: cp.realPath,
			})
		}
	}

	// Fast path: every skill file candidate in dir is safely confined.
	if !hasUnsafe {
		return skill.LoadDir(dir)
	}

	// Safe fallback: stage only verified files into a temporary directory so
	// skill.LoadDir never opens or reads escaping/broken/looping symlinks, then
	// restore each Skill.Dir to match dir.
	if len(safe) == 0 {
		return skill.NewRegistry(), nil
	}
	tmp, err := os.MkdirTemp("", "artex-skills-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)

	for _, item := range safe {
		data, rerr := os.ReadFile(item.sourcePath)
		if rerr != nil {
			continue
		}
		if item.isDir {
			sub := filepath.Join(tmp, item.entryName)
			if err := os.MkdirAll(sub, 0o755); err != nil {
				continue
			}
			_ = os.WriteFile(filepath.Join(sub, "SKILL.md"), data, 0o600)
		} else {
			_ = os.WriteFile(filepath.Join(tmp, item.entryName), data, 0o600)
		}
	}

	loaded, err := skill.LoadDir(tmp)
	if err != nil {
		return nil, err
	}
	out := skill.NewRegistry()
	for _, sk := range loaded.List() {
		if sk.Dir == tmp {
			sk.Dir = dir
		} else if rel, relErr := filepath.Rel(tmp, sk.Dir); relErr == nil && rel != "." {
			sk.Dir = filepath.Join(dir, rel)
		}
		out.Add(sk)
	}
	return out, nil
}

// safeFSErr formats a filesystem error without leaking absolute paths.
func safeFSErr(err error) string {
	if err == nil {
		return ""
	}
	var pe *os.PathError
	if errors.As(err, &pe) && pe.Err != nil {
		if pe.Op != "" {
			return pe.Op + ": " + pe.Err.Error()
		}
		return pe.Err.Error()
	}
	var le *os.LinkError
	if errors.As(err, &le) && le.Err != nil {
		if le.Op != "" {
			return le.Op + ": " + le.Err.Error()
		}
		return le.Err.Error()
	}
	var se *os.SyscallError
	if errors.As(err, &se) && se.Err != nil {
		return se.Err.Error()
	}
	return "filesystem error"
}
