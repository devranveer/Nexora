const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const TIMEOUT_MS = 60000; // allow for Render cold starts

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest(path, options = {}, retries = 1) {
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      },
      TIMEOUT_MS
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.detail || `Request failed (${response.status})`);
    }

    return body;
  } catch (err) {
    // Network/CORS failures and timeouts surface as TypeError / AbortError
    const isNetworkError =
      err.name === "AbortError" || err instanceof TypeError;

    if (isNetworkError && retries > 0) {
      return apiRequest(path, options, retries - 1);
    }

    if (err.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    if (err instanceof TypeError) {
      throw new Error(
        "Could not reach the server (network or CORS issue)."
      );
    }
    throw err;
  }
}

export async function getOpportunities() {
  const result = await apiRequest("/opportunities/");
  return result.opportunities || [];
}

export { API_BASE };