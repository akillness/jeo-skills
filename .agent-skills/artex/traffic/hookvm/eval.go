package hookvm

import (
	"cmp"
	"context"
	"fmt"
	"go/ast"
	"go/token"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// PanicError wraps a runtime panic raised by hook code.
type PanicError struct{ Value any }

func (e *PanicError) Error() string { return fmt.Sprintf("hook panic: %v", e.Value) }

// Request is the host request view handed to OnRequest (mutable except
// Scheme/Host/Port) and OnResponse (fully read-only).
type Request struct {
	Scheme, Host, Port     string
	Method, Path, RawQuery string
	Headers                map[string][]string
	Body                   []byte
	readOnly               bool
}

// Response is the host response view handed to OnResponse.
type Response struct {
	Status  int
	Headers map[string][]string
	Body    []byte
}

// RunOptions overrides per-invocation CPU step and memory budgets.
type RunOptions struct {
	MaxSteps  int
	MaxMemory int64
}

type vmErr struct{ err error }
type multiVal []any
type flowSignal int

const (
	flowNone flowSignal = iota
	flowReturn
	flowBreak
	flowContinue
)

type env struct {
	parent *env
	vars   map[string]any
}

func newEnv(p *env) *env { return &env{parent: p, vars: map[string]any{}} }
func (sc *env) define(name string, v any) {
	if name != "_" {
		sc.vars[name] = v
	}
}
func (sc *env) get(name string) (any, bool) {
	for c := sc; c != nil; c = c.parent {
		if v, ok := c.vars[name]; ok {
			return v, true
		}
	}
	return nil, false
}
func (sc *env) assign(name string, v any) bool {
	if name == "_" {
		return true
	}
	for c := sc; c != nil; c = c.parent {
		if _, ok := c.vars[name]; ok {
			c.vars[name] = v
			return true
		}
	}
	return false
}

type vm struct {
	ctx      context.Context
	prog     *Program
	steps    int
	maxSteps int
	memUsed  int64
	memLimit int64
	depth    int
}

func (e *vm) fail(err error)           { panic(vmErr{err: err}) }
func (e *vm) failf(f string, a ...any) { panic(vmErr{err: fmt.Errorf(f, a...)}) }

func (e *vm) step() {
	e.steps++
	if e.steps > e.maxSteps {
		e.fail(ErrStepLimit)
	}
	if e.steps&63 == 0 && e.ctx.Err() != nil {
		e.fail(ErrTimeout)
	}
}

func (e *vm) alloc(n int64) {
	if n > 0 && (n > e.memLimit || e.memUsed+n > e.memLimit) {
		e.fail(ErrMemoryLimit)
	}
	if n > 0 {
		e.memUsed += n
	}
}

func (p *Program) run(ctx context.Context, opts RunOptions, args []any) (retErr error) {
	if ctx == nil {
		ctx = context.Background()
	}
	maxSteps, memLimit := opts.MaxSteps, opts.MaxMemory
	if maxSteps <= 0 {
		maxSteps = DefaultMaxSteps
	}
	if memLimit <= 0 {
		memLimit = DefaultMaxMemory
	}
	defer func() {
		if r := recover(); r != nil {
			if ve, ok := r.(vmErr); ok {
				retErr = ve.err
				return
			}
			retErr = &PanicError{Value: r}
		}
	}()
	v := (&vm{ctx: ctx, prog: p, maxSteps: maxSteps, memLimit: memLimit}).callFunc(p.entry, args)
	if v == nil {
		return nil
	}
	if err, ok := v.(error); ok {
		return err
	}
	return fmt.Errorf("hook returned non-error value %T", v)
}

// RunRequest executes OnRequest(req) under ctx and opts.
func (p *Program) RunRequest(ctx context.Context, req *Request, opts RunOptions) error {
	if p.phase != "request" {
		return fmt.Errorf("cannot run %q hook as request hook", p.phase)
	}
	if req.Headers == nil {
		req.Headers = map[string][]string{}
	}
	req.readOnly = false
	return p.run(ctx, opts, []any{req})
}

// RunResponse executes OnResponse(req, resp) under ctx and opts.
func (p *Program) RunResponse(ctx context.Context, req *Request, resp *Response, opts RunOptions) error {
	if p.phase != "response" {
		return fmt.Errorf("cannot run %q hook as response hook", p.phase)
	}
	if req.Headers == nil {
		req.Headers = map[string][]string{}
	}
	if resp.Headers == nil {
		resp.Headers = map[string][]string{}
	}
	req.readOnly = true
	return p.run(ctx, opts, []any{req, resp})
}

func (e *vm) callFunc(fn *ast.FuncDecl, args []any) any {
	e.depth++
	if e.depth > MaxCallDepth {
		e.fail(ErrCallDepth)
	}
	defer func() { e.depth-- }()
	sc := newEnv(nil)
	for k, v := range e.prog.consts {
		sc.define(k, v)
	}
	idx := 0
	if fn.Type.Params != nil {
		for _, field := range fn.Type.Params.List {
			if len(field.Names) == 0 {
				idx++
				continue
			}
			for _, name := range field.Names {
				if idx < len(args) {
					sc.define(name.Name, args[idx])
				}
				idx++
			}
		}
	}
	if sig, ret := e.execBlock(fn.Body, sc); sig == flowReturn {
		return ret
	}
	return nil
}

func (e *vm) execBlock(b *ast.BlockStmt, sc *env) (flowSignal, any) {
	child := newEnv(sc)
	for _, st := range b.List {
		if sig, val := e.execStmt(st, child); sig != flowNone {
			return sig, val
		}
	}
	return flowNone, nil
}

func (e *vm) execStmt(stmt ast.Stmt, sc *env) (flowSignal, any) {
	e.step()
	switch s := stmt.(type) {
	case *ast.EmptyStmt:
		return flowNone, nil
	case *ast.BlockStmt:
		return e.execBlock(s, sc)
	case *ast.ExprStmt:
		e.eval(s.X, sc)
		return flowNone, nil
	case *ast.DeclStmt:
		gd, ok := s.Decl.(*ast.GenDecl)
		if !ok || gd.Tok != token.VAR {
			e.failf("unsupported local decl %T", s.Decl)
		}
		for _, sp := range gd.Specs {
			vs := sp.(*ast.ValueSpec)
			for i, name := range vs.Names {
				val := zeroValue(vs.Type)
				if i < len(vs.Values) {
					val = e.eval(vs.Values[i], sc)
				}
				sc.define(name.Name, val)
			}
		}
		return flowNone, nil
	case *ast.AssignStmt:
		e.execAssign(s, sc)
		return flowNone, nil
	case *ast.IncDecStmt:
		n := e.int(e.eval(s.X, sc))
		if s.Tok == token.INC {
			n++
		} else {
			n--
		}
		e.assignTarget(s.X, n, sc)
		return flowNone, nil
	case *ast.ReturnStmt:
		if len(s.Results) == 0 {
			return flowReturn, nil
		}
		if len(s.Results) == 1 {
			return flowReturn, e.eval(s.Results[0], sc)
		}
		mv := make(multiVal, len(s.Results))
		for i, r := range s.Results {
			mv[i] = e.eval(r, sc)
		}
		return flowReturn, mv
	case *ast.IfStmt:
		ifSc := newEnv(sc)
		if s.Init != nil {
			e.execStmt(s.Init, ifSc)
		}
		if e.bool(e.eval(s.Cond, ifSc)) {
			return e.execBlock(s.Body, ifSc)
		}
		if s.Else != nil {
			return e.execStmt(s.Else, ifSc)
		}
		return flowNone, nil
	case *ast.ForStmt:
		loopSc := newEnv(sc)
		if s.Init != nil {
			e.execStmt(s.Init, loopSc)
		}
		for {
			e.step()
			if s.Cond != nil && !e.bool(e.eval(s.Cond, loopSc)) {
				break
			}
			sig, val := e.execBlock(s.Body, loopSc)
			if sig == flowReturn {
				return flowReturn, val
			}
			if sig == flowBreak {
				break
			}
			if s.Post != nil {
				e.execStmt(s.Post, loopSc)
			}
		}
		return flowNone, nil
	case *ast.RangeStmt:
		return e.execRange(s, sc)
	case *ast.BranchStmt:
		if s.Tok == token.BREAK {
			return flowBreak, nil
		}
		if s.Tok == token.CONTINUE {
			return flowContinue, nil
		}
	}
	e.failf("unsupported statement %T", stmt)
	return flowNone, nil
}

type kvPair struct{ k, v any }

func sortedMapPairs[V any](m map[string]V) []kvPair {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]kvPair, len(keys))
	for i, k := range keys {
		out[i] = kvPair{k, m[k]}
	}
	return out
}

