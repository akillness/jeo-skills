//go:build linux

package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// ownFSIDs returns the file system uid, file system gid and supplementary groups of
// the calling thread. setfsuid(-1) and setfsgid(-1) change nothing and return the
// current id.
func ownFSIDs() (fsuid, fsgid int, groups []int) {
	fsuid, _ = unix.SetfsuidRetUid(-1)
	fsgid, _ = unix.SetfsgidRetGid(-1)
	groups, _ = unix.Getgroups()
	return fsuid, fsgid, groups
}

// hasExecutorID reports whether the ids of a thread carry any part of the executor
// identity. A process-wide setgroups (the syscall package's) would give the executor
// gid to every thread: the groups are checked as well as the file system ids.
func hasExecutorID(fsuid, fsgid int, groups []int) bool {
	return fsuid == testExecID || fsgid == testExecID || slices.Contains(groups, testExecID)
}

// threadFSUID reads the file system uid of thread tid of this process from
// /proc/self/task/<tid>/status (the fourth id of the Uid line).
func threadFSUID(tid int) (int, error) {
	b, err := os.ReadFile("/proc/self/task/" + strconv.Itoa(tid) + "/status")
	if err != nil {
		return -1, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		if f := strings.Fields(line); len(f) == 5 && f[0] == "Uid:" {
			return strconv.Atoi(f[4])
		}
	}
	return -1, fmt.Errorf("no Uid line for thread %d", tid)
}

// threadsWithFSUID lists the threads of this process whose file system uid is uid.
func threadsWithFSUID(t *testing.T, uid int) []int {
	t.Helper()
	entries, err := os.ReadDir("/proc/self/task")
	if err != nil {
		t.Fatal(err)
	}
	var tids []int
	for _, e := range entries {
		tid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		if got, err := threadFSUID(tid); err == nil && got == uid {
			tids = append(tids, tid)
		}
	}
	return tids
}

// waitNoExecutorThread waits until no thread of the process has the executor's file
// system uid, apart from the main thread when a file tool goroutine ran there: the
// runtime parks a locked main thread for good instead of ending it, and no goroutine
// runs on it again. A thread ends shortly after its goroutine returns, not at once.
func waitNoExecutorThread(t *testing.T) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var left []int
		for _, tid := range threadsWithFSUID(t, testExecID) {
			if tid != os.Getpid() {
				left = append(left, tid)
			}
		}
		if len(left) == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("threads %v still have the executor's file system uid after the file tool calls returned", left)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// waitThreadGone waits until thread tid has ended. The main thread is parked instead
