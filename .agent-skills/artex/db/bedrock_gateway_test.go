package db

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestBedrockGatewayHeadersEncryptedAndWriteOnly(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()
	const headers = "X-Example-Route: synthetic-secret"
	id, err := d.SaveProfile(&LLMProfile{Name: fmt.Sprintf("t-bedrock-%d", time.Now().UnixNano()), Format: "bedrock-gateway", BaseURL: "https://gateway.example.com/bedrock", Model: "test.model", APIKey: "synthetic-token", CustomHeaders: headers})
	if err != nil {
		t.Fatal(err)
	}
	defer deleteTestProfile(t, d, id)
	var stored string
	if err := d.QueryRow(`SELECT custom_headers FROM llm_profiles WHERE id=$1`, id).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !isEncrypted(stored) || strings.Contains(stored, "synthetic-secret") {
		t.Fatal("headers were stored in plaintext")
	}
	p, err := d.ProfileByID(id)
	if err != nil || p.CustomHeaders != headers {
		t.Fatalf("keyed load failed: %v", err)
	}
	list, err := d.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range list {
		if item.ID != id {
			continue
		}
		b, _ := json.Marshal(item)
		if strings.Contains(string(b), "synthetic-secret") || strings.Contains(string(b), "synthetic-token") {
			t.Fatal("profile list leaked a secret")
		}
	}
	if _, err := d.SaveProfile(&LLMProfile{ID: id, Name: p.Name, Format: p.Format, BaseURL: p.BaseURL, Model: p.Model}); err != nil {
		t.Fatal(err)
	}
	p, err = d.ProfileByID(id)
	if err != nil || p.CustomHeaders != headers {
		t.Fatal("blank update did not preserve headers")
	}
	if _, err := d.SaveProfile(&LLMProfile{ID: id, Name: p.Name, Format: p.Format, BaseURL: p.BaseURL, Model: p.Model, ClearCustomHeaders: true}); err != nil {
		t.Fatal(err)
	}
	p, err = d.ProfileByID(id)
	if err != nil || p.CustomHeaders != "" {
		t.Fatal("clear did not remove headers")
	}
	if _, err := d.SaveProfile(&LLMProfile{ID: id, Name: p.Name, Format: p.Format, BaseURL: p.BaseURL, Model: p.Model, APIKey: "synthetic-token", CustomHeaders: headers}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.SaveProfile(&LLMProfile{ID: id, Name: p.Name, Format: p.Format, BaseURL: "https://other.example.com/bedrock", Model: p.Model}); err != nil {
		t.Fatal(err)
	}
	p, err = d.ProfileByID(id)
	if err != nil || p.APIKey != "" || p.CustomHeaders != "" {
		t.Fatal("direct endpoint edit retained gateway credentials")
	}
}
