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
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return fallbackText;
}

export function splitImportedKeys(rawInput) {
  return String(rawInput || "")
    .replace(/\r/g, "")
    .split(/[,\n]/)
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