func (e *vm) execRange(s *ast.RangeStmt, sc *env) (flowSignal, any) {
	var items []kvPair
	switch x := e.eval(s.X, sc).(type) {
	case []byte:
		e.alloc(int64(len(x)) * 32)
		for i, v := range x {
			items = append(items, kvPair{int64(i), int64(v)})
		}
	case []any:
		e.alloc(int64(len(x)) * 32)
		for i, v := range x {
			items = append(items, kvPair{int64(i), v})
		}
	case []string:
		e.alloc(int64(len(x)) * 32)
		for i, v := range x {
			items = append(items, kvPair{int64(i), v})
		}
	case string:
		e.alloc(int64(len(x)) * 32)
		for i, r := range x {
			items = append(items, kvPair{int64(i), int64(r)})
		}
	case map[string]any:
		e.alloc(int64(len(x)) * 32)
		items = sortedMapPairs(x)
	case map[string][]string:
		e.alloc(int64(len(x)) * 32)
		items = sortedMapPairs(x)
	case nil:
		return flowNone, nil
	default:
		e.failf("cannot range over %T", x)
	}
	bind := func(lhs ast.Expr, v any, iterSc *env) {
		if lhs == nil {
			return
		}
		id, ok := lhs.(*ast.Ident)
		if !ok {
			e.failf("range target must be identifier")
		}
		if s.Tok == token.DEFINE {
			iterSc.define(id.Name, v)
		} else if !iterSc.assign(id.Name, v) {
			e.failf("undefined variable %q", id.Name)
		}
	}
	for _, it := range items {
		e.step()
		iterSc := newEnv(sc)
		bind(s.Key, it.k, iterSc)
		bind(s.Value, it.v, iterSc)
		if sig, val := e.execBlock(s.Body, iterSc); sig == flowReturn {
			return flowReturn, val
		} else if sig == flowBreak {
			break
		}
	}
	return flowNone, nil
}

