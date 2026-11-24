package agent

import (
	"context"
	"encoding/json"

	"github.com/Autumn-27/artex/db"
	actool "github.com/Autumn-27/norma/tool"
)

// Task credential tools (#3): a per-task record of test accounts. User-declared
// accounts (e.g. a program-provided alias) are injected into the worker's graph
// overview; accounts the agent registers itself MUST be recorded via
// save_task_credential so they are not forgotten when the session context rolls
// over. Handlers guard nil stores internally, mirroring the asset tools.

func (t *ToolSet) saveTaskCredential() actool.CoreTool {
	return writeTool(
		"save_task_credential",
		"Record (or update) a test account for this task's target. ALWAYS call this immediately after registering an account on the target, with the exact username and password you chose, so the account is not lost. Also use it to update a known account whose password changed. Same (domain, username) is overwritten in place, not duplicated.\n"+
			"Returns: {id, domain, username, source}.",
		obj(map[string]any{
			"domain":   str("domain or host the account belongs to (e.g. target.example.com)"),
			"username": str("login name / email used"),
			"password": str("the exact password that was set — required"),
			"note":     str("optional context, e.g. which registration flow created it"),
		}, "domain", "username", "password"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var a struct {
				Domain   string `json:"domain"`
				Username string `json:"username"`
				Password string `json:"password"`
				Note     string `json:"note"`
			}
			if err := json.Unmarshal(in, &a); err != nil {
				return actool.Errorf("invalid input: " + err.Error()), nil
			}
			if t.ts == nil {
				return actool.Errorf("save_task_credential is not enabled: task store is not initialized"), nil
			}
			taskID := t.taskID
			if taskID <= 0 {
				var err error
				taskID, err = t.ts.TaskID()
				if err != nil || taskID <= 0 {
					return actool.Errorf("save_task_credential is only available inside a task"), nil
				}
				t.taskID = taskID
			}
			c, err := t.ts.UpsertTaskCredential(taskID, db.TaskCredentialInput{
				Domain: a.Domain, Username: a.Username, Password: a.Password,
				Source: "agent", Note: a.Note,
			})
			if err != nil {
				return actool.Errorf("save_task_credential failed: " + err.Error()), nil
			}
			return jsonResult(map[string]any{
				"id": c.ID, "domain": c.Domain, "username": c.Username, "source": c.Source,
			})
		})
}

func (t *ToolSet) listTaskCredentials() actool.CoreTool {
	return writeTool(
		"list_task_credentials",
		"List this task's test accounts: user-declared accounts (e.g. program-provided aliases; a user-declared entry with an empty password means: register an account on that domain with a strong password, then record it via save_task_credential) plus accounts recorded by earlier runs. Check this BEFORE registering a new account, and use matching entries for authenticated testing.",
		obj(map[string]any{}),
		func(_ context.Context, _ json.RawMessage) (actool.Result, error) {
			if t.ts == nil {
				return actool.Errorf("list_task_credentials is not enabled: task store is not initialized"), nil
			}
			taskID := t.taskID
			if taskID <= 0 {
				var err error
				taskID, err = t.ts.TaskID()
				if err != nil || taskID <= 0 {
					return actool.Errorf("list_task_credentials is only available inside a task"), nil
				}
				t.taskID = taskID
			}
			list, err := t.ts.TaskCredentials(taskID)
			if err != nil {
				return actool.Errorf("list_task_credentials failed: " + err.Error()), nil
			}
			return jsonResult(map[string]any{"credentials": list})
		})
}

// taskCredentialOverview renders the credentials block injected into the worker's
// graph overview. Empty user-side passwords surface as an explicit instruction
// (the agent generates and records one) rather than a half-entry.
func (t *ToolSet) taskCredentialOverview() []map[string]any {
	if t.ts == nil || t.taskID <= 0 {
		return nil
	}
	list, err := t.ts.TaskCredentials(t.taskID)
	if err != nil || len(list) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(list))
	for _, c := range list {
		m := map[string]any{
			"domain":   c.Domain,
			"username": c.Username,
			"source":   c.Source,
		}
		if c.Note != "" {
			m["note"] = c.Note
		}
		if c.Password == "" {
			m["instruction"] = "no password yet: register an account with this username on this domain (choose a strong unique password), then record it via save_task_credential"
		} else {
			m["password"] = c.Password
		}
		out = append(out, m)
	}
	return out
}
