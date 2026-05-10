package realtime

type eventRing struct {
	events []Event
	start  int
	count  int
	cursor uint64
}

func newEventRing(limit int) *eventRing {
	if limit <= 0 {
		limit = 512
	}
	return &eventRing{
		events: make([]Event, limit),
		cursor: 1,
	}
}

func (ring *eventRing) append(event Event) Event {
	ring.cursor++
	event.ID = ring.cursor

	if ring.count == len(ring.events) {
		ring.events[ring.start] = Event{}
		ring.start = (ring.start + 1) % len(ring.events)
		ring.count--
	}

	index := (ring.start + ring.count) % len(ring.events)
	ring.events[index] = event
	ring.count++
	return event
}

func (ring *eventRing) latestID() uint64 {
	return ring.cursor
}

func (ring *eventRing) snapshotAfter(after uint64) ([]Event, uint64, bool) {
	latestID := ring.latestID()
	if ring.count == 0 {
		return nil, latestID, after > latestID
	}

	oldestID := ring.events[ring.start].ID
	if after > latestID {
		return nil, latestID, true
	}
	if after > 0 && after+1 < oldestID {
		return nil, latestID, true
	}
	if after == latestID {
		return make([]Event, 0), latestID, false
	}

	result := make([]Event, 0, ring.count)
	for offset := 0; offset < ring.count; offset++ {
		index := (ring.start + offset) % len(ring.events)
		event := ring.events[index]
		if event.ID <= after {
			continue
		}
		result = append(result, event)
	}
	return result, latestID, false
}
