package server

import (
	"io"
	"sync"
	"testing"
)

func TestLogSinkUnsubscribeDuringAddDoesNotPanic(t *testing.T) {
	s := &logSinkT{cap: 8, subs: map[chan LogLine]struct{}{}, out: io.Discard}
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		_, unsub := s.subscribe()
		wg.Add(1)
		go func() {
			defer wg.Done()
			unsub()
		}()
		s.add(LogLine{Text: "line"})
	}
	wg.Wait()
	s.add(LogLine{Text: "after"})
}
