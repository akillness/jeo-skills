// Go side of fast-anything's scan: reads the module with go/parser and describes every function.
// The CLI runs it as  go run describe.go <module root> <out.json>. Not meant to be run by hand.
package main

import (
	"bufio"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Param struct {
	Name       string `json:"name"`
	Annotation string `json:"annotation"`
}

type Fn struct {
	Symbol   string   `json:"symbol"`
	Package  string   `json:"package"`
	PkgName  string   `json:"pkg_name"`
	Path     string   `json:"path"`
	Name     string   `json:"name"`
	Line     int      `json:"line"`
	EndLine  int      `json:"end_line"`
	Params   []Param  `json:"params"`
	Returns  *string  `json:"returns"`
	Blockers []string `json:"blockers"`
	Warnings []string `json:"warnings"`
	Calls    []string `json:"calls"`
	Source   string   `json:"source"`
}

var ioPkgs = map[string]bool{"os": true, "io": true, "bufio": true, "net": true, "http": true, "ioutil": true, "exec": true, "syscall": true, "log": true, "slog": true, "sql": true}
var basic = map[string]bool{"int": true, "int8": true, "int16": true, "int32": true, "int64": true, "uint": true, "uint8": true, "uint16": true,
	"uint32": true, "uint64": true, "float32": true, "float64": true, "string": true, "bool": true, "byte": true, "rune": true}
var arrayRe = regexp.MustCompile(`^\[\d+\]`)

func supported(t string) bool {
	switch {
	case basic[t]:
		return true
	case strings.HasPrefix(t, "[]"):
		return supported(t[2:])
	case arrayRe.MatchString(t):
		return supported(arrayRe.ReplaceAllString(t, ""))
	case strings.HasPrefix(t, "map[string]"):
		return supported(t[len("map[string]"):])
	}
	return false
}

func modulePath(root string) string {
	f, err := os.Open(filepath.Join(root, "go.mod"))
	if err != nil {
		return ""
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		if l := strings.TrimSpace(s.Text()); strings.HasPrefix(l, "module ") {
			return strings.Trim(strings.TrimSpace(l[7:]), "\"")
		}
	}
	return ""
}

func first(xs []string, n int) string {
	if len(xs) > n {
		xs = xs[:n]
	}
	return strings.Join(xs, ", ")
}

func main() {
	root, out := os.Args[1], os.Args[2]
	mod := modulePath(root)
	fset := token.NewFileSet()
	fns := []Fn{}
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			n := d.Name()
			if p != root && (strings.HasPrefix(n, ".") || n == "vendor" || n == "testdata" || n == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") || strings.HasPrefix(d.Name(), "fast_anything") {
			return nil
		}
		src, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		f, err := parser.ParseFile(fset, p, src, parser.SkipObjectResolution)
		if err != nil {
			return nil
		}
		pkg := "main"
		if f.Name.Name != "main" {
			rel, _ := filepath.Rel(root, filepath.Dir(p))
			pkg = mod
			if rel != "." {
				pkg = mod + "/" + filepath.ToSlash(rel)
			}
		}
		funcs, vars := map[string]bool{}, map[string]bool{}
		for _, decl := range f.Decls {
			switch d := decl.(type) {
			case *ast.FuncDecl:
				if d.Recv == nil {
					funcs[d.Name.Name] = true
				}
			case *ast.GenDecl:
				if d.Tok == token.VAR {
					for _, s := range d.Specs {
						for _, n := range s.(*ast.ValueSpec).Names {
							vars[n.Name] = true
						}
					}
				}
			}
		}
		for _, decl := range f.Decls {
			fd, ok := decl.(*ast.FuncDecl)
			if !ok || fd.Body == nil {
				continue
			}
			fns = append(fns, describe(fset, src, p, pkg, f.Name.Name, fd, funcs, vars))
		}
		return nil
	})
	data, _ := json.Marshal(fns)
	os.WriteFile(out, data, 0o644)
}

