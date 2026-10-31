
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { uploadOpportunityPdf } from "./api.js";

export default function PdfUpload() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function selectFile(event) {
    const selected = event.target.files?.[0];

    setError("");
    setResult(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (
      selected.type !== "application/pdf" &&
      !selected.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Please select a PDF file.");
      setFile(null);
      event.target.value = "";
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10 MB.");
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selected);
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setError("Please choose a PDF first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await uploadOpportunityPdf(file);
      setResult(data);
    } catch (err) {
      setError(err.message || "PDF processing failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const opportunity = result?.opportunity || result;

  function display(value) {
    if (value == null || value === "") return "Not specified";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">AI-POWERED EXTRACTION</div>
          <h1 className="h1">Import opportunity PDF</h1>
          <p className="subtitle">
            Upload a scholarship or internship notification to extract
            important details with AI.
          </p>
        </div>

        <Link to="/opportunities" className="btn btn-light">
          Explore opportunities
        </Link>
      </div>

      <div className="panel" style={{ maxWidth: 800, margin: "24px auto" }}>
        <form onSubmit={handleUpload}>
          <div
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files?.[0]) {
                selectFile({ target: {
                  files: event.dataTransfer.files,
                  value: ""
                }});
              }
            }}
            style={{
              border: "2px dashed #a5b4fc",
              borderRadius: 16,
              padding: "42px 20px",
              textAlign: "center",
              cursor: loading ? "wait" : "pointer",
              background: "#f8faff",
            }}
          >
            <div style={{ fontSize: 42, marginBottom: 12 }}>📄</div>
            <h2 style={{ marginBottom: 8 }}>Choose your PDF</h2>
            <p className="panel-sub">
              Click here or drag and drop a PDF file.
            </p>
            <p className="muted small-text">PDF only · Maximum 10 MB</p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={selectFile}
              disabled={loading}
              style={{ display: "none" }}
            />
          </div>

          {file && (
            <div className="notice" style={{ marginTop: 16 }}>
              <strong>Selected file:</strong> {file.name}
              <br />
              <span className="muted">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </span>
              <button
                type="button"
                className="btn btn-light"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={loading}
              >
                Remove
              </button>
            </div>
          )}

          {error && (
            <div className="notice" role="alert" style={{ marginTop: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!file || loading}
            style={{ marginTop: 20 }}
          >
            {loading ? "Extracting details..." : "Upload and extract details"}
          </button>
        </form>

        {loading && (
          <p className="panel-sub" style={{ marginTop: 16 }}>
            AI is processing the document. This may take a little time.
          </p>
        )}
      </div>

      {result && (
        <section className="panel" style={{ maxWidth: 800, margin: "24px auto" }}>
          <div className="eyebrow">EXTRACTION RESULT</div>
          <h2 style={{ marginTop: 8 }}>
            {display(opportunity?.title)}
          </h2>

          <div className="notice" style={{ margin: "16px 0" }}>
            Status: {result.verified === true || opportunity?.verified === true
              ? "Verified"
              : "Unverified — check the official notification."}
          </div>

          <div className="detail-facts">
            <div className="fact">
              <span>CATEGORY</span>
              <strong>{display(opportunity?.category)}</strong>
            </div>
            <div className="fact">
              <span>ORGANIZATION</span>
              <strong>{display(opportunity?.organization)}</strong>
            </div>
            <div className="fact">
              <span>DEADLINE</span>
              <strong>{display(opportunity?.deadline)}</strong>
            </div>
            <div className="fact">
              <span>LOCATION</span>
              <strong>{display(opportunity?.location)}</strong>
            </div>
            <div className="fact">
              <span>MONTHLY STIPEND</span>
              <strong>{display(opportunity?.stipend_monthly)}</strong>
            </div>
            <div className="fact">
              <span>ANNUAL SALARY</span>
              <strong>{display(opportunity?.salary_annual)}</strong>
            </div>
          </div>

          <h3 style={{ marginTop: 24 }}>Description</h3>
          <p className="detail-body">
            {display(opportunity?.description)}
          </p>

          <h3 style={{ marginTop: 20 }}>Eligibility</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {display(opportunity?.eligibility)}
          </pre>

          <h3 style={{ marginTop: 20 }}>Required documents</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {display(opportunity?.required_documents)}
          </pre>

          <h3 style={{ marginTop: 20 }}>Required skills</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {display(opportunity?.required_skills)}
          </pre>

          <p className="footer-note">
            AI extraction may contain mistakes. Confirm eligibility and
            deadlines against the original official notification.
          </p>

          <Link to="/opportunities" className="btn btn-primary">
            View opportunities
          </Link>
        </section>
      )}
    </div>
  );
}