func (e *vm) execAssign(s *ast.AssignStmt, sc *env) {
	var vals []any
	if len(s.Rhs) == 1 && len(s.Lhs) == 2 {
		switch rhs := s.Rhs[0].(type) {
		case *ast.IndexExpr:
			v, ok := e.evalIndex(rhs, sc)
			vals = []any{v, ok}
		case *ast.TypeAssertExpr:
			v, ok := e.evalTypeAssert(rhs, sc)
			vals = []any{v, ok}
		default:
			v := e.eval(s.Rhs[0], sc)
			if mv, ok := v.(multiVal); ok {
				vals = []any(mv)
			} else {
				vals = []any{v}
			}
		}
	} else {
		for _, r := range s.Rhs {
			v := e.eval(r, sc)
			if mv, ok := v.(multiVal); ok && len(s.Rhs) == 1 {
				vals = append(vals, []any(mv)...)
			} else {
				vals = append(vals, v)
			}
		}
	}
	if len(vals) != len(s.Lhs) {
		e.failf("assignment count mismatch: %d lhs vs %d rhs", len(s.Lhs), len(vals))
	}
	for i, lhs := range s.Lhs {
		v := vals[i]
		switch s.Tok {
		case token.DEFINE:
			id, ok := lhs.(*ast.Ident)
			if !ok {
				e.failf("short declaration target must be identifier")
			}
			sc.define(id.Name, v)
		case token.ASSIGN:
			e.assignTarget(lhs, v, sc)
		case token.ADD_ASSIGN, token.SUB_ASSIGN:
			op := token.ADD
			if s.Tok == token.SUB_ASSIGN {
				op = token.SUB
			}
			e.assignTarget(lhs, e.evalBinary(op, e.eval(lhs, sc), v), sc)
		default:
			e.failf("unsupported assign op %s", s.Tok)
		}
	}
}

