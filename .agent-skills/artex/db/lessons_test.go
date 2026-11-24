package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestRenderLessonsDataNotInstructions(t *testing.T) {
	lessons := []Lesson{
		{ID: 1, Kind: "positive", Cue: "xss", Action: "Confirmed xss: reflected in search", Support: 2,
			Evidence: []string{"finding:10 (status=confirmed severity=high)"}},
		{ID: 2, Kind: "negative", Cue: "ssrf", Action: "Do not\nre-report\x00 without new mechanics", Support: 1},
	}
	block, ids := RenderLessons(lessons, 2000)
	if !strings.Contains(block, "not instructions") {
		t.Fatalf("missing data-not-instructions header:\n%s", block)
	}
	if !strings.Contains(block, "[positive, 2 evidence]") || !strings.Contains(block, "[negative, 1 evidence]") {
		t.Fatalf("missing kind/support labels:\n%s", block)
	}
	for _, line := range strings.Split(block, "\n") {
		if strings.Contains(line, "\x00") {
			t.Fatalf("control character survived: %q", line)
		}
	}
	if !strings.Contains(block, "Do not re-report without new mechanics") {
		t.Fatalf("lesson text was not flattened onto one line:\n%s", block)
	}
	if got, ids := RenderLessons(nil, 2000); got != "" || ids != nil {
		t.Fatal("empty lesson set must render empty")
	}
	capped, cappedIDs := RenderLessons(lessons, 120)
	if len(capped) > 160 {
		t.Fatalf("cap not enforced: %d bytes", len(capped))
	}
	if len(ids) != 2 {
		t.Fatalf("uncapped rendered IDs=%v, want both lessons", ids)
	}
	if len(cappedIDs) > len(ids) {
		t.Fatalf("capped render logged more lessons than the full render")
	}
}

func TestLessonTextDoesNotSplitUTF8(t *testing.T) {
	// 60 CJK runes, 180 bytes. The old cut was s[:limit] in bytes.
	in := strings.Repeat("验", 60)
	got := lessonText(in, 20)
	if !utf8.ValidString(got) {
		t.Fatalf("truncated lesson text is not valid UTF-8: %q", got)
	}
	if n := utf8.RuneCountInString(got); n != 20 {
		t.Fatalf("truncated to %d runes, want 20", n)
	}
}

func TestRenderLessonsUsageOmitsTruncated(t *testing.T) {
	lessons := []Lesson{
		{ID: 11, Kind: "positive", Cue: "xss", Action: "Confirmed xss: " + strings.Repeat("a", 80), Support: 1},
		{ID: 12, Kind: "negative", Cue: "ssrf", Action: "Do not re-report: " + strings.Repeat("b", 80), Support: 1},
	}
	block, ids := RenderLessons(lessons, 250)
	if block == "" {
		t.Fatal("expected at least the first lesson to fit")
	}
	if len(ids) == 0 || ids[0] != 11 {
		t.Fatalf("rendered IDs=%v, want the first lesson", ids)
	}
	if len(ids) > 1 {
		t.Fatalf("cap should have dropped the second lesson, got %v", ids)
	}
}

func TestRenderLessonsCapsRunesNotBytes(t *testing.T) {
	// 160 + 320 four-byte runes are 1920 bytes before the wrapper. A byte cap of
	// 1800 renders nothing. A rune cap still fits one lesson.
	lesson := Lesson{
		ID: 1, Kind: "positive", Support: 1,
		Cue:    strings.Repeat("𠀋", 160),
		Action: strings.Repeat("𠀋", 320),
	}
	block, ids := RenderLessons([]Lesson{lesson}, 1800)
	if block == "" || len(ids) != 1 || ids[0] != 1 {
		t.Fatalf("rune cap dropped a lesson that fits in characters: bytes=%d ids=%v", len(block), ids)
	}
	if !utf8.ValidString(block) {
		t.Fatal("rendered block is not valid UTF-8")
	}
}

