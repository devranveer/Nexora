
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { checkEligibility, getMyProfile, parseResume } from "./api.js";

const CATEGORY_OPTIONS = [
  { label: "Internships", value: "internship" },
  { label: "Jobs", value: "job" },
  { label: "Fellowships", value: "fellowship" },
  { label: "Scholarships", value: "scholarship" },
];

const STATUS_META = {
  potential_match: {
    label: "Possible match",
    tone: "green",
    icon: "✓",
  },
  needs_more_information: {
    label: "Needs more information",
    tone: "orange",
    icon: "?",
  },
  possible_mismatch: {
    label: "Possible mismatch",
    tone: "",
    icon: "✕",
  },
};

const STATUS_ORDER = [
  "potential_match",
  "needs_more_information",
  "possible_mismatch",
];

export default function EligibilityChecker() {
  const [form, setForm] = useState({
    category: "internship",
    degree: "B.Tech",
    year_of_study: "1st Year",
    marks_percentage: "",
    annual_family_income: "",
    student_category: "",
    skills: "",
    research_interests: "",
    location: "",
    work_mode: "Any",
    expected_stipend: "",
    expected_salary: "",
  });

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(null); // { totalChecked, totals, results, scope }
  const [resumeState, setResumeState] = useState(null); // { parsing, parsed, error }

  const resumeInputRef = useRef(null);

  // Prefill from the saved backend profile (falls back silently).
  useEffect(() => {
    getMyProfile()
      .then((saved) => {
        setForm((previous) => ({
          ...previous,
          degree: saved.degree || previous.degree,
          year_of_study: saved.year_of_study || previous.year_of_study,
          marks_percentage: saved.marks_percentage
            ? String(saved.marks_percentage)
            : previous.marks_percentage,
          location: saved.preferred_location || previous.location,
          work_mode: saved.preferred_work_mode
            ? saved.preferred_work_mode.replace(/^\w/, (c) => c.toUpperCase())
            : previous.work_mode,
          skills: (saved.skills || []).join(", ") || previous.skills,
          research_interests:
            (saved.interests || []).join(", ") || previous.research_interests,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function numberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(String(value).replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Runs the backend matcher for one or more categories and merges the results.
  async function runCheck(categories) {
    setError("");
    setChecking(true);
    setChecked(null);

    const payloadBase = {
      degree: form.degree,
      year_of_study: form.year_of_study,
      marks_percentage: numberOrNull(form.marks_percentage),
      annual_family_income: numberOrNull(form.annual_family_income),
      student_category: form.student_category || null,
      skills: form.skills
        ? form.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      research_interests: form.research_interests
        ? form.research_interests.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      location: form.location || null,
      work_mode: form.work_mode === "Any" ? null : form.work_mode.toLowerCase(),
      expected_stipend: numberOrNull(form.expected_stipend),
      expected_salary: numberOrNull(form.expected_salary),
    };

    try {
      const bundles = await Promise.all(
        categories.map(async (category) => ({
          data: await checkEligibility({ ...payloadBase, category }),
          category,
        }))
      );

      const results = bundles
        .flatMap((bundle) =>
          (bundle.data.results || []).map((result) => ({
            ...result,
            check_category: bundle.category,
          }))
        )
        .filter((r) => r.match_status !== undefined)
        .sort(
          (a, b) =>
            STATUS_ORDER.indexOf(a.match_status) -
            STATUS_ORDER.indexOf(b.match_status)
        );

      const totals = results.reduce(
        (acc, r) => ((acc[r.match_status] = (acc[r.match_status] || 0) + 1), acc),
        {}
      );

      const totalChecked = bundles.reduce(
        (sum, bundle) => sum + (bundle.data.total_opportunities_checked || 0),
        0
      );

      const scope =
        categories.length === 1
          ? CATEGORY_OPTIONS.find((c) => c.value === categories[0])?.label
          : categories.map((c) => `${c}s`).join(" + ");

      setChecked({
        scope,
        totalChecked,
        totals,
        results,
      });
    } catch (err) {
      setError(
        err.message || "Eligibility check failed. Is the backend running?"
      );
      setChecked(null);
    } finally {
      setChecking(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await runCheck([form.category]);
  }

  // ------------------------------------------------------------
  // Resume upload: parse → prefill → auto-check internships+jobs
  // ------------------------------------------------------------

  function selectResume(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setResumeState(null);

    (async () => {
      setResumeState({ parsing: true });

      try {
        const result = await parseResume(file);
        const parsed = result.parsed || {};
        const saved = result.profile || {};

        setForm((previous) => ({
          ...previous,
          degree: parsed.degree || previous.degree,
          year_of_study: parsed.year_of_study || saved.year_of_study || previous.year_of_study,
          marks_percentage:
            parsed.marks_percentage != null
              ? String(parsed.marks_percentage)
              : previous.marks_percentage,
          annual_family_income:
            parsed.annual_family_income != null
              ? String(parsed.annual_family_income)
              : previous.annual_family_income,
          skills: (parsed.skills || []).join(", ") || previous.skills,
          location: parsed.state_domicile || saved.preferred_location || previous.location,
        }));

        setResumeState({
          parsing: false,
          parsed: true,
          summary: {
            name: parsed.name,
            college: parsed.college,
            skills: parsed.skills || [],
          },
        });

        // Immediately show opportunities based on the resume.
        await runCheck(["internship", "job"]);
      } catch (err) {
        setResumeState({
          parsing: false,
          error: err.message || "Resume parsing failed.",
        });
      } finally {
        if (resumeInputRef.current) resumeInputRef.current.value = "";
      }
    })();
  }

  const summary = checked
    ? [
        ["Possible matches", checked.totals.potential_match || 0, "✓"],
        ["Needs more info", checked.totals.needs_more_information || 0, "?"],
        ["Possible mismatches", checked.totals.possible_mismatch || 0, "✕"],
      ]
    : null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">ELIGIBILITY CHECKER</div>
          <h1 className="h1">Do you match these opportunities?</h1>
          <p className="subtitle">
            Upload your resume or fill the form — Nexora saves your details and
            shows matching opportunities. Always confirm the official
            notification before applying.
          </p>
        </div>
      </div>

      <ResumeUploadPanel
        state={resumeState}
        inputRef={resumeInputRef}
        onSelect={selectResume}
      />

      <div className="form-wrap">
        <form className="form-panel" onSubmit={submit}>
          <h2 className="form-title">
            {resumeState?.parsed ? "Details parsed from your resume" : "Your details"}
          </h2>
          <p className="panel-sub">
            {loading
              ? "Loading your saved profile..."
              : resumeState?.parsed
                ? "Review and edit anything, then check again."
                : "Prefilled from your profile where available. Or upload your resume above."}
          </p>

          <div className="form-grid">
            <Field label="Opportunity type">
              <select name="category" value={form.category} onChange={change}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Degree">
              <select name="degree" value={form.degree} onChange={change}>
                <option>B.Tech</option><option>B.E.</option><option>B.Sc.</option><option>BCA</option><option>MBA</option><option>Diploma</option><option>Other</option>
              </select>
            </Field>
            <Field label="Year of study">
              <select name="year_of_study" value={form.year_of_study} onChange={change}>
                <option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option><option>Graduate</option>
              </select>
            </Field>
            <Field label="Marks (%)">
              <input name="marks_percentage" inputMode="decimal" value={form.marks_percentage} onChange={change} placeholder="e.g. 78" />
            </Field>
            <Field label="Annual family income">
              <input name="annual_family_income" inputMode="decimal" value={form.annual_family_income} onChange={change} placeholder="e.g. 400000" />
            </Field>
            <Field label="Your category (SC/ST/OBC/General)">
              <input name="student_category" value={form.student_category} onChange={change} placeholder="Optional" />
            </Field>
            <Field label="Your location">
              <input name="location" value={form.location} onChange={change} placeholder="e.g. India" />
            </Field>
            <Field label="Preferred work mode">
              <select name="work_mode" value={form.work_mode} onChange={change}>
                <option>Any</option><option>Remote</option><option>Hybrid</option><option>On-site</option>
              </select>
            </Field>
            <Field label="Minimum monthly stipend">
              <input name="expected_stipend" inputMode="decimal" value={form.expected_stipend} onChange={change} placeholder="e.g. 15000" />
            </Field>
            <Field label="Minimum annual salary">
              <input name="expected_salary" inputMode="decimal" value={form.expected_salary} onChange={change} placeholder="e.g. 500000" />
            </Field>
            <Field label="Skills (comma-separated)" full>
              <input name="skills" value={form.skills} onChange={change} placeholder="Python, SQL, React" />
            </Field>
            <Field label="Interests / research topics (comma-separated)" full>
              <input name="research_interests" value={form.research_interests} onChange={change} placeholder="AI/ML, backend development" />
            </Field>
          </div>

          {error && (
            <div className="notice" role="alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={checking} style={{ marginTop: 14 }}>
            {checking ? "Checking eligibility..." : "Check eligibility ✓"}
          </button>
        </form>
      </div>

      {checked && (
        <>
          <div className="stats" style={{ marginTop: 24 }}>
            {summary.map(([label, count, icon]) => (
              <div className="stat-card" key={label}>
                <div className="stat-top">
                  <span>{label}</span>
                  <span className="stat-icon">{icon}</span>
                </div>
                <div className="stat-number">{count}</div>
                <div className="stat-note">
                  of {checked.totalChecked} listings · {checked.scope}
                </div>
              </div>
            ))}
          </div>

          {checking && <p className="panel-sub">Checking your profile...</p>}

          {checked.results.length ? (
            checked.results.map((result) => (
              <ResultCard key={`${result.check_category}-${result.id}`} result={result} />
            ))
          ) : (
            <div className="empty" style={{ marginTop: 18 }}>
              <strong>No opportunities found in the database</strong>
              Open the Explore page and import real opportunities first.
            </div>
          )}

          <p className="footer-note">
            Preliminary, rule-based matching only — not confirmation of
            eligibility. Verify the original notification before applying.
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Resume upload panel
// ------------------------------------------------------------

function ResumeUploadPanel({ state, inputRef, onSelect }) {
  return (
    <section className="panel" style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2 style={{ fontSize: 18 }}>📄 Fast way: upload your resume</h2>
          <p className="panel-sub">
            Nexora reads your skills, degree, marks, income and location, saves
            them to your profile, and instantly shows matching internships and
            jobs.
          </p>
        </div>

        <label className="btn btn-primary" style={{ cursor: "pointer" }}>
          {state?.parsing ? "Reading your resume..." : "Upload resume ↗"}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={onSelect}
            disabled={state?.parsing}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {state?.error && (
        <div className="notice" role="alert" style={{ marginTop: 12 }}>
          {state.error}
        </div>
      )}

      {state?.parsed && (
        <div className="notice" style={{ marginTop: 12 }}>
          ✓ Resume parsed
          {state.summary?.name ? ` — ${state.summary.name}` : ""}
          {state.summary?.college ? ` · ${state.summary.college}` : ""}
          {(state.summary?.skills || []).length
            ? ` · Skills found: ${state.summary.skills.slice(0, 6).join(", ")}`
            : ""}
          . Saved to your profile.
        </div>
      )}
    </section>
  );
}

function ResultCard({ result }) {
  const meta = STATUS_META[result.match_status] || STATUS_META.needs_more_information;

  return (
    <article className="op-card" style={{ marginTop: 14 }}>
      <div className="card-top">
        <div className="org">
          <div className="org-logo">{meta.icon}</div>
          <div>
            <div className="org-name">{result.organization || "Organization not specified"}</div>
            <h3 className="card-title">{result.title}</h3>
          </div>
        </div>
        <span className={`pill ${meta.tone}`}>{meta.label}</span>
      </div>

      <div className="tag-row">
        {result.check_category && (
          <span className="pill">{result.check_category}</span>
        )}
        {result.verified && <span className="pill green">✓ Verified</span>}
      </div>

      <div className="meta">
        {result.location && <span>⌖ {result.location}</span>}
        {result.deadline && <span>◷ Deadline: {result.deadline}</span>}
        {result.stipend_monthly != null && (
          <span>₹ {Number(result.stipend_monthly).toLocaleString()} / mo</span>
        )}
        {result.salary_annual != null && (
          <span>₹ {Number(result.salary_annual).toLocaleString()} / yr</span>
        )}
      </div>

      {result.matching_reasons?.length > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          {result.matching_reasons.map((reason) => (
            <div key={reason}>✓ {reason}</div>
          ))}
        </div>
      )}

      {result.missing_information?.length > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          {result.missing_information.map((item) => (
            <div key={item}>? {item}</div>
          ))}
        </div>
      )}

      {result.mismatches?.length > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          {result.mismatches.map((item) => (
            <div key={item}>✕ {item}</div>
          ))}
        </div>
      )}

      <div className="card-footer">
        <span className="deadline">
          {result.verified ? "✓ Verified listing" : "Unverified listing"}
        </span>
        <Link className="small-btn" to={`/opportunity/${result.id}`}>
          View details ↗
        </Link>
      </div>
    </article>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
