package notify

import (
	"context"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// This file locks down the **capability boundary** of the generic Webhook template.
//
// This is the only place in the whole package where "a user-provided string is
// evaluated as code", so we must spell out what it can and cannot do, and pin those
// properties down with tests — otherwise one day someone will casually add a method
// to the template context, or a readFile to the FuncMap, and the capability surface
// silently expands while the diff looks like a harmless little function.

// TestTemplateContextHasNoMethods is the most important one.
//
// text/template invokes exported methods ({{.Foo}} can read a field or call a
// method). So as long as the template context can reach **any** type with exported
// methods, those methods are effectively exposed to template authors.
// This feature's context is deliberately pure data (exported fields only, zero
// methods).
//
// If this test fails: someone added a method to webhookTemplateData / webhookItem.
// Before deciding to allow it, think carefully about whether that method could be
// used by a template to read things that should not be exposed.
func TestTemplateContextHasNoMethods(t *testing.T) {
	for _, v := range []any{webhookTemplateData{}, webhookItem{}} {
		typ := reflect.TypeOf(v)
		if n := typ.NumMethod(); n != 0 {
			var names []string
			for i := 0; i < n; i++ {
				names = append(names, typ.Method(i).Name)
			}
			t.Fatalf("%s exposes %d methods (%s): text/template can call them, "+
				"which hands those methods' capabilities to template authors", typ.Name(), n, strings.Join(names, ", "))
		}
	}
}

// TestTemplateFuncsAreMinimal locks down the set of functions exposed to templates.
//
// Every extra function in the FuncMap is one more capability. Currently there are
// only json / jsons, whose job is to serialize a value into a JSON fragment — they
// cannot read files, make requests, or execute commands.
func TestTemplateFuncsAreMinimal(t *testing.T) {
	var got []string
	for name := range webhookTemplateFuncs {
		got = append(got, name)
	}
	sort.Strings(got)
	want := []string{"json", "jsons"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("template function set changed: got %v, want %v. Before adding a function, confirm it does not expand the capability surface "+
			"(no file reads/writes, no network requests, no command execution)", got, want)
	}
}

// TestTemplateCannotReachUnknownData covers out-of-bounds access in templates:
// accessing something that does not exist must fail, not echo something back;
// and the failure message must not carry internal data out.
func TestTemplateCannotReachUnknownData(t *testing.T) {
	_, err := renderWebhookBody(`{"x": {{.Environment}}, "y": {{.Env}}}`, singleMsg())
	if err == nil {
		t.Fatal("accessing a non-existent field should error")
	}
	// The error must not contain real content from the template context (vulnerability title/summary).
	for _, leak := range []string{"SQL injection", "param id"} {
		if strings.Contains(err.Error(), leak) {
			t.Errorf("template error leaked message content %q: %v", leak, err)
		}
	}
}

// TestTemplateRenderFailsPermanently: a broken template is a configuration error; retries will not fix it.
// If it were classified as retryable, one bad template would make every delivery waste three rounds of backoff.
func TestTemplateRenderFailsPermanently(t *testing.T) {
	cfg := map[string]any{
		"url":           "https://example.com/hook",
		"body_template": `{{.Items.`,
	}
	if err := (webhookChannel{}).Validate(cfg); err == nil {
		t.Fatal("template syntax errors should be caught at save time")
	}
	// Even if validation is bypassed and delivery is attempted directly, it must be judged a permanent failure rather than retried over and over.
	_, err := (webhookChannel{}).Send(context.Background(), cfg, singleMsg())
	if err == nil || !IsPermanent(err) {
		t.Fatalf("a bad template should be a permanent failure, got %v", err)
	}
}

// TestTemplateCanOnlyProduceJSON covers the constraint that "the template render result must be valid JSON".
// It also blocks uses like "using the template to generate plain text to trigger other protocols".
func TestTemplateCanOnlyProduceJSON(t *testing.T) {
	// A valid template passes.
	ok := map[string]any{"url": "https://example.com/hook", "body_template": `{"t":{{json .Title}}}`}
	if err := (webhookChannel{}).Validate(ok); err != nil {
		t.Fatalf("a valid template should pass validation: %v", err)
	}
	// When the render result is not JSON it must be rejected (rather than sent out as-is).
	bad := map[string]any{"url": "http://127.0.0.1:1/hook", "body_template": `not json {{.Count}}`}
	_, err := (webhookChannel{}).Send(context.Background(), bad, singleMsg())
	if err == nil || !IsPermanent(err) {
		t.Fatalf("rendering non-JSON should be a permanent failure, got %v", err)
	}
	if !strings.Contains(err.Error(), "valid JSON") {
		t.Errorf("the error message should indicate a JSON problem, got %v", err)
	}
}