func TestTaskLessonsUsesTaskScopeAndRanksCompanyFirst(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	cs := d.Companies()
	companyA, _, err := cs.UpsertCompany(fmt.Sprintf("LessonCoA %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyA) })
	companyB, _, err := cs.UpsertCompany(fmt.Sprintf("LessonCoB %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyB) })

	taskA, err := d.CreateTaskWithOptions("lesson scope A", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-a-%d", stamp), CompanyIDs: []int64{companyA},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task A", d.DeleteTask(taskA.ID)) })
	taskB, err := d.CreateTaskWithOptions("lesson scope B", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-b-%d", stamp), CompanyIDs: []int64{companyB},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task B", d.DeleteTask(taskB.ID)) })

	genericKey := fmt.Sprintf("lesson-generic-%d", stamp)
	aKey := fmt.Sprintf("lesson-a-%d", stamp)
	bKey := fmt.Sprintf("lesson-b-%d", stamp)
	var genericID, aID, bID int64
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action,company_id)
		VALUES ($1,'positive','xss','company A prior',$2) RETURNING id`, aKey, companyA).Scan(&aID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, aID) })
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action,company_id)
		VALUES ($1,'positive','xss','company B prior',$2) RETURNING id`, bKey, companyB).Scan(&bID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, bID) })
	// Generic last: without the company rank term, id DESC would put this first.
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action,company_id)
		VALUES ($1,'positive','xss','generic prior',NULL) RETURNING id`, genericKey).Scan(&genericID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, genericID) })

	got, err := d.TaskLessons(t.Context(), taskA.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	var sawGeneric, sawA, sawB bool
	if len(got) == 0 {
		t.Fatal("task A saw no lessons")
	}
	if got[0].ID != aID {
		t.Fatalf("company-scoped lesson should rank first, got id=%d company=%d (want %d)", got[0].ID, got[0].CompanyID, aID)
	}
	for _, l := range got {
		switch l.ID {
		case genericID:
			sawGeneric = true
		case aID:
			sawA = true
		case bID:
			sawB = true
		}
	}
	if !sawA || sawGeneric {
		t.Fatalf("task A should see its company lesson only, sawA=%v sawGeneric=%v", sawA, sawGeneric)
	}
	if sawB {
		t.Fatal("task A saw company B's lesson")
	}

	bare, err := d.CreateTaskWithOptions("lesson scope none", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-none-%d", stamp),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task none", d.DeleteTask(bare.ID)) })
	gotNone, err := d.TaskLessons(t.Context(), bare.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	sawGeneric = false
	for _, l := range gotNone {
		switch l.ID {
		case genericID:
			sawGeneric = true
		case aID, bID:
			t.Fatalf("company-less task saw company lesson %d", l.ID)
		}
	}
	if !sawGeneric {
		t.Fatal("company-less task should see the generic lesson")
	}

	gotB, err := d.TaskLessons(t.Context(), taskB.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range gotB {
		if l.ID == aID {
			t.Fatal("task B saw company A's lesson")
		}
	}
}

func TestExtractLessonsScopesSingleCompanyFromTaskScope(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	companyID, _, err := d.Companies().UpsertCompany(fmt.Sprintf("LessonExtract %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyID) })
	task, err := d.CreateTaskWithOptions("extract scope", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-extract-%d", stamp), CompanyIDs: []int64{companyID},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "extract task", d.DeleteTask(task.ID)) })
	var extractedFID int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,'xss','Reflected XSS','reflected in search','high','confirmed')
		RETURNING id`, task.ID).Scan(&extractedFID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, extractedFID) })
	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("extracted=%d, want 1", n)
	}
	lessons, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(lessons) == 0 {
		t.Fatal("no lessons after extract")
	}
	var scoped *Lesson
	for i := range lessons {
		if lessons[i].CompanyID == companyID {
			scoped = &lessons[i]
			break
		}
	}
	if scoped == nil {
		t.Fatalf("extracted lesson was not scoped to company %d: %+v", companyID, lessons)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, scoped.ID) })
}

func TestExtractLessonsSkipsMultiCompanyTask(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	cs := d.Companies()
	companyA, _, err := cs.UpsertCompany(fmt.Sprintf("LessonMultiA %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyA) })
	companyB, _, err := cs.UpsertCompany(fmt.Sprintf("LessonMultiB %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyB) })

	task, err := d.CreateTaskWithOptions("extract multi company", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-multi-%d", stamp), CompanyIDs: []int64{companyA, companyB},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "multi-company task", d.DeleteTask(task.ID)) })
	findingID := insertLessonFinding(t, d, task.ID, "confirmed")

	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("extracted=%d, want 0 for a multi-company task", n)
	}
	var evidence int
	if err := d.QueryRow(`
		SELECT COUNT(*) FROM rsi_lesson_evidence
		WHERE source_kind='finding' AND source_id=$1`, findingID).Scan(&evidence); err != nil {
		t.Fatal(err)
	}
	if evidence != 0 {
		t.Fatalf("multi-company extract wrote %d evidence rows", evidence)
	}
}

func TestExtractLessonsGenericWhenTaskHasNoCompany(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTaskWithOptions("extract no company", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-nocompany-%d", stamp),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "no-company task", d.DeleteTask(task.ID)) })
	findingID := insertLessonFinding(t, d, task.ID, "confirmed")

	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("extracted=%d, want 1", n)
	}
	var lessonID, companyID int64
	if err := d.QueryRow(`
		SELECT l.id, COALESCE(l.company_id,0)
		FROM rsi_lessons l
		JOIN rsi_lesson_evidence e ON e.lesson_id=l.id
		WHERE e.source_kind='finding' AND e.source_id=$1`, findingID).Scan(&lessonID, &companyID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, lessonID) })
	if companyID != 0 {
		t.Fatalf("no-company extract scoped lesson to company %d", companyID)
	}
}

func TestTaskLessonsRanksCategoryBeforeGeneric(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	category, err := d.CreateTaskCategory(fmt.Sprintf("LessonCat %d", stamp))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := d.DeleteTaskCategory(category.ID)
		cleanupErr(t, "category", err)
	})
	task, err := d.CreateTaskWithOptions("lesson category rank", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-cat-%d", stamp), CategoryID: &category.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "category task", d.DeleteTask(task.ID)) })

	var catID, genericID int64
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action,category_id)
		VALUES ($1,'positive','xss','category prior',$2) RETURNING id`,
		fmt.Sprintf("lesson-cat-%d", stamp), category.ID).Scan(&catID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, catID) })
	// Generic last: without the category rank term, id DESC would put this first.
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action)
		VALUES ($1,'positive','xss','generic prior') RETURNING id`,
		fmt.Sprintf("lesson-cat-generic-%d", stamp)).Scan(&genericID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, genericID) })

	got, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 {
		t.Fatal("categorized task saw no lessons")
	}
	if got[0].ID != catID {
		t.Fatalf("category-scoped lesson should rank first, got id=%d category=%d (want %d)",
			got[0].ID, got[0].CategoryID, catID)
	}
	var sawCat, sawGeneric bool
	for _, l := range got {
		switch l.ID {
		case catID:
			sawCat = true
		case genericID:
			sawGeneric = true
		}
	}
	if !sawCat || !sawGeneric {
		t.Fatalf("want category and generic lessons, sawCat=%v sawGeneric=%v", sawCat, sawGeneric)
	}
}

