// Package hookvm implements a small, deterministic, resource-bounded Go-subset
// evaluator built on Go's standard library go/parser and go/ast packages.
// Zero external dependencies; no filesystem, network, subprocess, environment,
// wall-clock, randomness, goroutine, channel, pointer, or global-state access.
package hookvm

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
)

const (
	MaxSourceBytes       = 64 * 1024
	DefaultMaxSteps      = 100_000
	DefaultMaxMemory     = 4 * 1024 * 1024
	DefaultMaxRegexBytes = 1024
	MaxCallDepth         = 32
)

var (
	ErrStepLimit         = errors.New("hook exceeded step limit")
	ErrTimeout           = errors.New("hook timed out")
	ErrMemoryLimit       = errors.New("hook exceeded memory limit")
	ErrForbiddenMutation = errors.New("hook attempted forbidden mutation")
	ErrCallDepth         = errors.New("hook exceeded call depth limit")
)

// AllowedImports is the closed set of pure, deterministic virtual packages.
var AllowedImports = map[string]bool{
	"strings": true, "bytes": true, "encoding/json": true, "encoding/base64": true,
	"encoding/hex": true, "net/url": true, "regexp": true, "crypto/sha256": true,
	"crypto/hmac": true, "strconv": true, "errors": true,
}

var allowedBuiltins = map[string]bool{
	"len": true, "cap": true, "append": true, "make": true, "delete": true,
	"string": true, "int": true, "int64": true, "float64": true, "byte": true, "panic": true,
}

// Program is a validated AST ready for concurrent read-only execution.
type Program struct {
	phase   string
	imports map[string]string
	funcs   map[string]*ast.FuncDecl
	consts  map[string]any
	entry   *ast.FuncDecl
}

// Compile parses and statically validates a Go-subset tampering hook for phase
// ("request" or "response").
func Compile(phase, source string) (*Program, error) {
	if phase != "request" && phase != "response" {
		return nil, fmt.Errorf("invalid hook phase %q", phase)
	}
	if len(source) == 0 || len(source) > MaxSourceBytes {
		return nil, fmt.Errorf("hook source length must be 1..%d bytes", MaxSourceBytes)
	}
	file, err := parser.ParseFile(token.NewFileSet(), "hook.go", source, 0)
	if err != nil {
		return nil, fmt.Errorf("parse hook: %w", err)
	}
	if file.Name == nil || file.Name.Name != "hook" {
		return nil, errors.New("hook must declare 'package hook'")
	}

	prog := &Program{
		phase: phase, imports: map[string]string{},
		funcs: map[string]*ast.FuncDecl{}, consts: map[string]any{},
	}
	for _, imp := range file.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if !AllowedImports[path] {
			return nil, fmt.Errorf("forbidden import %q", path)
		}
		alias := path[strings.LastIndexByte(path, '/')+1:]
		if imp.Name != nil {
			if imp.Name.Name == "." || imp.Name.Name == "_" {
				return nil, fmt.Errorf("dot/blank import %q is not allowed", path)
			}
			alias = imp.Name.Name
		}
		prog.imports[alias] = path
	}

	for _, decl := range file.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			switch d.Tok {
			case token.IMPORT:
			case token.CONST:
				if err := collectConsts(d, prog.consts); err != nil {
					return nil, err
				}
			case token.VAR:
				return nil, errors.New("package-level variables are forbidden (hooks must be stateless)")
			case token.TYPE:
				return nil, errors.New("custom package-level types are not supported in hooks")
			default:
				return nil, fmt.Errorf("unsupported declaration %s", d.Tok)
			}
		case *ast.FuncDecl:
			if d.Recv != nil {
				return nil, errors.New("custom receiver methods are not supported in hooks")
			}
			name := d.Name.Name
			if name == "init" {
				return nil, errors.New("init() is forbidden in hooks")
			}
			if _, dup := prog.funcs[name]; dup || d.Body == nil {
				return nil, fmt.Errorf("invalid or duplicate function %q", name)
			}
			if err := validateBlock(d.Body); err != nil {
				return nil, fmt.Errorf("function %s: %w", name, err)
			}
			prog.funcs[name] = d
		default:
			return nil, fmt.Errorf("unsupported top-level declaration %T", decl)
		}
	}

	entryName, wantParams := "OnRequest", 1
	if phase == "response" {
		entryName, wantParams = "OnResponse", 2
	}
	entry := prog.funcs[entryName]
	if entry == nil {
		return nil, fmt.Errorf("phase %q requires function %s", phase, entryName)
	}
	if countFields(entry.Type.Params) != wantParams || countFields(entry.Type.Results) != 1 {
		return nil, fmt.Errorf("%s must accept %d parameter(s) and return error", entryName, wantParams)
	}
	prog.entry = entry
	return prog, nil
}

func countFields(fl *ast.FieldList) int {
	if fl == nil {
		return 0
	}
	n := 0
	for _, f := range fl.List {
		n += max(1, len(f.Names))
	}
	return n
}

func collectConsts(d *ast.GenDecl, out map[string]any) error {
	for _, spec := range d.Specs {
		vs, ok := spec.(*ast.ValueSpec)
		if !ok || len(vs.Names) != len(vs.Values) {
			return errors.New("const declarations must have explicit values")
		}
		for i, name := range vs.Names {
			v, err := evalConstExpr(vs.Values[i])
			if err != nil {
				return fmt.Errorf("const %s: %w", name.Name, err)
			}
			out[name.Name] = v
		}
	}
	return nil
}

func evalConstExpr(e ast.Expr) (any, error) {
	switch x := e.(type) {
	case *ast.BasicLit:
		return parseBasicLit(x)
	case *ast.Ident:
		if x.Name == "true" || x.Name == "false" {
			return x.Name == "true", nil
		}
	case *ast.UnaryExpr:
		if x.Op == token.SUB {
			if v, err := evalConstExpr(x.X); err == nil {
				if n, ok := v.(int64); ok {
					return -n, nil
				}
				if f, ok := v.(float64); ok {
					return -f, nil
				}
			}
		}
	}
	return nil, fmt.Errorf("unsupported const expression %T", e)
}

func validateBlock(body *ast.BlockStmt) error {
	var firstErr error
	ast.Inspect(body, func(n ast.Node) bool {
		if firstErr != nil || n == nil {
			return false
		}
		switch x := n.(type) {
		case *ast.GoStmt:
			firstErr = errors.New("goroutines ('go') are forbidden in hooks")
		case *ast.SendStmt, *ast.ChanType, *ast.SelectStmt:
			firstErr = errors.New("channels and select are forbidden in hooks")
		case *ast.DeferStmt:
			firstErr = errors.New("defer is forbidden in hooks")
		case *ast.SwitchStmt, *ast.TypeSwitchStmt:
			firstErr = errors.New("switch is not supported in hooks; use if / else if")
		case *ast.FuncLit:
			firstErr = errors.New("anonymous function literals are not supported in hooks")
		case *ast.UnaryExpr:
			if x.Op == token.AND {
				firstErr = errors.New("address-of (&) is not supported in hooks")
			}
		case *ast.BranchStmt:
			if x.Tok == token.GOTO {
				firstErr = errors.New("goto is forbidden in hooks")
			}
		case *ast.CallExpr:
			if id, ok := x.Fun.(*ast.Ident); ok {
				switch id.Name {
				case "recover", "print", "println", "close", "complex", "real", "imag", "new":
					firstErr = fmt.Errorf("builtin %q is forbidden in hooks", id.Name)
				}
			}
		}
		return firstErr == nil
	})
	return firstErr
}
