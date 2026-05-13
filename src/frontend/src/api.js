const jsonContentType = "application/json";

function isStructuredBody(body) {
  if (!body) {
    return false;
  }
  if (typeof body === "string") {
    return false;
  }
  if (body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams) {
    return false;
  }
  return true;
}

function parseResponseData(rawText) {
  const trimmedText = String(rawText || "").trim();
  if (!trimmedText) {
    return null;
  }
  try {
    return JSON.parse(trimmedText);
  } catch (_error) {
    return null;
  }
}

function extractResponseErrorMessage(data, rawText) {
  if (data && typeof data === "object") {
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
  }
  const trimmedText = String(rawText || "").trim();
  if (trimmedText) {
    return trimmedText;
  }
  return "";
}

function createRequestError(status, message) {
  const error = new Error(message || "Request failed");
  error.status = status;
  return error;
}

function extractMessageText(error) {
  if (error && typeof error.message === "string") {
    return error.message.trim();
  }
  if (typeof error === "string") {
    return error.trim();
  }
  return "";
}

function isBrowserNetworkFailureMessage(messageText) {
  const normalizedMessage = String(messageText || "").trim().toLowerCase();
  if (!normalizedMessage) {
    return false;
  }
  return (
    normalizedMessage === "failed to fetch" ||
    normalizedMessage === "load failed" ||
    normalizedMessage === "network request failed" ||
    normalizedMessage === "the network connection was lost." ||
    normalizedMessage.includes("networkerror when attempting to fetch resource")
  );
}

export function shouldIgnoreRuntimeFailure(error) {
  if (error && typeof error === "object" && error.name === "AbortError") {
    return true;
  }
  return isBrowserNetworkFailureMessage(extractMessageText(error));
}

export async function requestJSON(url, options) {
  const requestOptions = options || {};
  const headers = new Headers(requestOptions.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", jsonContentType);
  }

  const init = {
    credentials: "same-origin",
    headers,
    method: requestOptions.method || "GET"
  };
  if (requestOptions.cache) {
    init.cache = requestOptions.cache;
  }
  if (requestOptions.signal) {
    init.signal = requestOptions.signal;
  }

  if (requestOptions.body !== undefined) {
    if (isStructuredBody(requestOptions.body)) {
      headers.set("Content-Type", jsonContentType);
      init.body = JSON.stringify(requestOptions.body);
    } else {
      init.body = requestOptions.body;
    }
  }

  const response = await fetch(url, init);
  const responseText = await response.text();
  const responseData = parseResponseData(responseText);
  const etag = response.headers.get("ETag") || "";

  if (response.status === 304) {
    return {
      data: null,
      etag,
      notModified: true,
      response
    };
  }
  if (!response.ok) {
    throw createRequestError(response.status, extractResponseErrorMessage(responseData, responseText));
  }

  return {
    data: responseData,
    etag,
    notModified: false,
    response
  };
}

export function normalizeErrorMessage(error, fallbackText) {
  const messageText = extractMessageText(error);
  if (isBrowserNetworkFailureMessage(messageText)) {
    return fallbackText;
  }
  if (messageText) {
    return messageText;
  }
  return fallbackText;
}

export function splitImportedKeys(rawInput) {
  return String(rawInput || "")
    .replace(/\r/g, "")
    .split(/[，,\n]/)
    .map(function trimKey(value) {
      return value.trim();
    })
    .filter(function keepNonEmpty(value) {
      return value !== "";
    });
}

export function parseImportedKeys(rawInput) {
  const rawKeys = splitImportedKeys(rawInput);
  const uniqueKeys = [];
  const seenKeys = new Set();
  for (let index = 0; index < rawKeys.length; index += 1) {
    const keyValue = rawKeys[index];
    if (seenKeys.has(keyValue)) {
      continue;
    }
    seenKeys.add(keyValue);
    uniqueKeys.push(keyValue);
  }
  return uniqueKeys;
}

export function toInteger(value, fallbackValue) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }
  return Math.trunc(parsedValue);
}

export function clamp(value, minValue, maxValue) {
  let nextValue = value;
  if (nextValue < minValue) {
    nextValue = minValue;
  }
  if (nextValue > maxValue) {
    nextValue = maxValue;
  }
  return nextValue;
}