func TestLogLessonUsageRecordsOnlyRendered(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTaskWithOptions("lesson usage", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-usage-%d", stamp),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "usage task", d.DeleteTask(task.ID)) })

	var firstID, secondID int64
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action)
		VALUES ($1,'positive','xss',$2) RETURNING id`,
		fmt.Sprintf("lesson-usage-a-%d", stamp),
		"Confirmed xss: "+strings.Repeat("a", 80)).Scan(&firstID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, firstID) })
	if err := d.QueryRow(`
		INSERT INTO rsi_lessons(dedupe_key,kind,cue,action)
		VALUES ($1,'negative','ssrf',$2) RETURNING id`,
		fmt.Sprintf("lesson-usage-b-%d", stamp),
		"Do not re-report: "+strings.Repeat("b", 80)).Scan(&secondID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, secondID) })

	lessons := []Lesson{
		{ID: firstID, Kind: "positive", Cue: "xss", Action: "Confirmed xss: " + strings.Repeat("a", 80), Support: 1},
		{ID: secondID, Kind: "negative", Cue: "ssrf", Action: "Do not re-report: " + strings.Repeat("b", 80), Support: 1},
	}
	_, ids := RenderLessons(lessons, 250)
	if len(ids) != 1 || ids[0] != firstID {
		t.Fatalf("rendered IDs=%v, want only %d", ids, firstID)
	}
	if err := d.LogLessonUsage(t.Context(), task.ID, ids, "shadow"); err != nil {
		t.Fatal(err)
	}

	rows, err := d.Query(`SELECT lesson_id FROM rsi_lesson_usage WHERE task_id=$1 ORDER BY lesson_id`, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var logged []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		logged = append(logged, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(logged) != 1 || logged[0] != firstID {
		t.Fatalf("usage log=%v, want only rendered lesson %d (dropped %d)", logged, firstID, secondID)
	}
}

func insertLessonFinding(t *testing.T, d *DB, taskID int64, status string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,'xss','Reflected XSS','reflected in search','high',$2)
		RETURNING id`, taskID, status).Scan(&id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, id) })
	return id
}

func TestExtractLessonsRetractsReversedDisposition(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson retract %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-retract-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("first extract=%d, want 1", n)
	}
	first, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	var pos *Lesson
	for i := range first {
		if first[i].Kind == "positive" && strings.Contains(first[i].Action, label) {
			pos = &first[i]
			break
		}
	}
	if pos == nil {
		t.Fatalf("no positive lesson: %+v", first)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })
	posID := pos.ID

	if _, err := d.SetFindingStatus(fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}

	var posStatus string
	var posSupport int
	if err := d.QueryRow(`SELECT status,
		(SELECT COUNT(*) FROM rsi_lesson_evidence e WHERE e.lesson_id=rsi_lessons.id AND e.withdrawn_at IS NULL)
		FROM rsi_lessons WHERE id=$1`, posID).Scan(&posStatus, &posSupport); err != nil {
		t.Fatal(err)
	}
	if posStatus != "retired" || posSupport != 0 {
		t.Fatalf("positive after FP: status=%s support=%d", posStatus, posSupport)
	}
	var withdrawn int
	if err := d.QueryRow(`SELECT COUNT(*) FROM rsi_lesson_evidence
		WHERE lesson_id=$1 AND withdrawn_at IS NOT NULL`, posID).Scan(&withdrawn); err != nil {
		t.Fatal(err)
	}
	if withdrawn != 1 {
		t.Fatalf("withdrawn evidence rows=%d, want the finding kept on the lesson", withdrawn)
	}

	afterFP, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	var neg *Lesson
	for i := range afterFP {
		if afterFP[i].ID == posID {
			t.Fatal("retired positive still selected")
		}
		if afterFP[i].Kind == "negative" && strings.Contains(afterFP[i].Action, label) {
			neg = &afterFP[i]
		}
	}
	if neg == nil {
		t.Fatalf("no negative lesson after FP: %+v", afterFP)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, neg.ID) })

	if _, err := d.SetFindingStatus(fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}

	if err := d.QueryRow(`SELECT status,
		(SELECT COUNT(*) FROM rsi_lesson_evidence e WHERE e.lesson_id=rsi_lessons.id AND e.withdrawn_at IS NULL)
		FROM rsi_lessons WHERE id=$1`, posID).Scan(&posStatus, &posSupport); err != nil {
		t.Fatal(err)
	}
	if posStatus != "candidate" || posSupport != 1 {
		t.Fatalf("positive after re-confirm: status=%s support=%d", posStatus, posSupport)
	}

	var negStatus string
	var negSupport int
	if err := d.QueryRow(`SELECT status,
		(SELECT COUNT(*) FROM rsi_lesson_evidence e WHERE e.lesson_id=rsi_lessons.id AND e.withdrawn_at IS NULL)
		FROM rsi_lessons WHERE id=$1`, neg.ID).Scan(&negStatus, &negSupport); err != nil {
		t.Fatal(err)
	}
	if negStatus != "retired" || negSupport != 0 {
		t.Fatalf("negative after re-confirm: status=%s support=%d", negStatus, negSupport)
	}
}