func (e *vm) assignTarget(lhs ast.Expr, v any, sc *env) {
	switch t := lhs.(type) {
	case *ast.Ident:
		if !sc.assign(t.Name, v) {
			e.failf("undefined variable %q", t.Name)
		}
	case *ast.SelectorExpr:
		e.setField(e.eval(t.X, sc), t.Sel.Name, v)
	case *ast.IndexExpr:
		e.setIndex(e.eval(t.X, sc), e.eval(t.Index, sc), v)
	default:
		e.failf("unsupported assignment target %T", lhs)
	}
}

func (e *vm) setField(obj any, field string, v any) {
	switch o := obj.(type) {
	case *Request:
		if o.readOnly {
			e.failf("%w: request is read-only in response phase", ErrForbiddenMutation)
		}
		switch field {
		case "Scheme", "Host", "Port":
			e.failf("%w: cannot modify Request.%s", ErrForbiddenMutation, field)
		case "Method":
			o.Method = e.str(v)
		case "Path":
			o.Path = e.str(v)
		case "RawQuery":
			o.RawQuery = e.str(v)
		case "Body":
			o.Body = e.bytes(v)
		case "Headers":
			m, ok := v.(map[string][]string)
			if !ok {
				e.failf("Request.Headers must be map[string][]string")
			}
			o.Headers = m
		default:
			e.failf("unknown Request field %q", field)
		}
	case *Response:
		switch field {
		case "Status":
			o.Status = int(e.int(v))
		case "Body":
			o.Body = e.bytes(v)
		case "Headers":
			m, ok := v.(map[string][]string)
			if !ok {
				e.failf("Response.Headers must be map[string][]string")
			}
			o.Headers = m
		default:
			e.failf("unknown Response field %q", field)
		}
	default:
		e.failf("cannot set field %q on %T", field, obj)
	}
}

func (e *vm) setIndex(col, key, val any) {
	switch c := col.(type) {
	case map[string]any:
		k := e.str(key)
		e.alloc(int64(len(k)) + 32)
		c[k] = val
	case map[string][]string:
		k, vs := e.str(key), e.strSlice(val)
		e.alloc(int64(len(k)) + int64(len(vs))*16)
		c[k] = vs
	case []byte:
		c[checkIdx(e.int(key), len(c))] = byte(e.int(val))
	case []any:
		c[checkIdx(e.int(key), len(c))] = val
	default:
		e.failf("cannot index-assign %T", col)
	}
}

func checkIdx(i int64, n int) int {
	if i < 0 || int(i) >= n {
		panic("index out of range")
	}
	return int(i)
}

func (e *vm) eval(expr ast.Expr, sc *env) any {
	e.step()
	switch x := expr.(type) {
	case *ast.BasicLit:
		v, err := parseBasicLit(x)
		if err != nil {
			e.fail(err)
		}
		return v
	case *ast.Ident:
		if x.Name == "true" || x.Name == "false" {
			return x.Name == "true"
		}
		if x.Name == "nil" {
			return nil
		}
		if v, ok := sc.get(x.Name); ok {
			return v
		}
		e.failf("undefined identifier %q", x.Name)
	case *ast.ParenExpr:
		return e.eval(x.X, sc)
	case *ast.UnaryExpr:
		v := e.eval(x.X, sc)
		if x.Op == token.NOT {
			return !e.bool(v)
		}
		if x.Op == token.SUB {
			if f, ok := v.(float64); ok {
				return -f
			}
			return -e.int(v)
		}
		if x.Op == token.ADD {
			return v
		}
		e.failf("unsupported unary op %s", x.Op)
	case *ast.BinaryExpr:
		if x.Op == token.LAND {
			return e.bool(e.eval(x.X, sc)) && e.bool(e.eval(x.Y, sc))
		}
		if x.Op == token.LOR {
			return e.bool(e.eval(x.X, sc)) || e.bool(e.eval(x.Y, sc))
		}
		return e.evalBinary(x.Op, e.eval(x.X, sc), e.eval(x.Y, sc))
	case *ast.SelectorExpr:
		return e.getField(e.eval(x.X, sc), x.Sel.Name)
	case *ast.IndexExpr:
		v, _ := e.evalIndex(x, sc)
		return v
	case *ast.SliceExpr:
		return e.evalSlice(x, sc)
	case *ast.CompositeLit:
		return e.evalCompositeLit(x, sc)
	case *ast.CallExpr:
		return e.evalCall(x, sc)
	case *ast.TypeAssertExpr:
		v, ok := e.evalTypeAssert(x, sc)
		if !ok {
			e.failf("type assertion failed")
		}
		return v
	}
	e.failf("unsupported expression %T", expr)
	return nil
}

