package hookvm

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestCompileRejectsForbiddenConstructsAndImports(t *testing.T) {
	cases := []struct {
		name  string
		phase string
		src   string
	}{
		{"import_os", "request", `package hook; import "os"; func OnRequest(req *Request) error { _ = os.Getenv("HOME"); return nil }`},
		{"import_io_fs", "request", `package hook; import "io/fs"; func OnRequest(req *Request) error { return nil }`},
		{"import_net", "request", `package hook; import "net"; func OnRequest(req *Request) error { return nil }`},
		{"import_net_http", "request", `package hook; import "net/http"; func OnRequest(req *Request) error { return nil }`},
		{"import_os_exec", "request", `package hook; import "os/exec"; func OnRequest(req *Request) error { return nil }`},
		{"import_syscall", "request", `package hook; import "syscall"; func OnRequest(req *Request) error { return nil }`},
		{"import_unsafe", "request", `package hook; import "unsafe"; func OnRequest(req *Request) error { return nil }`},
		{"import_reflect", "request", `package hook; import "reflect"; func OnRequest(req *Request) error { return nil }`},
		{"import_time", "request", `package hook; import "time"; func OnRequest(req *Request) error { _ = time.Now(); return nil }`},
		{"import_math_rand", "request", `package hook; import "math/rand"; func OnRequest(req *Request) error { _ = rand.Int(); return nil }`},
		{"import_crypto_rand", "request", `package hook; import "crypto/rand"; func OnRequest(req *Request) error { return nil }`},
		{"import_fmt_disallowed", "request", `package hook; import "fmt"; func OnRequest(req *Request) error { return nil }`},
		{"import_sort_disallowed", "request", `package hook; import "sort"; func OnRequest(req *Request) error { return nil }`},
		{"dot_import", "request", `package hook; import . "strings"; func OnRequest(req *Request) error { return nil }`},
		{"blank_import", "request", `package hook; import _ "strings"; func OnRequest(req *Request) error { return nil }`},
		{"goroutine", "request", `package hook; func f(){}; func OnRequest(req *Request) error { go f(); return nil }`},
		{"channel_type", "request", `package hook; func OnRequest(req *Request) error { var c chan int; _ = c; return nil }`},
		{"select_stmt", "request", `package hook; func OnRequest(req *Request) error { select {}; return nil }`},
		{"defer_stmt", "request", `package hook; func f(){}; func OnRequest(req *Request) error { defer f(); return nil }`},
		{"goto_stmt", "request", `package hook; func OnRequest(req *Request) error { goto end; end: return nil }`},
		{"init_func", "request", `package hook; func init() {}; func OnRequest(req *Request) error { return nil }`},
		{"mutable_global", "request", `package hook; var counter = 0; func OnRequest(req *Request) error { counter++; return nil }`},
		{"switch_stmt", "request", `package hook; func OnRequest(req *Request) error { switch req.Method { case "GET": }; return nil }`},
		{"address_of", "request", `package hook; func OnRequest(req *Request) error { x := 1; _ = &x; return nil }`},
		{"func_lit", "request", `package hook; func OnRequest(req *Request) error { f := func() {}; _ = f; return nil }`},
		{"builtin_recover", "request", `package hook; func OnRequest(req *Request) error { _ = recover(); return nil }`},
		{"builtin_print", "request", `package hook; func OnRequest(req *Request) error { print("x"); return nil }`},
		{"builtin_println", "request", `package hook; func OnRequest(req *Request) error { println("x"); return nil }`},
		{"wrong_package", "request", `package main; func OnRequest(req *Request) error { return nil }`},
		{"missing_entry", "request", `package hook; func Helper() error { return nil }`},
		{"wrong_arity_response", "response", `package hook; func OnResponse(resp *Response) error { return nil }`},
		{"oversized_source", "request", "package hook\nfunc OnRequest(req *Request) error { return nil }\n//" + strings.Repeat("a", MaxSourceBytes)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Compile(tc.phase, tc.src); err == nil {
				t.Fatalf("expected Compile(%s) to reject %s", tc.phase, tc.name)
			}
		})
	}
}