func TestExtractLessonsRetireOnlyWhenLastEvidence(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson shared retract %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-shared-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var aID, bID int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&aID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, aID) })
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&bID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, bID) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	lessons, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	var pos *Lesson
	for i := range lessons {
		if lessons[i].Kind == "positive" && strings.Contains(lessons[i].Action, label) {
			pos = &lessons[i]
			break
		}
	}
	if pos == nil {
		t.Fatalf("no shared positive lesson: %+v", lessons)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })
	if pos.Support != 2 {
		t.Fatalf("shared support=%d, want 2", pos.Support)
	}

	if _, err := d.SetFindingStatus(aID, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}

	var status string
	var support int
	if err := d.QueryRow(`SELECT status,
		(SELECT COUNT(*) FROM rsi_lesson_evidence e WHERE e.lesson_id=rsi_lessons.id AND e.withdrawn_at IS NULL)
		FROM rsi_lessons WHERE id=$1`, pos.ID).Scan(&status, &support); err != nil {
		t.Fatal(err)
	}
	if status == "retired" || support != 1 {
		t.Fatalf("shared positive should stay active with support 1, got status=%s support=%d", status, support)
	}

	after, err := d.TaskLessons(t.Context(), task.ID, 8)
	if err != nil {
		t.Fatal(err)
	}
	var sawNeg bool
	for i := range after {
		if after[i].ID == pos.ID && after[i].Kind == "positive" {
			if after[i].Support != 1 {
				t.Fatalf("selected support=%d, want 1", after[i].Support)
			}
		}
		if after[i].Kind == "negative" && strings.Contains(after[i].Action, label) {
			sawNeg = true
			t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, after[i].ID) })
		}
	}
	if !sawNeg {
		t.Fatalf("expected a negative lesson for the flipped finding: %+v", after)
	}
}

func TestExtractLessonsRetractsAllRetests(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson all retests %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-all-retest-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	r1 := insertLessonRetest(t, d, fid, "reproduced")
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	reproduced := findLessonByAction(t, d, task.ID, "positive", "Reproduced", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, reproduced.ID) })
	confirmed := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, confirmed.ID) })
	if positiveRetestEvidence(t, d, r1) != 1 {
		t.Fatal("first retest was not extracted")
	}

	r2 := insertLessonRetest(t, d, fid, "fixed")
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	caution := findLessonByAction(t, d, task.ID, "caution", "Recheck", cue)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, caution.ID) })
	if positiveRetestEvidence(t, d, r1) != 1 {
		t.Fatal("older reproduced retest lost its evidence after a later fixed retest")
	}

	if _, err := d.SetFindingStatus(fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if n := positiveRetestEvidence(t, d, r1); n != 0 {
		t.Fatalf("older retest still has %d positive evidence rows after FP", n)
	}
	if n := positiveRetestEvidence(t, d, r2); n != 0 {
		t.Fatalf("latest retest still has %d positive evidence rows after FP", n)
	}
	status, support := lessonStatusSupport(t, d, reproduced.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("reproduced retest lesson after FP: status=%s support=%d", status, support)
	}
	status, support = lessonStatusSupport(t, d, confirmed.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("confirmed lesson after FP: status=%s support=%d", status, support)
	}
	neg := findLessonByAction(t, d, task.ID, "negative", "Do not re-report", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, neg.ID) })
}

func TestExtractLessonsDoesNotUnretireWithEvidence(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson keep retired %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-keep-retired-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	pos := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })

	if _, err := d.Exec(`UPDATE rsi_lessons SET status='retired' WHERE id=$1`, pos.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	status, support := lessonStatusSupport(t, d, pos.ID)
	if status != "retired" {
		t.Fatalf("operator-retired lesson with evidence became %s", status)
	}
	if support != 1 {
		t.Fatalf("support=%d, want 1", support)
	}
}

func TestExtractLessonsLeavesAdopted(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson keep adopted %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-keep-adopted-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	pos := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })

	if _, err := d.Exec(`UPDATE rsi_lessons SET status='adopted' WHERE id=$1`, pos.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	status, _ := lessonStatusSupport(t, d, pos.ID)
	if status != "adopted" {
		t.Fatalf("adopted lesson became %s", status)
	}
}

func TestExtractLessonsReopenRetractsNothing(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson reopen %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })

	cue := fmt.Sprintf("xss-reopen-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	pos := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })

	if _, err := d.SetFindingStatus(fid, FindingPending); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	status, support := lessonStatusSupport(t, d, pos.ID)
	if status != "candidate" || support != 1 {
		t.Fatalf("reopened finding retracted the lesson: status=%s support=%d", status, support)
	}
}

func TestDispositionChangeExtractsLessons(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson on patch %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-patch-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	pos := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })

	if _, _, _, err := d.SetFindingStatusWithNotify(context.Background(), fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	status, support := lessonStatusSupport(t, d, pos.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("status change did not retract: status=%s support=%d", status, support)
	}
	neg := findLessonByAction(t, d, task.ID, "negative", "Do not re-report", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, neg.ID) })
	if !strings.Contains(neg.Action, "false_positive") {
		t.Fatalf("negative action=%q", neg.Action)
	}
}

func TestNegativeStatusReplacesPriorNegativeLesson(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson neg fork %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-neg-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','false_positive')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	first := findLessonByAction(t, d, task.ID, "negative", "false_positive", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, first.ID) })

	if _, err := d.SetFindingStatus(fid, FindingDuplicate); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	status, support := lessonStatusSupport(t, d, first.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("prior negative lesson: status=%s support=%d", status, support)
	}
	second := findLessonByAction(t, d, task.ID, "negative", "duplicate", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, second.ID) })
	if second.ID == first.ID {
		t.Fatal("status change inside the negative group reused the old lesson")
	}
}