// (see waitNoExecutorThread) and is accepted as is.
func waitThreadGone(t *testing.T, tid int) {
	t.Helper()
	if tid == os.Getpid() {
		t.Logf("the file tool goroutine ran on the main thread %d, which the runtime parks for good", tid)
		return
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, err := os.Stat("/proc/self/task/" + strconv.Itoa(tid)); os.IsNotExist(err) {
			return
		}
		if time.Now().After(deadline) {
			fsuid, _ := threadFSUID(tid)
			t.Fatalf("the file tool thread %d is still alive (file system uid %d): it may be reused", tid, fsuid)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// While a file tool call holds the executor identity, it is the identity of that
// call's thread only. The call itself sees file system uid and gid 10001, the
// executor gid as its only group, and is refused the root-only file. At the same
// moment the caller's thread, 32 goroutines locked on other threads and every other
// thread of the process listed in /proc keep uid 0 and root's access. Goroutines the
// call starts run on other threads (new threads are cloned by the runtime's template
// thread, never from a locked one) and do not get the identity either: everything a
// file tool opens has to be opened on the call's own goroutine, which filetools.go,
// bbot_ingest_tool.go and scan_ingest_tool.go do. After the call the thread ends.
func TestFileToolIdentityScopedToItsThreadAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	callerTid := unix.Gettid()
	callerUID, callerGID, callerGroups := ownFSIDs()
	if callerUID != 0 || hasExecutorID(callerUID, callerGID, callerGroups) {
		t.Fatalf("the test thread starts with fsuid %d fsgid %d groups %v, want root's without the executor's", callerUID, callerGID, callerGroups)
	}

	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})

	var (
		toolTid, toolUID, toolGID, toolProcUID int
		toolGroups                             []int
		toolReadErr                            error
		childMu                                sync.Mutex
		childUIDs                              = map[int]int{} // tid -> fsuid
	)
	inside, release := make(chan struct{}), make(chan struct{})
	callErr := make(chan error, 1)
	go func() {
		callErr <- RunAsFileToolIdentity(func() {
			toolTid = unix.Gettid()
			toolUID, toolGID, toolGroups = ownFSIDs()
			toolProcUID, _ = threadFSUID(toolTid)
			_, toolReadErr = os.ReadFile(f.rootOnly)
			const children = 8
			var ready, done sync.WaitGroup
			ready.Add(children)
			done.Add(children)
			for i := 0; i < children; i++ {
				go func() {
					defer done.Done()
					runtime.LockOSThread()
					defer runtime.UnlockOSThread()
					ready.Done()
					ready.Wait() // all eight locked at once: at least some are new threads
					uid, _, _ := ownFSIDs()
					childMu.Lock()
					childUIDs[unix.Gettid()] = uid
					childMu.Unlock()
				}()
			}
			done.Wait()
			close(inside)
			<-release
		})
	}()
	<-inside

	// The identity is held now.
	if toolUID != testExecID || toolGID != testExecID || len(toolGroups) != 1 || toolGroups[0] != testExecID || toolProcUID != testExecID {
		t.Errorf("inside the call: fsuid %d (proc %d) fsgid %d groups %v, want %d everywhere", toolUID, toolProcUID, toolGID, toolGroups, testExecID)
	}
	if !os.IsPermission(toolReadErr) {
		t.Errorf("inside the call the root-only file: %v, want permission denied", toolReadErr)
	}
	if toolTid == callerTid {
		t.Errorf("the call ran on the caller's thread %d", toolTid)
	}
	for tid, uid := range childUIDs {
		if tid == toolTid || uid != 0 {
			t.Errorf("a goroutine started inside the call ran on thread %d with file system uid %d, want another thread with 0", tid, uid)
		}
	}
	if uid, gid, groups := ownFSIDs(); uid != callerUID || gid != callerGID || fmt.Sprint(groups) != fmt.Sprint(callerGroups) || hasExecutorID(uid, gid, groups) {
		t.Errorf("the caller's thread changed during the call: fsuid %d fsgid %d groups %v", uid, gid, groups)
	}
	const observers = 32
	var wg sync.WaitGroup
	for i := 0; i < observers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			runtime.LockOSThread()
			defer runtime.UnlockOSThread()
			tid := unix.Gettid()
			uid, gid, groups := ownFSIDs()
			if tid == toolTid || uid != 0 || gid != callerGID || fmt.Sprint(groups) != fmt.Sprint(callerGroups) || hasExecutorID(uid, gid, groups) {
				t.Errorf("observer on thread %d (call thread %d) during the call: fsuid %d fsgid %d groups %v", tid, toolTid, uid, gid, groups)
			}
			if _, err := os.ReadFile(f.rootOnly); err != nil {
				t.Errorf("observer on thread %d lost root's access during the call: %v", tid, err)
			}
		}()
	}
	wg.Wait()
	var holders []int
	for _, tid := range threadsWithFSUID(t, testExecID) {
		if tid != os.Getpid() || tid == toolTid { // a main thread parked by an earlier call is not counted
			holders = append(holders, tid)
		}
	}
	if len(holders) != 1 || holders[0] != toolTid {
		t.Errorf("threads with the executor's file system uid during the call: %v, want only the call's thread %d", holders, toolTid)
	}

	close(release)
	if err := <-callErr; err != nil {
		t.Fatal(err)
	}
	waitThreadGone(t, toolTid)
	waitNoExecutorThread(t)
}