func cmpOrdered[T cmp.Ordered](op token.Token, a, b T) (bool, bool) {
	switch op {
	case token.LSS:
		return a < b, true
	case token.LEQ:
		return a <= b, true
	case token.GTR:
		return a > b, true
	case token.GEQ:
		return a >= b, true
	}
	return false, false
}

func (e *vm) evalBinary(op token.Token, lv, rv any) any {
	if op == token.EQL || op == token.NEQ {
		eq := valuesEqual(lv, rv)
		if op == token.NEQ {
			return !eq
		}
		return eq
	}
	if ls, ok := lv.(string); ok {
		rs := e.str(rv)
		if op == token.ADD {
			e.alloc(int64(len(ls) + len(rs)))
			return ls + rs
		}
		if res, ok := cmpOrdered(op, ls, rs); ok {
			return res
		}
	}
	if _, lf := lv.(float64); lf || isFloat(rv) {
		a, b := e.float(lv), e.float(rv)
		if res, ok := cmpOrdered(op, a, b); ok {
			return res
		}
		switch op {
		case token.ADD:
			return a + b
		case token.SUB:
			return a - b
		case token.MUL:
			return a * b
		case token.QUO:
			if b == 0 {
				panic("division by zero")
			}
			return a / b
		}
	}
	ln, rn := e.int(lv), e.int(rv)
	if res, ok := cmpOrdered(op, ln, rn); ok {
		return res
	}
	switch op {
	case token.ADD:
		return ln + rn
	case token.SUB:
		return ln - rn
	case token.MUL:
		return ln * rn
	case token.QUO, token.REM:
		if rn == 0 {
			panic("integer divide by zero")
		}
		if op == token.QUO {
			return ln / rn
		}
		return ln % rn
	}
	e.failf("unsupported binary op %s", op)
	return nil
}

func (e *vm) evalIndex(x *ast.IndexExpr, sc *env) (any, bool) {
	col, key := e.eval(x.X, sc), e.eval(x.Index, sc)
	switch c := col.(type) {
	case map[string]any:
		v, ok := c[e.str(key)]
		return v, ok
	case map[string][]string:
		v, ok := c[e.str(key)]
		return v, ok
	case []byte:
		return int64(c[checkIdx(e.int(key), len(c))]), true
	case []any:
		return c[checkIdx(e.int(key), len(c))], true
	case []string:
		return c[checkIdx(e.int(key), len(c))], true
	case string:
		return int64(c[checkIdx(e.int(key), len(c))]), true
	}
	e.failf("cannot index %T", col)
	return nil, false
}

func (e *vm) evalSlice(x *ast.SliceExpr, sc *env) any {
	col := e.eval(x.X, sc)
	n := int64(valueLen(col))
	lo, hi := int64(0), n
	if x.Low != nil {
		lo = e.int(e.eval(x.Low, sc))
	}
	if x.High != nil {
		hi = e.int(e.eval(x.High, sc))
	}
	if lo < 0 || hi < lo || hi > n {
		panic("slice bounds out of range")
	}
	switch c := col.(type) {
	case string:
		return c[lo:hi]
	case []byte:
		return c[lo:hi]
	case []any:
		return c[lo:hi]
	case []string:
		return c[lo:hi]
	}
	e.failf("cannot slice %T", col)
	return nil
}