func TestMultiCompanyExtractStillRetracts(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		t.Skipf("postgres unavailable (%v) — skipping", err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	cs := d.Companies()
	companyA, _, err := cs.UpsertCompany(fmt.Sprintf("LessonRetractA %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyA) })
	companyB, _, err := cs.UpsertCompany(fmt.Sprintf("LessonRetractB %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyB) })
	task, err := d.CreateTaskWithOptions("extract then multi", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-retract-multi-%d", stamp), CompanyIDs: []int64{companyA},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-multi-retract-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	pos := findLessonByAction(t, d, task.ID, "positive", "Confirmed", label)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE id=$1`, pos.ID) })

	if _, err := d.Exec(`INSERT INTO task_scope(task_id, kind, company_id, source) VALUES ($1,'company',$2,'manual')`, task.ID, companyB); err != nil {
		t.Fatal(err)
	}
	if _, err := d.SetFindingStatus(fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("multi-company extract wrote %d lessons", n)
	}
	status, support := lessonStatusSupport(t, d, pos.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("lesson after the task gained a second company: status=%s support=%d", status, support)
	}
}

// A second company stops new writes, but the disposition did not change: the
// negative lesson written while the task had one company keeps its evidence.
func TestMultiCompanyExtractKeepsUnchangedNegative(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	cs := d.Companies()
	companyA, _, err := cs.UpsertCompany(fmt.Sprintf("LessonKeepNegA %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyA) })
	companyB, _, err := cs.UpsertCompany(fmt.Sprintf("LessonKeepNegB %d", stamp), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupCompany(d, companyB) })
	task, err := d.CreateTaskWithOptions("negative then multi", "goal", TaskCreateOptions{
		Name: fmt.Sprintf("lesson-keep-neg-%d", stamp), CompanyIDs: []int64{companyA},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-keep-neg-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE cue=$1`, cue) })
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','false_positive')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	neg := findLessonByAction(t, d, task.ID, "negative", "false_positive", label)
	if _, err := d.Exec(`UPDATE rsi_lessons SET status='adopted' WHERE id=$1`, neg.ID); err != nil {
		t.Fatal(err)
	}

	if _, err := d.Exec(`INSERT INTO task_scope(task_id, kind, company_id, source) VALUES ($1,'company',$2,'manual')`, task.ID, companyB); err != nil {
		t.Fatal(err)
	}
	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("multi-company extract wrote %d lessons", n)
	}
	status, support := lessonStatusSupport(t, d, neg.ID)
	if status != "adopted" || support != 1 {
		t.Fatalf("unchanged negative after a second company: status=%s support=%d, want adopted 1", status, support)
	}

	// A status change inside the negative group still withdraws it.
	if _, err := d.SetFindingStatus(fid, FindingDuplicate); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	status, support = lessonStatusSupport(t, d, neg.ID)
	if status != "retired" || support != 0 {
		t.Fatalf("negative after false_positive -> duplicate: status=%s support=%d, want retired 0", status, support)
	}
}

// liveNegativeLesson returns the one negative lesson that holds this finding as
// live evidence.
func liveNegativeLesson(t *testing.T, d *DB, findingID int64) (id int64, key, action string) {
	t.Helper()
	if err := d.QueryRow(`
		SELECT l.id, l.dedupe_key, l.action FROM rsi_lessons l
		JOIN rsi_lesson_evidence e ON e.lesson_id=l.id
		WHERE l.kind='negative' AND e.source_kind='finding' AND e.source_id=$1
		  AND e.withdrawn_at IS NULL`, findingID).Scan(&id, &key, &action); err != nil {
		t.Fatalf("live negative lesson of finding %d: %v", findingID, err)
	}
	return id, key, action
}

// A summary long enough to fill the action cap must not cut the status off:
// false_positive and duplicate would then share one action and one key.
func TestNegativeStatusSurvivesActionCap(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson long summary %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-long-%d", stamp)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE cue=$1`, cue) })
	summary := fmt.Sprintf("long-%d-", stamp)
	summary += strings.Repeat("x", 300-utf8.RuneCountInString(summary))
	if n := utf8.RuneCountInString(summary); n != 300 {
		t.Fatalf("summary has %d runes, want 300", n)
	}
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','false_positive')
		RETURNING id`, task.ID, cue, summary).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	firstID, firstKey, firstAction := liveNegativeLesson(t, d, fid)

	if _, err := d.SetFindingStatus(fid, FindingDuplicate); err != nil {
		t.Fatal(err)
	}
	n, err := d.ExtractLessonsForTask(t.Context(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("duplicate extract wrote %d lessons, want 1", n)
	}
	secondID, secondKey, secondAction := liveNegativeLesson(t, d, fid)
	if secondID == firstID || secondKey == firstKey {
		t.Fatalf("false_positive and duplicate share lesson %d / key %s", secondID, secondKey)
	}
	if !strings.HasSuffix(firstAction, "(prior false_positive)") {
		t.Fatalf("false_positive action lost its status: %q", firstAction)
	}
	if !strings.HasSuffix(secondAction, "(prior duplicate)") {
		t.Fatalf("duplicate action lost its status: %q", secondAction)
	}
	if n := utf8.RuneCountInString(secondAction); n > lessonActionMax {
		t.Fatalf("action has %d runes, cap is %d", n, lessonActionMax)
	}
	status, support := lessonStatusSupport(t, d, firstID)
	if status != "retired" || support != 0 {
		t.Fatalf("false_positive lesson after duplicate: status=%s support=%d, want retired 0", status, support)
	}
}

// A pending or in-progress finding has no outcome yet, so even a completed
// retest on it writes no caution.
func TestCautionNeedsFindingOutcome(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson caution open %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-caution-open-%d", stamp)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE cue=$1`, cue) })

	for _, status := range []string{FindingPending, FindingInProgress} {
		var fid int64
		if err := d.QueryRow(`
			INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
			VALUES ($1,$2,'Reflected XSS','reflected in search','high',$3)
			RETURNING id`, task.ID, cue, status).Scan(&fid); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
		for _, verdict := range []string{"fixed", "inconclusive"} {
			rid := insertLessonRetestStatus(t, d, fid, "completed", verdict)
			if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
				t.Fatal(err)
			}
			if n := retestEvidence(t, d, rid); n != 0 {
				t.Fatalf("finding status=%s, completed %s retest wrote %d evidence rows", status, verdict, n)
			}
		}
	}
	var lessons int
	if err := d.QueryRow(`SELECT COUNT(*) FROM rsi_lessons WHERE cue=$1`, cue).Scan(&lessons); err != nil {
		t.Fatal(err)
	}
	if lessons != 0 {
		t.Fatalf("open findings produced %d lessons", lessons)
	}
}

// A reversed disposition withdraws the finding's evidence, and a caution from
// its retest is part of that evidence. Confirming again restores it.
func TestFalsePositiveWithdrawsRetestCaution(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson caution fp %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-caution-fp-%d", stamp)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE cue=$1`, cue) })
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS','reflected in search','high','confirmed')
		RETURNING id`, task.ID, cue).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })
	insertLessonRetestStatus(t, d, fid, "completed", "inconclusive")

	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	caution := findLessonByAction(t, d, task.ID, "caution", "Recheck", cue)
	if status, support := lessonStatusSupport(t, d, caution.ID); status != "candidate" || support != 1 {
		t.Fatalf("caution after confirmed: status=%s support=%d, want candidate 1", status, support)
	}

	if _, err := d.SetFindingStatus(fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if status, support := lessonStatusSupport(t, d, caution.ID); status != "retired" || support != 0 {
		t.Fatalf("caution after false_positive: status=%s support=%d, want retired 0", status, support)
	}

	if _, err := d.SetFindingStatus(fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if status, support := lessonStatusSupport(t, d, caution.ID); status != "candidate" || support != 1 {
		t.Fatalf("caution after re-confirm: status=%s support=%d, want candidate 1", status, support)
	}
}

func insertLessonRetest(t *testing.T, d *DB, findingID int64, verdict string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`
		INSERT INTO finding_retests(finding_id,status,verdict,snapshot)
		VALUES ($1,'completed',$2,'{}'::jsonb)
		RETURNING id`, findingID, verdict).Scan(&id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM finding_retests WHERE id=$1`, id) })
	return id
}