// A panic inside a file tool call is raised again in the caller, which keeps uid 0;
// the thread that held the identity ends instead of going back to the runtime's
// pool. runtime.Goexit inside the call (t.FailNow, for one) ends it the same way.
// The identity setting itself is untouched: the next call runs as the executor.
func TestFileToolIdentityPanicAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})

	var panicTid, panicUID int
	func() {
		defer func() {
			if r := recover(); r != "boom inside the file tool" {
				t.Fatalf("recovered %v, want the panic of the call", r)
			}
		}()
		_ = RunAsFileToolIdentity(func() {
			panicTid = unix.Gettid()
			panicUID, _, _ = ownFSIDs()
			panic("boom inside the file tool")
		})
		t.Fatal("the panic did not reach the caller")
	}()
	if panicUID != testExecID {
		t.Fatalf("the call that panicked ran with file system uid %d, want %d", panicUID, testExecID)
	}
	if uid, gid, groups := ownFSIDs(); uid != 0 || hasExecutorID(uid, gid, groups) {
		t.Fatalf("after the panic the caller's thread has fsuid %d fsgid %d groups %v, want root's", uid, gid, groups)
	}
	if _, err := os.ReadFile(f.rootOnly); err != nil {
		t.Fatalf("after the panic the caller lost root's access: %v", err)
	}
	waitThreadGone(t, panicTid)

	var exitTid int
	if err := RunAsFileToolIdentity(func() {
		exitTid = unix.Gettid()
		runtime.Goexit()
	}); err != nil {
		t.Fatalf("Goexit inside the call: %v", err)
	}
	waitThreadGone(t, exitTid)
	waitNoExecutorThread(t)

	if res := f.call(t, "Read", map[string]any{"file_path": "root-only.txt"}); !res.IsError {
		t.Fatalf("after a panic the next call no longer runs as the executor: %s", res.Flatten())
	}
}

// File tool calls ignore their context: a call made with a cancelled context still
// runs, and runs as the executor. Under load (real tool calls with live and cancelled
// contexts on many goroutines) goroutines that sample their own thread never see the
// executor's uid, every caller keeps uid 0, and no thread keeps the identity once
// the calls are done.
func TestFileToolIdentityUnderLoadAndCancelAsRoot(t *testing.T) {
	f := newFileIdentityFixture(t)
	SetFileToolIdentity(&FileToolIdentity{UID: testExecID, GID: testExecID})

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	raw, _ := json.Marshal(map[string]any{"file_path": "root-only.txt"})
	res, err := f.tools["Read"].Call(cancelled, raw, f.tc)
	if err != nil || !res.IsError || !strings.Contains(res.Flatten(), "permission denied") {
		t.Fatalf("Read with a cancelled context: err=%v %s, want permission denied as the executor", err, res.Flatten())
	}

	stop := make(chan struct{})
	var samples, leaks atomic.Int64
	var observers sync.WaitGroup
	for i := 0; i < 8; i++ {
		observers.Add(1)
		go func() {
			defer observers.Done()
			runtime.LockOSThread()
			defer runtime.UnlockOSThread()
			for {
				select {
				case <-stop:
					return
				default:
				}
				if uid, gid, groups := ownFSIDs(); uid != 0 || hasExecutorID(uid, gid, groups) {
					leaks.Add(1)
				}
				samples.Add(1)
				runtime.Gosched()
			}
		}()
	}
	calls := []struct {
		tool string
		in   map[string]any
	}{
		{"Read", map[string]any{"file_path": "root-only.txt"}},
		{"Read", map[string]any{"file_path": "shared.txt"}},
		{"Grep", map[string]any{"pattern": "TOPSECRET", "output_mode": "content"}},
		{"LS", map[string]any{"path": "."}},
	}
	var callers sync.WaitGroup
	for i := 0; i < 200; i++ {
		callers.Add(1)
		go func(i int) {
			defer callers.Done()
			runtime.LockOSThread()
			defer runtime.UnlockOSThread()
			c := calls[i%len(calls)]
			ctx := context.Background()
			if i%2 == 1 {
				ctx = cancelled
			}
			raw, _ := json.Marshal(c.in)
			res, err := f.tools[c.tool].Call(ctx, raw, f.tc)
			if err != nil {
				t.Errorf("%s: %v", c.tool, err)
				return
			}
			if strings.Contains(res.Flatten(), confinedSecret) {
				t.Errorf("%s printed the root-only file: %s", c.tool, res.Flatten())
			}
			if uid, gid, groups := ownFSIDs(); uid != 0 || hasExecutorID(uid, gid, groups) {
				t.Errorf("after %s the caller's thread has fsuid %d fsgid %d groups %v", c.tool, uid, gid, groups)
			}
		}(i)
	}
	callers.Wait()
	close(stop)
	observers.Wait()
	if leaks.Load() != 0 {
		t.Fatalf("%d of %d samples on observer threads saw a file system uid other than 0", leaks.Load(), samples.Load())
	}
	t.Logf("%d samples on observer threads during 200 calls, all file system uid 0", samples.Load())
	waitNoExecutorThread(t)
}
