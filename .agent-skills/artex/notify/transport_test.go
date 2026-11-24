package notify

import "testing"

func TestNotifyTransportIgnoresEnvironmentProxy(t *testing.T) {
	if notifyTransport.Proxy != nil {
		t.Fatal("notification transport must dial the target, not an environment proxy")
	}
}