func insertLessonRetestStatus(t *testing.T, d *DB, findingID int64, status, verdict string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`
		INSERT INTO finding_retests(finding_id,status,verdict,snapshot)
		VALUES ($1,$2,$3,'{}'::jsonb)
		RETURNING id`, findingID, status, verdict).Scan(&id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM finding_retests WHERE id=$1`, id) })
	return id
}

// retestEvidence counts every evidence row of this retest, live or withdrawn,
// in lessons of any kind.
func retestEvidence(t *testing.T, d *DB, retestID int64) int {
	t.Helper()
	var n int
	if err := d.QueryRow(`
		SELECT COUNT(*) FROM rsi_lesson_evidence
		WHERE source_kind='retest' AND source_id=$1`, retestID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// A staged verdict on a retest that did not complete is not an outcome:
// FinishFindingRetest turns completed-without-verdict into failed, and a
// stopped or failed retest keeps whatever verdict the agent staged.
func TestExtractLessonsIgnoresUnfinishedRetests(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("lesson unfinished retest %d", stamp), "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupErr(t, "task", d.DeleteTask(task.ID)) })
	cue := fmt.Sprintf("xss-unfinished-%d", stamp)
	label := fmt.Sprintf("reflected in search %d", stamp)
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM rsi_lessons WHERE cue=$1`, cue) })
	var fid int64
	if err := d.QueryRow(`
		INSERT INTO findings(task_id,vulnclass,name,summary,severity,status)
		VALUES ($1,$2,'Reflected XSS',$3,'high','confirmed')
		RETURNING id`, task.ID, cue, label).Scan(&fid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM findings WHERE id=$1`, fid) })

	for _, status := range []string{"pending", "running", "failed", "stopped"} {
		for _, verdict := range []string{"reproduced", "fixed", "inconclusive"} {
			rid := insertLessonRetestStatus(t, d, fid, status, verdict)
			if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
				t.Fatal(err)
			}
			if n := retestEvidence(t, d, rid); n != 0 {
				t.Fatalf("retest status=%s verdict=%s wrote %d evidence rows", status, verdict, n)
			}
			if status == "pending" || status == "running" {
				// idx_finding_retests_active allows one active retest per finding.
				cleanupExec(t, d, `DELETE FROM finding_retests WHERE id=$1`, rid)
			}
		}
	}
	var retestLessons int
	if err := d.QueryRow(`SELECT COUNT(*) FROM rsi_lessons
		WHERE cue=$1 AND (kind='caution' OR action LIKE 'Reproduced %')`, cue).Scan(&retestLessons); err != nil {
		t.Fatal(err)
	}
	if retestLessons != 0 {
		t.Fatalf("unfinished retests produced %d lessons", retestLessons)
	}

	done := insertLessonRetestStatus(t, d, fid, "completed", "reproduced")
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if n := positiveRetestEvidence(t, d, done); n != 1 {
		t.Fatalf("completed reproduced retest: positive evidence=%d, want 1", n)
	}
	findLessonByAction(t, d, task.ID, "positive", "Reproduced", label)

	// A later unfinished retest does not hide the completed one.
	insertLessonRetestStatus(t, d, fid, "running", "fixed")
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if n := positiveRetestEvidence(t, d, done); n != 1 {
		t.Fatalf("completed retest after a running one: positive evidence=%d, want 1", n)
	}

	inconclusive := insertLessonRetestStatus(t, d, fid, "completed", "inconclusive")
	if _, err := d.ExtractLessonsForTask(t.Context(), task.ID); err != nil {
		t.Fatal(err)
	}
	if n := retestEvidence(t, d, inconclusive); n != 1 {
		t.Fatalf("completed inconclusive retest: evidence=%d, want 1", n)
	}
	findLessonByAction(t, d, task.ID, "caution", "Recheck", cue)
}

func findLessonByAction(t *testing.T, d *DB, taskID int64, kind, actionPrefix, label string) *Lesson {
	t.Helper()
	lessons, err := d.TaskLessons(t.Context(), taskID, 8)
	if err != nil {
		t.Fatal(err)
	}
	for i := range lessons {
		if lessons[i].Kind == kind && strings.Contains(lessons[i].Action, actionPrefix) && strings.Contains(lessons[i].Action, label) {
			return &lessons[i]
		}
	}
	t.Fatalf("no %s lesson with %q and %q: %+v", kind, actionPrefix, label, lessons)
	return nil
}

func positiveRetestEvidence(t *testing.T, d *DB, retestID int64) int {
	t.Helper()
	var n int
	if err := d.QueryRow(`
		SELECT COUNT(*) FROM rsi_lesson_evidence e
		JOIN rsi_lessons l ON l.id=e.lesson_id
		WHERE e.source_kind='retest' AND e.source_id=$1 AND l.kind='positive'
		  AND e.withdrawn_at IS NULL`, retestID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func lessonStatusSupport(t *testing.T, d *DB, lessonID int64) (status string, support int) {
	t.Helper()
	if err := d.QueryRow(`SELECT status,
		(SELECT COUNT(*) FROM rsi_lesson_evidence e WHERE e.lesson_id=rsi_lessons.id AND e.withdrawn_at IS NULL)
		FROM rsi_lessons WHERE id=$1`, lessonID).Scan(&status, &support); err != nil {
		t.Fatal(err)
	}
	return status, support
}

// Re-confirming a previously withdrawn finding must NOT clear withdrawn_at on
// the old evidence row: the withdrawal row stays for history and re-confirmation
// inserts a new live row (#269).
func TestReconfirmingFindingPreservesWithdrawalHistory(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	task, err := d.CreateTaskWithOptions("withdraw-history", "test withdrawal history", TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	es := d.Exploration(task.ExplorationID)
	rec, err := es.RecordFinding(ctx, RecordFindingInput{
		TaskID:        task.ID,
		ExplorationID: task.ExplorationID,
		VulnClass:     "ssrf",
		Name:          "SSRF on webhook",
		Severity:      "high",
		Summary:       "SSRF on webhook endpoint",
		Worker:        "worker-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	fid := rec.FindingID
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM rsi_lessons WHERE id IN (SELECT lesson_id FROM rsi_lesson_evidence WHERE source_kind='finding' AND source_id=$1)`, fid)
	})

	// 1. Confirm -> positive lesson created with 1 live evidence row.
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	var lessonID, firstRowID int64
	if err := d.QueryRow(`SELECT e.lesson_id, e.id
		FROM rsi_lesson_evidence e JOIN rsi_lessons l ON l.id=e.lesson_id
		WHERE l.kind='positive' AND e.source_kind='finding' AND e.source_id=$1 AND e.withdrawn_at IS NULL`,
		fid).Scan(&lessonID, &firstRowID); err != nil {
		t.Fatalf("positive evidence row: %v", err)
	}

	// 2. Flip to false_positive -> firstRowID gets withdrawn_at set.
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	var withdrawnAt1 sql.NullTime
	if err := d.QueryRow(`SELECT withdrawn_at FROM rsi_lesson_evidence WHERE id=$1`, firstRowID).Scan(&withdrawnAt1); err != nil {
		t.Fatal(err)
	}
	if !withdrawnAt1.Valid {
		t.Fatalf("expected firstRowID=%d to have withdrawn_at set after false_positive", firstRowID)
	}

	// 3. Re-confirm -> old withdrawal row stays untouched, new live row is inserted.
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	var withdrawnAt2 sql.NullTime
	if err := d.QueryRow(`SELECT withdrawn_at FROM rsi_lesson_evidence WHERE id=$1`, firstRowID).Scan(&withdrawnAt2); err != nil {
		t.Fatal(err)
	}
	if !withdrawnAt2.Valid || !withdrawnAt2.Time.Equal(withdrawnAt1.Time) {
		t.Fatalf("old withdrawal row %d was altered: got %v, want %v", firstRowID, withdrawnAt2, withdrawnAt1)
	}

	var secondRowID int64
	if err := d.QueryRow(`SELECT id FROM rsi_lesson_evidence
		WHERE lesson_id=$1 AND source_kind='finding' AND source_id=$2 AND withdrawn_at IS NULL`,
		lessonID, fid).Scan(&secondRowID); err != nil {
		t.Fatalf("new live evidence row missing after re-confirm: %v", err)
	}
	if secondRowID == firstRowID {
		t.Fatalf("re-confirm reused old row %d instead of inserting a new live row", firstRowID)
	}

	// 4. Repeat extraction is idempotent: still 1 live + 1 withdrawn row.
	if _, err := d.ExtractLessonsForTask(ctx, task.ID); err != nil {
		t.Fatal(err)
	}
	var totalRows, liveRows, withdrawnRows int
	if err := d.QueryRow(`SELECT COUNT(*), COUNT(*) FILTER (WHERE withdrawn_at IS NULL), COUNT(*) FILTER (WHERE withdrawn_at IS NOT NULL)
		FROM rsi_lesson_evidence WHERE lesson_id=$1 AND source_kind='finding' AND source_id=$2`,
		lessonID, fid).Scan(&totalRows, &liveRows, &withdrawnRows); err != nil {
		t.Fatal(err)
	}
	if totalRows != 2 || liveRows != 1 || withdrawnRows != 1 {
		t.Fatalf("evidence rows = total %d live %d withdrawn %d, want 2 / 1 / 1", totalRows, liveRows, withdrawnRows)
	}
	if status, support := lessonStatusSupport(t, d, lessonID); status != "candidate" || support != 1 {
		t.Fatalf("lesson status=%s support=%d, want candidate / 1", status, support)
	}
}

