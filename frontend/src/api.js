
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

// Get all opportunities (up to 100 live rows).
export async function getOpportunities(limit = 100) {
  const result = await apiRequest(`/opportunities/?limit=${limit}`);
  return result.opportunities || [];
}

// Get one opportunity by ID.
export async function getOpportunityById(opportunityId) {
  return apiRequest(`/opportunities/${opportunityId}`);
}

// Append a new opportunity to the database.
export async function appendOpportunity(data) {
  return apiRequest(
    "/opportunities/",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    0
  );
}

// Scrape real opportunities (Remotive, Arbeitnow, Devpost).
export async function runScraper(target = 100) {
  return apiRequest(
    `/scraper/run?target=${target}`,
    { method: "POST" },
    0
  );
}

// How much real data is currently in the database.
export async function getScraperStatus() {
  return apiRequest("/scraper/status");
}

// Send the student's profile to the eligibility matcher and
// receive per-opportunity match results.
export async function checkEligibility(payload) {
  return apiRequest(
    "/matching/opportunities",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    0
  );
}

// Load the current student profile (created on first load).
export async function getMyProfile() {
  const result = await apiRequest("/profile/me");
  return result.profile || {};
}

// Upload a resume (PDF/DOCX/TXT): parses details and updates
// the stored profile. Returns { parsed, profile }.
export async function parseResume(file) {
  if (!file) {
    throw new Error("Please select a resume file.");
  }

  const allowed = [".pdf", ".docx", ".txt", ".md"];
  if (!allowed.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    throw new Error("Please upload a PDF, DOCX or TXT resume.");
  }

  const formData = new FormData();
  formData.append("file", file);

  return apiRequest(
    "/profile/parse-resume",
    {
      method: "POST",
      body: formData,
    },
    0
  );
}

// Create or update the student profile.
export async function saveMyProfile(payload) {
  return apiRequest(
    "/profile/me",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    0
  );
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
