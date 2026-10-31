
const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const TIMEOUT_MS = 60000;

// Fetch with a timeout.
async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Common API request function.
export async function apiRequest(path, options = {}, retries = 1) {
  const url = `${API_BASE}${path}`;

  try {
    const headers = { ...(options.headers || {}) };

    // Do not set JSON Content-Type for FormData uploads.
    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = body.detail;

      const message =
        typeof detail === "string"
          ? detail
          : detail?.message || `Request failed (${response.status})`;

      throw new Error(message);
    }

    return body;
  } catch (error) {
    const isNetworkError =
      error.name === "AbortError" || error instanceof TypeError;

    // Retry network failures, but not failed HTTP responses.
    if (isNetworkError && retries > 0) {
      return apiRequest(path, options, retries - 1);
    }

    if (error.name === "AbortError") {
      throw new Error(
        "The server took too long to respond. Please try again."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Check your internet connection or backend CORS settings."
      );
    }

    throw error;
  }
}

// Get all opportunities.
export async function getOpportunities() {
  const result = await apiRequest("/opportunities/");
  return result.opportunities || [];
}

// Get one opportunity by ID.
export async function getOpportunityById(opportunityId) {
  return apiRequest(`/opportunities/${opportunityId}`);
}

// Upload a PDF for AI extraction.
export async function uploadOpportunityPdf(file) {
  if (!file) {
    throw new Error("Please select a PDF file.");
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF file.");
  }

  const formData = new FormData();
  formData.append("file", file);

  return apiRequest(
    "/ai/extract-pdf",
    {
      method: "POST",
      body: formData,
    },
    0
  );
}

// Export the configured backend URL.
export { API_BASE };