// Lesson extraction now runs inside the same transaction as status changes and
// retest completion (#269). If extraction fails, the status / retest write
// rolls back atomically so the DB never ends up with a flipped finding status
// and a stale selectable lesson.
func TestLessonExtractionFailureRollsBackStatusAndRetest(t *testing.T) {
	d := notifyTestDB(t)
	ctx := context.Background()

	task, err := d.CreateTaskWithOptions("lesson-tx-rollback", "test lesson extraction tx rollback", TaskCreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })
	es := d.Exploration(task.ExplorationID)
	rec, err := es.RecordFinding(ctx, RecordFindingInput{
		TaskID:        task.ID,
		ExplorationID: task.ExplorationID,
		VulnClass:     "sqli",
		Name:          "SQLi in filter",
		Severity:      "high",
		Summary:       "Boolean SQLi in filter param",
		Worker:        "worker-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	fid := rec.FindingID
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM rsi_lessons WHERE id IN (SELECT lesson_id FROM rsi_lesson_evidence WHERE source_kind='finding' AND source_id=$1)`, fid)
	})

	// Seed a confirmed finding and its positive lesson.
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingConfirmed); err != nil {
		t.Fatal(err)
	}
	var posLessonID int64
	if err := d.QueryRow(`SELECT e.lesson_id
		FROM rsi_lesson_evidence e JOIN rsi_lessons l ON l.id=e.lesson_id
		WHERE l.kind='positive' AND e.source_kind='finding' AND e.source_id=$1 AND e.withdrawn_at IS NULL`,
		fid).Scan(&posLessonID); err != nil {
		t.Fatalf("positive lesson missing: %v", err)
	}

	injected := errors.New("injected lesson extraction failure")
	prevHook := lessonSyncTxTestHook
	t.Cleanup(func() { lessonSyncTxTestHook = prevHook })

	// 1. Single status path: failure during lesson extraction rolls back status.
	lessonSyncTxTestHook = func(ctx context.Context, tx *sql.Tx, taskID int64) error { return injected }
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingFalsePositive); !errors.Is(err, injected) {
		t.Fatalf("single status err=%v, want %v", err, injected)
	}
	f, err := d.GetFinding(fid)
	if err != nil {
		t.Fatal(err)
	}
	if f.Status != FindingConfirmed {
		t.Fatalf("single status leaked %q after rollback, want %q", f.Status, FindingConfirmed)
	}
	if status, support := lessonStatusSupport(t, d, posLessonID); status != "candidate" || support != 1 {
		t.Fatalf("positive lesson after single rollback: status=%s support=%d, want candidate / 1", status, support)
	}

	// 2. Bulk status path: failure during lesson extraction rolls back status.
	if _, err := d.SetFindingStatusesWithNotify(ctx, []int64{fid}, FindingFalsePositive); !errors.Is(err, injected) {
		t.Fatalf("bulk status err=%v, want %v", err, injected)
	}
	f, err = d.GetFinding(fid)
	if err != nil {
		t.Fatal(err)
	}
	if f.Status != FindingConfirmed {
		t.Fatalf("bulk status leaked %q after rollback, want %q", f.Status, FindingConfirmed)
	}

	// 3. Retest path: failure during lesson extraction rolls back both retest
	// completion and the finding status transition.
	lessonSyncTxTestHook = nil
	retest, conv, _, err := d.CreateFindingRetest(ctx, fid, "verify fix")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteConversation(conv.ID) })
	if _, err := d.StartFindingRetest(ctx, retest.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.RecordFindingRetestResult(ctx, conv.ID, "fixed", "patched", "verified 400 on payload"); err != nil {
		t.Fatal(err)
	}

	lessonSyncTxTestHook = func(ctx context.Context, tx *sql.Tx, taskID int64) error { return injected }
	if err := d.FinishFindingRetest(retest.ID, "completed", ""); !errors.Is(err, injected) {
		t.Fatalf("FinishFindingRetest err=%v, want %v", err, injected)
	}
	f, err = d.GetFinding(fid)
	if err != nil {
		t.Fatal(err)
	}
	if f.Status != FindingConfirmed {
		t.Fatalf("retest status leaked %q after rollback, want %q", f.Status, FindingConfirmed)
	}
	var retestStatus string
	if err := d.QueryRow(`SELECT status FROM finding_retests WHERE id=$1`, retest.ID).Scan(&retestStatus); err != nil {
		t.Fatal(err)
	}
	if retestStatus == "completed" {
		t.Fatalf("retest status committed %q despite lesson extraction rollback", retestStatus)
	}

	// 4. Once extraction succeeds, the status flip and lesson retirement commit together.
	lessonSyncTxTestHook = nil
	if _, _, _, err := d.SetFindingStatusWithNotify(ctx, fid, FindingFalsePositive); err != nil {
		t.Fatal(err)
	}
	f, err = d.GetFinding(fid)
	if err != nil {
		t.Fatal(err)
	}
	if f.Status != FindingFalsePositive {
		t.Fatalf("status=%q after retry, want %q", f.Status, FindingFalsePositive)
	}
	if status, support := lessonStatusSupport(t, d, posLessonID); status != "retired" || support != 0 {
		t.Fatalf("positive lesson after FP commit: status=%s support=%d, want retired / 0", status, support)
	}
}