func TestRequestAndResponseTransformationsAndHelpers(t *testing.T) {
	src := `package hook

import (
	"crypto/hmac"
	"encoding/base64"
	"encoding/json"
	"net/url"
	"strings"
)

const secretKey = "k-123"

func sign(data []byte) string {
	return hmac.SHA256Hex([]byte(secretKey), data)
}

func OnRequest(req *Request) error {
	req.SetHeader("X-Tampered", "yes")
	req.DelHeader("X-Remove")
	if strings.HasPrefix(req.Path, "/v1/") {
		req.Path = strings.ReplaceAll(req.Path, "/v1/", "/v2/")
	}
	q, err := url.ParseQuery(req.RawQuery)
	if err != nil {
		return err
	}
	q["debug"] = []any{"1"}
	req.RawQuery = url.EncodeQuery(q)

	val, err := json.Decode(req.Body)
	if err != nil {
		return err
	}
	obj, ok := val.(map[string]any)
	if !ok {
		return nil
	}
	obj["role"] = "admin"
	out, err := json.Marshal(obj)
	if err != nil {
		return err
	}
	req.Body = out
	req.SetHeader("X-Sig", sign(out))
	req.SetHeader("X-B64", base64.EncodeToString([]byte(req.Host)))
	return nil
}
`
	prog, err := Compile("request", src)
	if err != nil {
		t.Fatalf("Compile: %v", err)
	}
	req := &Request{
		Scheme:   "https",
		Host:     "api.example.test",
		Port:     "443",
		Method:   "POST",
		Path:     "/v1/users",
		RawQuery: "a=2",
		Headers:  map[string][]string{"X-Remove": {"bye"}},
		Body:     []byte(`{"role":"user","id":7}`),
	}
	if err := prog.RunRequest(context.Background(), req, RunOptions{}); err != nil {
		t.Fatalf("RunRequest: %v", err)
	}
	if req.Path != "/v2/users" {
		t.Fatalf("Path = %q, want /v2/users", req.Path)
	}
	if req.RawQuery != "a=2&debug=1" {
		t.Fatalf("RawQuery = %q, want a=2&debug=1", req.RawQuery)
	}
	if got := req.Headers["X-Tampered"]; len(got) != 1 || got[0] != "yes" {
		t.Fatalf("X-Tampered = %v", got)
	}
	if _, exists := req.Headers["X-Remove"]; exists {
		t.Fatal("X-Remove was not deleted")
	}
	if !bytes.Contains(req.Body, []byte(`"role":"admin"`)) {
		t.Fatalf("Body = %s", req.Body)
	}
	if len(req.Headers["X-Sig"]) != 1 || len(req.Headers["X-Sig"][0]) != 64 {
		t.Fatalf("X-Sig = %v", req.Headers["X-Sig"])
	}
}