func (e *vm) evalCompositeLit(x *ast.CompositeLit, sc *env) any {
	switch t := x.Type.(type) {
	case *ast.ArrayType:
		if elemTypeName(t.Elt) == "byte" {
			e.alloc(int64(len(x.Elts)))
			out := make([]byte, len(x.Elts))
			for i, el := range x.Elts {
				out[i] = byte(e.int(e.eval(el, sc)))
			}
			return out
		}
		e.alloc(int64(len(x.Elts)) * 16)
		out := make([]any, len(x.Elts))
		for i, el := range x.Elts {
			out[i] = e.eval(el, sc)
		}
		return out
	case *ast.MapType:
		m := make(map[string]any, len(x.Elts))
		for _, el := range x.Elts {
			kv, ok := el.(*ast.KeyValueExpr)
			if !ok {
				e.failf("map literal requires key:value")
			}
			k := e.str(e.eval(kv.Key, sc))
			e.alloc(int64(len(k)) + 32)
			m[k] = e.eval(kv.Value, sc)
		}
		return m
	}
	e.failf("unsupported composite literal %T", x.Type)
	return nil
}

func (e *vm) evalCall(x *ast.CallExpr, sc *env) any {
	if at, ok := x.Fun.(*ast.ArrayType); ok && elemTypeName(at.Elt) == "byte" && len(x.Args) == 1 {
		b := e.bytes(e.eval(x.Args[0], sc))
		e.alloc(int64(len(b)))
		return append([]byte(nil), b...)
	}
	if id, ok := x.Fun.(*ast.Ident); ok && id.Name == "make" {
		return e.evalMake(x.Args, sc)
	}
	args := make([]any, len(x.Args))
	for i, a := range x.Args {
		args[i] = e.eval(a, sc)
	}
	switch fn := x.Fun.(type) {
	case *ast.Ident:
		if allowedBuiltins[fn.Name] {
			return e.callBuiltin(fn.Name, args)
		}
		if decl, ok := e.prog.funcs[fn.Name]; ok {
			return e.callFunc(decl, args)
		}
		e.failf("undefined function %q", fn.Name)
	case *ast.SelectorExpr:
		if pid, ok := fn.X.(*ast.Ident); ok {
			if pkgPath, isImp := e.prog.imports[pid.Name]; isImp {
				return e.callPkg(pkgPath, fn.Sel.Name, args)
			}
		}
		return e.callMethod(e.eval(fn.X, sc), fn.Sel.Name, args)
	}
	e.failf("unsupported call target %T", x.Fun)
	return nil
}

func (e *vm) evalMake(rawArgs []ast.Expr, sc *env) any {
	if len(rawArgs) < 1 || len(rawArgs) > 3 {
		e.failf("make expects 1..3 args")
	}
	var n int64
	if len(rawArgs) >= 2 {
		if n = e.int(e.eval(rawArgs[1], sc)); n < 0 {
			e.failf("make: negative length")
		}
	}
	switch t := rawArgs[0].(type) {
	case *ast.ArrayType:
		if elemTypeName(t.Elt) == "byte" {
			e.alloc(n)
			return make([]byte, int(n))
		}
		if n > e.memLimit/16 {
			e.fail(ErrMemoryLimit)
		}
		e.alloc(n * 16)
		return make([]any, int(n))
	case *ast.MapType:
		if n > e.memLimit/32 {
			e.fail(ErrMemoryLimit)
		}
		e.alloc(n*32 + 32)
		return make(map[string]any)
	}
	e.failf("unsupported make type %T", rawArgs[0])
	return nil
}

