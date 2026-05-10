function parseEventData(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function normalizeLastEventId(rawValue) {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0;
  }
  return Math.trunc(parsedValue);
}

export function buildStreamURL(pathname, after) {
  const query = new URLSearchParams();
  if (Number.isFinite(Number(after)) && Number(after) > 0) {
    query.set("after", String(Math.trunc(Number(after))));
  }
  const queryText = query.toString();
  return queryText ? `${pathname}?${queryText}` : pathname;
}

export function openLiveStream(pathname, options) {
  const streamOptions = options || {};
  const EventSourceConstructor = streamOptions.EventSourceConstructor || window.EventSource;
  const source = new EventSourceConstructor(pathname, { withCredentials: true });
  const listeners = [];

  const eventNames = Array.isArray(streamOptions.eventNames)
    ? streamOptions.eventNames
    : [];

  eventNames.forEach(function registerEventName(eventName) {
    const listener = function handleEvent(event) {
      if (typeof streamOptions.onEvent === "function") {
        streamOptions.onEvent({
          data: parseEventData(event.data),
          lastEventId: normalizeLastEventId(event.lastEventId),
          rawEvent: event,
          type: eventName
        });
      }
    };
    source.addEventListener(eventName, listener);
    listeners.push([eventName, listener]);
  });

  if (typeof streamOptions.onOpen === "function") {
    source.onopen = function handleOpen(event) {
      streamOptions.onOpen(event);
    };
  }

  if (typeof streamOptions.onError === "function") {
    source.onerror = function handleError(event) {
      streamOptions.onError(event);
    };
  }

  return {
    close() {
      listeners.forEach(function removeListener(entry) {
        source.removeEventListener(entry[0], entry[1]);
      });
      source.close();
    },
    source
  };
}