func TestForbiddenHostSchemePortAndReadOnlyRequest(t *testing.T) {
	for _, field := range []string{"Host", "Scheme", "Port"} {
		t.Run("mutate_"+field, func(t *testing.T) {
			src := `package hook
func OnRequest(req *Request) error {
	req.` + field + ` = "evil.example.test"
	return nil
}`
			prog, err := Compile("request", src)
			if err != nil {
				t.Fatalf("Compile: %v", err)
			}
			req := &Request{Scheme: "https", Host: "good.example.test", Port: "443"}
			err = prog.RunRequest(context.Background(), req, RunOptions{})
			if !errors.Is(err, ErrForbiddenMutation) {
				t.Fatalf("err = %v, want ErrForbiddenMutation", err)
			}
		})
	}

	t.Run("mutate_request_in_response_phase", func(t *testing.T) {
		src := `package hook
func OnResponse(req *Request, resp *Response) error {
	req.SetHeader("X-Bad", "1")
	return nil
}`
		prog, err := Compile("response", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunResponse(context.Background(), &Request{}, &Response{Status: 200}, RunOptions{})
		if !errors.Is(err, ErrForbiddenMutation) {
			t.Fatalf("err = %v, want ErrForbiddenMutation", err)
		}
	})

	t.Run("response_phase_req_headers_index_only_mutates_vm_copy", func(t *testing.T) {
		src := `package hook
func OnResponse(req *Request, resp *Response) error {
	req.Headers["X-Vm-Only"] = []any{"1"}
	resp.SetHeader("X-Seen", req.GetHeader("X-Vm-Only"))
	return nil
}`
		prog, err := Compile("response", src)
		if err != nil {
			t.Fatal(err)
		}
		vmReq := &Request{Headers: map[string][]string{"X-Orig": {"keep"}}}
		resp := &Response{Status: 200, Headers: map[string][]string{}}
		if err := prog.RunResponse(context.Background(), vmReq, resp, RunOptions{}); err != nil {
			t.Fatalf("RunResponse: %v", err)
		}
		if len(resp.Headers["X-Seen"]) != 1 || resp.Headers["X-Seen"][0] != "1" {
			t.Fatalf("expected VM-local mutation visible inside hook, got %v", resp.Headers)
		}
	})
}

func TestResourceBoundsMemoryStepTimeoutPanicAndRegexp(t *testing.T) {
	t.Run("range_over_body_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
func OnRequest(req *Request) error {
	for _, b := range req.Body {
		_ = b
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		body := make([]byte, 256<<10)
		err = prog.RunRequest(context.Background(), &Request{Body: body}, RunOptions{MaxMemory: 64 << 10})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("make_100MiB_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
func OnRequest(req *Request) error {
	b := make([]byte, 100*1024*1024)
	_ = b
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{MaxMemory: 1 << 20})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("strings_repeat_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
import "strings"
func OnRequest(req *Request) error {
	s := strings.Repeat("A", 10*1024*1024)
	_ = s
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{MaxMemory: 1 << 20})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("bytes_contains_string_loop_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
import "bytes"
func OnRequest(req *Request) error {
	s := string(req.Body)
	for i := 0; i < 1000; i++ {
		if bytes.Contains(s, "needle") {
			return nil
		}
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		req := &Request{Body: bytes.Repeat([]byte("A"), 1<<20)}
		err = prog.RunRequest(context.Background(), req, RunOptions{})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("regexp_compile_loop_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
import "regexp"
func OnRequest(req *Request) error {
	for i := 0; i < 500; i++ {
		_, err := regexp.MatchString("foo[0-9]+bar", "hello")
		if err != nil {
			return err
		}
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("strslice_join_loop_stopped_by_memory_budget", func(t *testing.T) {
		src := `package hook
import "strings"
func OnRequest(req *Request) error {
	items := make([]any, 1000)
	for i := 0; i < 1000; i++ {
		items[i] = ""
	}
	for i := 0; i < 1000; i++ {
		_ = strings.Join(items, "")
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{MaxMemory: 256 << 10})
		if !errors.Is(err, ErrMemoryLimit) {
			t.Fatalf("err = %v, want ErrMemoryLimit", err)
		}
	})

	t.Run("infinite_loop_stopped_by_step_limit", func(t *testing.T) {
		src := `package hook
func OnRequest(req *Request) error {
	for {
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{MaxSteps: 500})
		if !errors.Is(err, ErrStepLimit) {
			t.Fatalf("err = %v, want ErrStepLimit", err)
		}
	})

	t.Run("infinite_loop_stopped_by_context_timeout", func(t *testing.T) {
		src := `package hook
func OnRequest(req *Request) error {
	i := 0
	for {
		i++
	}
	return nil
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()
		err = prog.RunRequest(ctx, &Request{}, RunOptions{MaxSteps: 100_000_000})
		if !errors.Is(err, ErrTimeout) {
			t.Fatalf("err = %v, want ErrTimeout", err)
		}
	})

	t.Run("panic_recovered_as_panic_error", func(t *testing.T) {
		src := `package hook
func OnRequest(req *Request) error {
	panic("boom")
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		err = prog.RunRequest(context.Background(), &Request{}, RunOptions{})
		var pe *PanicError
		if !errors.As(err, &pe) || pe.Value != "boom" {
			t.Fatalf("err = %v, want PanicError(boom)", err)
		}
	})

	t.Run("regexp_pattern_bounded", func(t *testing.T) {
		src := `package hook
import (
	"regexp"
	"strings"
)
func OnRequest(req *Request) error {
	pat := strings.Repeat("a", 2048)
	_, err := regexp.MatchString(pat, "aaa")
	return err
}`
		prog, err := Compile("request", src)
		if err != nil {
			t.Fatal(err)
		}
		if err := prog.RunRequest(context.Background(), &Request{}, RunOptions{}); err == nil || !strings.Contains(err.Error(), "exceeds") {
			t.Fatalf("expected regexp size limit error, got %v", err)
		}
	})
}

func TestDeterminismAndSortedMapIteration(t *testing.T) {
	src := `package hook
import "encoding/json"
func OnRequest(req *Request) error {
	v, err := json.Decode(req.Body)
	if err != nil {
		return err
	}
	m, _ := v.(map[string]any)
	joined := ""
	for k, val := range m {
		s, _ := val.(string)
		joined += k + "=" + s + ";"
	}
	req.SetHeader("X-Order", joined)
	out, err := json.Marshal(m)
	if err != nil {
		return err
	}
	req.Body = out
	return nil
}`
	prog, err := Compile("request", src)
	if err != nil {
		t.Fatal(err)
	}
	inputBody := []byte(`{"z":"last","a":"first","m":"mid","b":"second","k":"fifth"}`)
	var firstHeader, firstHash string
	for run := 0; run < 20; run++ {
		req := &Request{
			Scheme: "https", Host: "example.test", Port: "443",
			Method: "POST", Path: "/api",
			Body: append([]byte(nil), inputBody...),
		}
		if err := prog.RunRequest(context.Background(), req, RunOptions{}); err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
		h := req.Headers["X-Order"][0]
		sum := sha256.Sum256(req.Body)
		bodyHash := hex.EncodeToString(sum[:])
		if run == 0 {
			firstHeader, firstHash = h, bodyHash
			if firstHeader != "a=first;b=second;k=fifth;m=mid;z=last;" {
				t.Fatalf("unsorted map iteration: %q", firstHeader)
			}
		} else if h != firstHeader || bodyHash != firstHash {
			t.Fatalf("run %d diverged: (%q, %s) != (%q, %s)", run, h, bodyHash, firstHeader, firstHash)
		}
	}
}

func TestEqualityKeepsFloatFraction(t *testing.T) {
	src := `package hook
func mark(b bool) string {
	if b {
		return "T"
	}
	return "F"
}
func OnRequest(req *Request) error {
	x := 1.5
	n := 1
	req.SetHeader("X-Eq", mark(x == 1)+mark(x != n)+mark(-0.5 == 0)+mark(2.0 == 2)+mark(n == 1.0))
	return nil
}`
	prog, err := Compile("request", src)
	if err != nil {
		t.Fatal(err)
	}
	req := &Request{}
	if err := prog.RunRequest(context.Background(), req, RunOptions{}); err != nil {
		t.Fatal(err)
	}
	if got := req.Headers["X-Eq"][0]; got != "FTFTT" {
		t.Fatalf("X-Eq = %q, want FTFTT", got)
	}
}