func (e *vm) callBuiltin(name string, args []any) any {
	switch name {
	case "len", "cap":
		if len(args) == 1 {
			return int64(valueLen(args[0]))
		}
	case "append":
		if len(args) < 2 {
			e.failf("append expects >=2 args")
		}
		if s, ok := args[0].([]byte); ok {
			e.alloc(int64(len(s)))
			out := append([]byte(nil), s...)
			for _, a := range args[1:] {
				if b, ok := a.([]byte); ok {
					e.alloc(int64(len(b)))
					out = append(out, b...)
				} else {
					e.alloc(1)
					out = append(out, byte(e.int(a)))
				}
			}
			return out
		}
		if s, ok := args[0].([]any); ok {
			e.alloc(int64(len(s)+len(args)-1) * 16)
			return append(append([]any(nil), s...), args[1:]...)
		}
	case "delete":
		if len(args) == 2 {
			k := e.str(args[1])
			if m, ok := args[0].(map[string]any); ok {
				delete(m, k)
				return nil
			}
			if m, ok := args[0].(map[string][]string); ok {
				delete(m, k)
				return nil
			}
		}
	case "string":
		if len(args) == 1 {
			switch v := args[0].(type) {
			case string:
				return v
			case []byte:
				e.alloc(int64(len(v)))
				return string(v)
			case int64:
				return string(rune(v))
			}
		}
	case "int", "int64":
		return e.int(args[0])
	case "float64":
		return e.float(args[0])
	case "byte":
		return int64(byte(e.int(args[0])))
	case "panic":
		if len(args) == 1 {
			panic(args[0])
		}
		panic("hook panic")
	}
	e.failf("unsupported builtin %q", name)
	return nil
}

func (e *vm) callMethod(obj any, name string, args []any) any {
	var hdrs *map[string][]string
	var readOnly bool
	switch o := obj.(type) {
	case *Request:
		hdrs, readOnly = &o.Headers, o.readOnly
	case *Response:
		hdrs = &o.Headers
	case error:
		if name == "Error" && len(args) == 0 {
			return o.Error()
		}
		e.failf("unsupported method %s on error", name)
	default:
		e.failf("unsupported method %s on %T", name, obj)
	}
	if *hdrs == nil {
		*hdrs = map[string][]string{}
	}
	switch name {
	case "GetHeader":
		if len(args) == 1 {
			if vs := http.Header(*hdrs).Values(e.str(args[0])); len(vs) > 0 {
				return vs[0]
			}
			return ""
		}
	case "SetHeader", "AddHeader":
		if readOnly {
			e.failf("%w: request is read-only in response phase", ErrForbiddenMutation)
		}
		if len(args) == 2 {
			k, v := e.str(args[0]), e.str(args[1])
			e.alloc(int64(len(k) + len(v) + 16))
			ck := http.CanonicalHeaderKey(k)
			if name == "SetHeader" {
				(*hdrs)[ck] = []string{v}
			} else {
				(*hdrs)[ck] = append((*hdrs)[ck], v)
			}
			return nil
		}
	case "DelHeader":
		if readOnly {
			e.failf("%w: request is read-only in response phase", ErrForbiddenMutation)
		}
		if len(args) == 1 {
			k := e.str(args[0])
			for hk := range *hdrs {
				if strings.EqualFold(hk, k) {
					delete(*hdrs, hk)
				}
			}
			return nil
		}
	}
	e.failf("unsupported method %s", name)
	return nil
}

func (e *vm) evalTypeAssert(x *ast.TypeAssertExpr, sc *env) (any, bool) {
	v := e.eval(x.X, sc)
	switch t := x.Type.(type) {
	case *ast.Ident:
		switch t.Name {
		case "string":
			s, ok := v.(string)
			return s, ok
		case "bool":
			b, ok := v.(bool)
			return b, ok
		case "float64":
			f, ok := v.(float64)
			return f, ok
		case "int", "int64":
			n, ok := v.(int64)
			return n, ok
		}
	case *ast.MapType:
		m, ok := v.(map[string]any)
		return m, ok
	case *ast.ArrayType:
		if elemTypeName(t.Elt) == "byte" {
			b, ok := v.([]byte)
			return b, ok
		}
		s, ok := v.([]any)
		return s, ok
	}
	e.failf("unsupported type assertion %T", x.Type)
	return nil, false
}

