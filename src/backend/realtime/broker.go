package realtime

import (
	"sync"
	"sync/atomic"
)

const defaultEventBufferLimit = 512

type Broker struct {
	mu        sync.RWMutex
	ring      *eventRing
	nextSubID uint64
	subs      map[uint64]chan Event
}

var defaultBroker atomic.Pointer[Broker]

func init() {
	defaultBroker.Store(NewBroker(defaultEventBufferLimit))
}

func NewBroker(limit int) *Broker {
	return &Broker{
		ring: newEventRing(limit),
		subs: make(map[uint64]chan Event),
	}
}

func Current() *Broker {
	broker := defaultBroker.Load()
	if broker == nil {
		broker = NewBroker(defaultEventBufferLimit)
		defaultBroker.Store(broker)
	}
	return broker
}

func ReplaceDefaultBrokerForTesting(limit int) func() {
	previous := Current()
	defaultBroker.Store(NewBroker(limit))
	return func() {
		defaultBroker.Store(previous)
	}
}

func LatestID() uint64 {
	return Current().LatestID()
}

func PublishStatsChanged(provider string) uint64 {
	return Current().Publish(Event{
		Kind:     KindStatsChanged,
		Provider: provider,
	})
}

func PublishProvidersChanged() uint64 {
	return Current().Publish(Event{Kind: KindProvidersChanged})
}

func PublishGlobalConfigChanged() uint64 {
	return Current().Publish(Event{Kind: KindGlobalConfigChanged})
}

func PublishLog(entry LogEntry) uint64 {
	return Current().Publish(Event{
		Kind:     KindLogAppend,
		Provider: readProviderName(entry.Attrs),
		LogEntry: &entry,
	})
}

func readProviderName(attrs map[string]any) string {
	if attrs == nil {
		return ""
	}
	if provider, ok := attrs["provider"]; ok {
		return stringify(provider)
	}
	if provider, ok := attrs["provider_name"]; ok {
		return stringify(provider)
	}
	return ""
}

func stringify(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func (broker *Broker) LatestID() uint64 {
	broker.mu.RLock()
	defer broker.mu.RUnlock()
	return broker.ring.latestID()
}

func (broker *Broker) Publish(event Event) uint64 {
	broker.mu.Lock()
	encodedEvent := broker.ring.append(event)
	for subscriberID, subscriberCh := range broker.subs {
		select {
		case subscriberCh <- encodedEvent:
		default:
			close(subscriberCh)
			delete(broker.subs, subscriberID)
		}
	}
	broker.mu.Unlock()
	return encodedEvent.ID
}

func (broker *Broker) Subscribe(after uint64) ([]Event, <-chan Event, func(), bool) {
	broker.mu.Lock()
	defer broker.mu.Unlock()

	replayEvents, _, gapDetected := broker.ring.snapshotAfter(after)
	if gapDetected {
		return nil, nil, func() {}, true
	}

	subscriberID := broker.nextSubID
	broker.nextSubID++
	subscriberCh := make(chan Event, 64)
	broker.subs[subscriberID] = subscriberCh

	cancel := func() {
		broker.mu.Lock()
		defer broker.mu.Unlock()
		ch, exists := broker.subs[subscriberID]
		if !exists {
			return
		}
		delete(broker.subs, subscriberID)
		close(ch)
	}

	return replayEvents, subscriberCh, cancel, gapDetected
}