func describe(fset *token.FileSet, src []byte, path, pkg, pkgName string, fd *ast.FuncDecl, funcs, vars map[string]bool) Fn {
	name := fd.Name.Name
	fn := Fn{Package: pkg, PkgName: pkgName, Path: path, Name: name, Blockers: []string{}, Warnings: []string{}, Calls: []string{}, Params: []Param{}}
	fn.Symbol = pkg + "." + name
	if fd.Recv != nil && len(fd.Recv.List) > 0 {
		recv := types.ExprString(fd.Recv.List[0].Type)
		if strings.HasPrefix(recv, "*") {
			fn.Symbol = pkg + ".(" + recv + ")." + name
		} else {
			fn.Symbol = pkg + "." + recv + "." + name
		}
		fn.Blockers = append(fn.Blockers, "method (plain functions only for now)")
	}
	if name == "main" || name == "init" {
		fn.Blockers = append(fn.Blockers, "the entry point")
	}
	if fd.Type.TypeParams != nil && len(fd.Type.TypeParams.List) > 0 {
		fn.Blockers = append(fn.Blockers, "generic function")
	}
	locals := map[string]bool{}
	for _, field := range fd.Type.Params.List {
		t := types.ExprString(field.Type)
		if strings.HasPrefix(t, "...") {
			fn.Blockers = append(fn.Blockers, "takes variadic arguments")
		} else if !supported(t) {
			fn.Blockers = append(fn.Blockers, "takes a "+t)
		}
		if len(field.Names) == 0 {
			fn.Blockers = append(fn.Blockers, "has unnamed parameters")
		}
		for _, n := range field.Names {
			fn.Params = append(fn.Params, Param{Name: n.Name, Annotation: t})
			locals[n.Name] = true
		}
	}
	results := fd.Type.Results
	switch {
	case results == nil || len(results.List) == 0:
		fn.Blockers = append(fn.Blockers, "returns nothing")
	case len(results.List) > 1 || len(results.List[0].Names) > 1:
		fn.Blockers = append(fn.Blockers, "returns more than one value")
	default:
		t := types.ExprString(results.List[0].Type)
		fn.Returns = &t
		if !supported(t) {
			fn.Blockers = append(fn.Blockers, "returns a "+t)
		}
		if len(results.List[0].Names) > 0 {
			fn.Blockers = append(fn.Blockers, "has named results")
		}
	}
	io, nondet, helpers := []string{}, []string{}, []string{}
	seen := map[string]bool{}
	add := func(list *[]string, s string) {
		if !seen[s] {
			seen[s] = true
			*list = append(*list, s)
		}
	}
	writesGlobal, goroutines, channels := false, false, false
	ast.Inspect(fd.Body, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.GoStmt:
			goroutines = true
		case *ast.SendStmt, *ast.SelectStmt:
			channels = true
		case *ast.UnaryExpr:
			if x.Op == token.ARROW {
				channels = true
			}
		case *ast.AssignStmt:
			for _, l := range x.Lhs {
				if id, ok := l.(*ast.Ident); ok {
					if x.Tok == token.DEFINE {
						locals[id.Name] = true
					} else if vars[id.Name] && !locals[id.Name] {
						writesGlobal = true
					}
				}
			}
		case *ast.ValueSpec:
			for _, id := range x.Names {
				locals[id.Name] = true
			}
		case *ast.IncDecStmt:
			if id, ok := x.X.(*ast.Ident); ok && vars[id.Name] && !locals[id.Name] {
				writesGlobal = true
			}
		case *ast.CallExpr:
			switch f := x.Fun.(type) {
			case *ast.SelectorExpr:
				if pk, ok := f.X.(*ast.Ident); ok {
					call := pk.Name + "." + f.Sel.Name
					s := f.Sel.Name
					if ioPkgs[pk.Name] || (pk.Name == "fmt" && (strings.HasPrefix(s, "Print") || strings.HasPrefix(s, "Fprint") || strings.Contains(s, "Scan"))) {
						add(&io, call)
					}
					if pk.Name == "rand" || (pk.Name == "time" && (s == "Now" || s == "Since" || s == "Until" || s == "Sleep")) {
						add(&nondet, call)
					}
				}
			case *ast.Ident:
				if f.Name == "println" || f.Name == "print" || f.Name == "panic" && false {
					add(&io, f.Name)
				}
				if funcs[f.Name] && f.Name != name {
					add(&helpers, f.Name)
				}
			}
		}
		return true
	})
	if len(io) > 0 {
		fn.Blockers = append(fn.Blockers, "does I/O: "+first(io, 3))
	}
	if len(nondet) > 0 {
		fn.Blockers = append(fn.Blockers, "not deterministic: "+first(nondet, 3))
	}
	if goroutines {
		fn.Blockers = append(fn.Blockers, "starts goroutines")
	}
	if channels {
		fn.Blockers = append(fn.Blockers, "uses channels")
	}
	if writesGlobal {
		fn.Blockers = append(fn.Blockers, "writes package-level variables")
	}
	if len(helpers) > 0 {
		fn.Calls = helpers
		fn.Warnings = append(fn.Warnings, "calls "+first(helpers, 3)+", they get ported together with it")
	}
	lbrace := fset.Position(fd.Body.Lbrace)
	rest := string(src[lbrace.Offset+1:])
	if i := strings.IndexByte(rest, '\n'); i >= 0 {
		rest = rest[:i]
	}
	if r := strings.TrimSpace(rest); r != "" && !strings.HasPrefix(r, "//") {
		fn.Blockers = append(fn.Blockers, "its { doesn't end a line (gofmt it)")
	}
	start, end := fset.Position(fd.Pos()), fset.Position(fd.End())
	fn.Line, fn.EndLine = start.Line, end.Line
	fn.Source = strings.ReplaceAll(string(src[start.Offset:end.Offset]), "\r", "")
	return fn
}