func (e *vm) getField(obj any, field string) any {
	switch o := obj.(type) {
	case *Request:
		switch field {
		case "Scheme":
			return o.Scheme
		case "Host":
			return o.Host
		case "Port":
			return o.Port
		case "Method":
			return o.Method
		case "Path":
			return o.Path
		case "RawQuery":
			return o.RawQuery
		case "Headers":
			return o.Headers
		case "Body":
			return o.Body
		}
	case *Response:
		switch field {
		case "Status":
			return int64(o.Status)
		case "Headers":
			return o.Headers
		case "Body":
			return o.Body
		}
	}
	e.failf("unknown field %q on %T", field, obj)
	return nil
}

func parseBasicLit(l *ast.BasicLit) (any, error) {
	switch l.Kind {
	case token.INT:
		return strconv.ParseInt(l.Value, 0, 64)
	case token.FLOAT:
		return strconv.ParseFloat(l.Value, 64)
	case token.STRING:
		return strconv.Unquote(l.Value)
	case token.CHAR:
		s, err := strconv.Unquote(l.Value)
		if err != nil || len(s) == 0 {
			return nil, fmt.Errorf("invalid char literal %s", l.Value)
		}
		return int64([]rune(s)[0]), nil
	}
	return nil, fmt.Errorf("unsupported literal %s", l.Kind)
}

func zeroValue(t ast.Expr) any {
	switch x := t.(type) {
	case *ast.Ident:
		switch x.Name {
		case "string":
			return ""
		case "int", "int64", "byte":
			return int64(0)
		case "float64":
			return float64(0)
		case "bool":
			return false
		}
	case *ast.MapType:
		return map[string]any(nil)
	case *ast.ArrayType:
		if elemTypeName(x.Elt) == "byte" {
			return []byte(nil)
		}
		return []any(nil)
	}
	return nil
}

func elemTypeName(e ast.Expr) string {
	if id, ok := e.(*ast.Ident); ok {
		return id.Name
	}
	return ""
}

func valueLen(v any) int {
	switch x := v.(type) {
	case string:
		return len(x)
	case []byte:
		return len(x)
	case []any:
		return len(x)
	case []string:
		return len(x)
	case map[string]any:
		return len(x)
	case map[string][]string:
		return len(x)
	}
	return 0
}

func valuesEqual(a, b any) bool {
	if a == nil || b == nil {
		return a == b
	}
	if isFloat(a) || isFloat(b) {
		af, aok := toFloat(a)
		bf, bok := toFloat(b)
		return aok && bok && af == bf
	}
	if an, ok := toInt(a); ok {
		if bn, ok := toInt(b); ok {
			return an == bn
		}
	}
	return a == b
}

func toInt(v any) (int64, bool) {
	switch x := v.(type) {
	case int64:
		return x, true
	case int:
		return int64(x), true
	case float64:
		return int64(x), true
	}
	return 0, false
}

func toFloat(v any) (float64, bool) {
	if f, ok := v.(float64); ok {
		return f, true
	}
	if n, ok := toInt(v); ok {
		return float64(n), true
	}
	return 0, false
}

func isFloat(v any) bool { _, ok := v.(float64); return ok }

func (e *vm) bool(v any) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	e.failf("expected bool, got %T", v)
	return false
}
func (e *vm) str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	e.failf("expected string, got %T", v)
	return ""
}
func (e *vm) bytes(v any) []byte {
	if b, ok := v.([]byte); ok {
		return b
	}
	if s, ok := v.(string); ok {
		e.alloc(int64(len(s)))
		return []byte(s)
	}
	e.failf("expected []byte or string, got %T", v)
	return nil
}
func (e *vm) strSlice(v any) []string {
	if ss, ok := v.([]string); ok {
		return ss
	}
	if sa, ok := v.([]any); ok {
		e.alloc(int64(len(sa)) * 16)
		out := make([]string, len(sa))
		for i, el := range sa {
			out[i] = e.str(el)
		}
		return out
	}
	e.failf("expected []any of strings, got %T", v)
	return nil
}
func (e *vm) int(v any) int64 {
	if n, ok := toInt(v); ok {
		return n
	}
	e.failf("expected int, got %T", v)
	return 0
}
func (e *vm) float(v any) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	if n, ok := toInt(v); ok {
		return float64(n)
	}
	e.failf("expected float64, got %T", v)
	return 0
}
