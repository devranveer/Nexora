
import React, { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
} from "react-router-dom";

import Calendar from "./Calendar";
import PdfUpload from "./PdfUpload.jsx";
import EligibilityChecker from "./EligibilityChecker.jsx";
import {
  opportunities,
  categories,
  getSaved,
  setSaved,
} from "./data.js";

import {
  getOpportunities,
  appendOpportunity,
  runScraper,
  getScraperStatus,
  getMyProfile,
  saveMyProfile,
} from "./api.js";

// Convert backend data into the format used by the Nexora UI.
function normalizeOpportunity(item) {
  const categoryMap = {
    scholarship: "Scholarship",
    internship: "Internship",
    hackathon: "Hackathon",
    course: "Course",
    job: "Job",
    fellowship: "Fellowship",
    other: "Other",
  };

  const category =
    categoryMap[String(item.category || "").toLowerCase()] || "Other";

  let url = item.source_url || "";

  const match = url.match(/^\[.*?\]\((https?:\/\/.*?)\)$/);
  if (match) url = match[1];

  // Show a human amount when the backend knows the pay.
  let amount = "See official listing";
  if (item.stipend_monthly) {
    amount = `${Number(item.stipend_monthly).toLocaleString()} / mo`;
  } else if (item.salary_annual) {
    amount = `${Number(item.salary_annual).toLocaleString()} / yr`;
  }

  const iconMap = {
    Scholarship: "🎓",
    Internship: "💻",
    Hackathon: "🚀",
    Course: "🧠",
    Job: "💼",
    Fellowship: "🎓",
    Other: "✨",
  };

  const skills = Array.isArray(item.required_skills)
    ? item.required_skills.slice(0, 8)
    : [];

  const capWords = (value) =>
    String(value).replace(/^\w/, (c) => c.toUpperCase());

  // "2026-12-15" → { days: 42, label: "42 days left" } | null
  function deadlineCountdown(deadline) {
    const match = String(deadline || "").match(/^\d{4}-\d{2}-\d{2}/);
    if (!match) return null;
    const target = new Date(match[0]);
    if (Number.isNaN(target.getTime())) return null;
    const days = Math.ceil(
      (target - new Date()) / (1000 * 60 * 60 * 24)
    );
    if (days < 0) return { label: `Closed ${Math.abs(days)} days ago`, tone: "orange" };
    if (days === 0) return { label: "Closes today", tone: "orange" };
    return {
      label: `${days} day${days === 1 ? "" : "s"} left`,
      tone: days <= 7 ? "orange" : "green",
    };
  }

  const eligibility =
    item.eligibility && typeof item.eligibility === "object"
      ? item.eligibility
      : {};

  return {
    id: String(item.id),
    title: item.title || "Untitled opportunity",
    org: item.organization || "Organization not specified",
    category,
    icon: iconMap[category] || "✨",
    type: category,
    amount,
    location: item.location || item.work_mode || "See listing details",
    deadline: item.deadline || "Not specified",
    deadlineCountdown: deadlineCountdown(item.deadline),
    level: item.work_mode
      ? capWords(item.work_mode)
      : "Check eligibility",
    description:
      item.description
        ? String(item.description).slice(0, 320) +
          (String(item.description).length > 320 ? "..." : "")
        : "No description available.",
    tags: [category, ...skills.filter(Boolean)],
    url,
    verified: item.verified ?? false,
    // Extra real fields used by the detail-page checklist.
    workMode: item.work_mode ? capWords(item.work_mode) : null,
    stipend: item.stipend_monthly || null,
    salary: item.salary_annual || null,
    durationMonths: item.duration_months || null,
    prize:
      eligibility.prize_amount_usd
        ? `₹${Number(eligibility.prize_amount_usd).toLocaleString()}`
        : null,
    skills: skills.filter(Boolean),
    marksRequired: eligibility.minimum_marks ?? null,
    incomeCap: eligibility.maximum_family_income ?? null,
  };
}

// Fetch live opportunities from FastAPI.
function useOpportunities(limit = 100) {
  const [items, setItems] = useState(opportunities);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = React.useCallback(
    (isCancelled) => {
      setLoading(true);

      return getOpportunities(limit)
        .then((data) => {
          if (!isCancelled()) {
            setItems(data.map(normalizeOpportunity));
            setError("");
          }
        })
        .catch((err) => {
          if (!isCancelled()) {
            setError(err.message || "Could not connect to the backend.");
          }
        })
        .finally(() => {
          if (!isCancelled()) setLoading(false);
        });
    },
    [limit]
  );

  useEffect(() => {
    let active = true;
    const isCancelled = () => !active;

    load(isCancelled);

    return () => {
      active = false;
    };
  }, [load]);

  return {
    items,
    setItems,
    loading,
    error,
    refresh: () => {
      let active = true;
      return load(() => !active).finally(() => {
        active = true;
      });
    },
  };
}

// ------------------------------------------------------------
// Sync real data + Add opportunity (append) toolbar
// ------------------------------------------------------------

function OpportunityToolbar({ items, setItems, refresh }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  async function syncRealData() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError("");

    try {
      const result = await runScraper(100);
      setSyncResult(result);
      await refresh();
    } catch (err) {
      setSyncError(
        err.message || "Scraping failed. Is the backend running?"
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 18 }}>
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
          <h2 style={{ fontSize: 18 }}>Live data</h2>
          <p className="panel-sub">
            {items.length} opportunities loaded. Fill the feed with real
            listings or add one by hand.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={syncRealData}
            disabled={syncing}
          >
            {syncing
              ? "Scraping real listings..."
              : "⚡ Import 100 real opportunities"}
          </button>

          <button
            type="button"
            className={`btn ${showAddForm ? "btn-primary" : "btn-light"}`}
            onClick={() => setShowAddForm((open) => !open)}
          >
            {showAddForm ? "Close" : "+ Add opportunity"}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="notice" style={{ marginTop: 14 }}>
          Appended {syncResult.collected} new opportunities
          {syncResult.by_source
            ? Object.entries(syncResult.by_source).map(
                ([source, count]) => ` · ${source}: ${count}`
              ).join("")
            : ""}. Database now holds{" "}
          {syncResult.total_opportunities_in_db}.
        </div>
      )}

      {syncError && (
        <div className="notice" role="alert" style={{ marginTop: 14 }}>
          {syncError}
        </div>
      )}

      {showAddForm && (
        <AddOpportunityForm
          onAppended={(record) => {
            setItems((previous) => [record, ...previous]);
            setShowAddForm(false);
          }}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------
// "Add opportunity" form — appends a row via POST /opportunities
// ------------------------------------------------------------

function AddOpportunityForm({ onAppended }) {
  const emptyForm = {
    title: "",
    category: "Internship",
    organization: "",
    description: "",
    location: "",
    work_mode: "",
    deadline: "",
    stipend_monthly: "",
    salary_annual: "",
    source_url: "",
    skills: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const categoryMap = {
    Scholarship: "scholarship",
    Internship: "internship",
    Hackathon: "hackathon",
    Course: "course",
    Job: "job",
    Fellowship: "fellowship",
    Other: "other",
  };

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function toNumberOrUndefined(value) {
    const parsed = Number(String(value).replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && value !== "" ? parsed : undefined;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (form.title.trim().length < 3) {
      setError("Give the opportunity a title (at least 3 characters).");
      return;
    }

    const payload = {
      title: form.title.trim(),
      category: categoryMap[form.category] || "other",
      organization: form.organization.trim() || null,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      work_mode: form.work_mode.trim() || null,
      deadline: form.deadline.trim() || null,
      stipend_monthly: toNumberOrUndefined(form.stipend_monthly),
      salary_annual: toNumberOrUndefined(form.salary_annual),
      source_url: form.source_url.trim() || null,
      required_skills: form.skills
        ? form.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };

    setSaving(true);

    try {
      const result = await appendOpportunity(payload);
      onAppended(
        normalizeOpportunity(result.opportunity || result)
      );
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || "Could not save this opportunity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      <div className="form-grid">
        <Field label="Title *">
          <input name="title" value={form.title} onChange={change} placeholder="e.g. Summer AI Intern" required />
        </Field>
        <Field label="Category">
          <select name="category" value={form.category} onChange={change}>
            {["Internship", "Scholarship", "Hackathon", "Course", "Job", "Fellowship", "Other"].map(
              (option) => <option key={option}>{option}</option>
            )}
          </select>
        </Field>
        <Field label="Organization">
          <input name="organization" value={form.organization} onChange={change} placeholder="Company / university" />
        </Field>
        <Field label="Location">
          <input name="location" value={form.location} onChange={change} placeholder="Remote · India" />
        </Field>
        <Field label="Work mode">
          <select name="work_mode" value={form.work_mode} onChange={change}>
            <option value="">Not specified</option>
            <option>remote</option>
            <option>hybrid</option>
            <option>onsite</option>
          </select>
        </Field>
        <Field label="Deadline (YYYY-MM-DD)">
          <input name="deadline" value={form.deadline} onChange={change} placeholder="2026-12-31" />
        </Field>
        <Field label="Monthly stipend">
          <input name="stipend_monthly" value={form.stipend_monthly} onChange={change} placeholder="e.g. 15000" />
        </Field>
        <Field label="Annual salary">
          <input name="salary_annual" value={form.salary_annual} onChange={change} placeholder="e.g. 600000" />
        </Field>
        <Field label="Source URL">
          <input name="source_url" value={form.source_url} onChange={change} placeholder="https://..." />
        </Field>
        <Field label="Skills (comma-separated)">
          <input name="skills" value={form.skills} onChange={change} placeholder="Python, SQL, AI" />
        </Field>
        <Field label="Description" full>
          <textarea
            name="description"
            value={form.description}
            onChange={change}
            placeholder="A short summary of the opportunity and how to apply."
            rows={3}
          />
        </Field>
      </div>

      {error && (
        <div className="notice" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 12 }}>
        {saving ? "Appending..." : "Append to opportunities"}
      </button>
    </form>
  );
}

// Sidebar navigation.
function Sidebar() {
  const nav = [
    ["/dashboard", "▦", "Dashboard"],
    ["/opportunities", "⌕", "Explore opportunities"],
    ["/eligibility", "✓", "Eligibility check"],
    ["/saved", "♡", "Saved"],
    ["/calendar", "▦", "Calendar"],
    ["/upload-pdf", "⇧", "Import PDF"],
    ["/profile", "◉", "My profile"],
  ];

  return (
    <aside className="sidebar">
      <Link to="/dashboard" className="brand">
        <span className="brandmark">✦</span>
        <span>Nexora</span>
      </Link>

      <div className="navlabel">WORKSPACE</div>

      {nav.map(([to, icon, label]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `navlink ${isActive ? "active" : ""}`
          }
        >
          <span className="navicon">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}

      <div className="navlabel">ACCOUNT</div>

      <NavLink
        to="/onboarding"
        className={({ isActive }) =>
          `navlink ${isActive ? "active" : ""}`
        }
      >
        <span className="navicon">✧</span>
        <span>Preferences</span>
      </NavLink>

      <div className="side-bottom">
        Your next opportunity starts here.
        <div className="user-chip">
          <div className="avatar">R</div>
          <div>
            <strong>Student account</strong>
            <small>Personal workspace</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Shell({ children }) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}

// Calendar page uses the same layout as the rest of Nexora.
function CalendarPage() {
  return (
    <Shell>
      <Calendar />
    </Shell>
  );
}

function EligibilityPage() {
  return (
    <Shell>
      <EligibilityChecker />
    </Shell>
  );
}

function OpportunityCard({ item }) {
  const [saved, setSavedState] = useState(() =>
    getSaved().some((id) => String(id) === String(item.id))
  );

  function toggle() {
    const old = getSaved().map(String);
    const itemId = String(item.id);

    const next = saved
      ? old.filter((id) => id !== itemId)
      : [...new Set([...old, itemId])];

    setSaved(next);
    setSavedState(!saved);
    window.dispatchEvent(new Event("nexora-saved-change"));
  }

  const tone =
    item.category === "Scholarship"
      ? "green"
      : item.category === "Hackathon"
        ? "orange"
        : "";

  return (
    <article className="op-card">
      <div className="card-top">
        <div className="org">
          <div className="org-logo">{item.icon}</div>
          <div>
            <div className="org-name">{item.org}</div>
            <h3 className="card-title">{item.title}</h3>
          </div>
        </div>

        <button
          aria-label={saved ? "Unsave" : "Save"}
          className={`save-btn ${saved ? "saved" : ""}`}
          onClick={toggle}
        >
          {saved ? "♥" : "♡"}
        </button>
      </div>

      <div className="tag-row">
        <span className={`pill ${tone}`}>{item.category}</span>
        {item.verified && <span className="pill green">✓ Verified</span>}
      </div>

      <p className="card-desc">{item.description}</p>

      <div className="meta">
        <span>⌖ {item.location}</span>
        <span>◷ {item.deadline}</span>
      </div>

      <div className="card-footer">
        <span className="deadline">{item.amount}</span>
        <Link className="small-btn" to={`/opportunity/${item.id}`}>
          View details ↗
        </Link>
      </div>
    </article>
  );
}

function Explorer({
  items = opportunities,
  title = "Explore opportunities",
  subtitle = "Find scholarships, internships, hackathons and learning resources.",
  toolbar = null,
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((o) => {
        const matchesCategory =
          category === "All" || o.category === category;

        const searchableText = [
          o.title,
          o.org,
          o.description,
          ...(o.tags || []),
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesCategory &&
          searchableText.includes(query.toLowerCase())
        );
      }),
    [items, category, query]
  );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">DISCOVER YOUR NEXT STEP</div>
          <h1 className="h1">{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>

        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ Search opportunities..."
        />
      </div>

      <div className="filters">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`filter ${category === c ? "active" : ""}`}
          >
            {c}
          </button>
        ))}
      </div>

      {toolbar}

      <div className="section-head">
        <div>
          <h2>{filtered.length} opportunities</h2>
          <p>Use filters to narrow down the list.</p>
        </div>
      </div>

      {filtered.length ? (
        <div className="cards">
          {filtered.map((item) => (
            <OpportunityCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <strong>No matching opportunities</strong>
          Try a different search term or category.
        </div>
      )}

      <p className="footer-note">
        Listings come from the connected API or demo fallback data.
        Always confirm eligibility and deadlines on the official page.
      </p>
    </>
  );
}

function Dashboard() {
  const { items, loading, error, refresh } = useOpportunities();

  const counts = [
    ["Scholarships", "🏛️", items.filter((o) => o.category === "Scholarship").length, "Explore funding"],
    ["Internships", "💻", items.filter((o) => o.category === "Internship").length, "Build experience"],
    ["Hackathons", "🚀", items.filter((o) => o.category === "Hackathon").length, "Build with a team"],
    ["Open jobs", "💼", items.filter((o) => o.category === "Job").length, "Apply directly"],
  ];

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">YOUR OPPORTUNITY HUB</div>
          <h1 className="h1">Good to see you, Ranveer 👋</h1>
          <p className="subtitle">
            A clearer path from your interests to your next opportunity.
          </p>
        </div>

        <Link to="/profile" className="btn btn-light">
          ◉ My profile
        </Link>
      </div>

      {loading && <p>Loading opportunities...</p>}

      {error && (
        <div className="notice">
          API connection failed: {error}. Showing available fallback data.
          <button
            className="btn btn-light"
            style={{ marginLeft: 10 }}
            onClick={refresh}
          >
            Retry ↻
          </button>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow">MAKE YOUR NEXT MOVE</div>
          <h2>Small steps. Bigger possibilities.</h2>
          <p>
            Discover opportunities, save the ones that fit, and build a
            shortlist you can act on.
          </p>
          <Link to="/opportunities" className="btn hero-btn">
            Explore opportunities ↗
          </Link>
        </div>

        <div className="hero-stat">
          <strong>{items.length}</strong>
          <span>live opportunities loaded</span>
        </div>
      </section>

      <div className="stats">
        {counts.map(([label, icon, n, note]) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className="stat-icon">{icon}</span>
            </div>
            <div className="stat-number">{n}</div>
            <div className="stat-note">{note}</div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <div>
          <h2>Picked for your journey</h2>
          <p>Start exploring. Save anything you want to revisit.</p>
        </div>
        <Link to="/opportunities" className="btn btn-light">
          View all ↗
        </Link>
      </div>

      {items.length ? (
        <div className="cards">
          {items.slice(0, 3).map((item) => (
            <OpportunityCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="empty">
            <strong>No opportunities found</strong>
            Open the explore page and import real opportunities.
          </div>
        )
      )}

      <div className="two-col" style={{ marginTop: 22 }}>
        <section className="panel">
          <h3>Build a strong profile</h3>
          <p className="panel-sub">
            A few details can help you assess eligibility faster.
          </p>

          <ProfileMeter />

          <Link to="/profile" className="btn btn-primary">
            Complete profile →
          </Link>
        </section>

        <section className="panel">
          <h3>Quick reminders</h3>
          <p className="panel-sub">Make every application count.</p>
          <Activity icon="✓" title="Verify eligibility first" text="Check income, course, category and location rules." />
          <Activity icon="◷" title="Check the deadline" text="Confirm the current cycle on the official website." />
          <Activity icon="↗" title="Keep documents ready" text="Resume, marksheets and certificates may be needed." />
        </section>
      </div>
    </Shell>
  );
}

function ProfileMeter() {
  const [state, setState] = useState({ percent: 0, loaded: false });

  useEffect(() => {
    getMyProfile()
      .then((profile) => {
        const fields = [
          profile.degree,
          profile.year_of_study,
          (profile.skills || []).length,
          (profile.interests || []).length,
          profile.marks_percentage > 0,
          profile.preferred_location,
        ];
        const filled = fields.filter(Boolean).length;
        setState({
          percent: Math.round((filled / fields.length) * 100),
          loaded: true,
        });
      })
      .catch(() => {})
      .finally(() => setState((s) => ({ ...s, loaded: true })));
  }, []);

  const percent = state.loaded ? Math.max(state.percent, 35) : 35;

  return (
    <div className="progress-row" key="profile">
      <div className="progress-label">
        <span>Profile completeness</span>
        <strong>{percent}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// Checklist rows for the detail sidebar. Only rows with real
// data are shown, so nothing displays vague placeholders.
function buildQuickChecklist(item) {
  const rows = [];

  if (item.location) {
    rows.push(["⌖", "Location", item.location]);
  }

  if (item.workMode) {
    rows.push(["◉", "Work mode", item.workMode]);
  }

  if (item.durationMonths) {
    rows.push(["▦", "Duration", `${item.durationMonths} months`]);
  }

  if (item.salary) {
    rows.push(["💰", "Annual salary", `₹${Number(item.salary).toLocaleString()} / yr`]);
  } else if (item.stipend) {
    rows.push(["💰", "Monthly stipend", `₹${Number(item.stipend).toLocaleString()} / mo`]);
  } else if (item.prize) {
    rows.push(["🏆", "Prize pool", item.prize]);
  }

  if (item.skills.length) {
    rows.push(["⌁", "Skills", item.skills.join(", ")]);
  }

  if (item.marksRequired != null) {
    rows.push(["✓", "Minimum marks", `${item.marksRequired}%`]);
  }

  if (item.incomeCap != null) {
    rows.push(["✓", "Family income cap", `₹${Number(item.incomeCap).toLocaleString()} / yr`]);
  }

  if (item.deadlineCountdown) {
    rows.push([
      "◷",
      "Time remaining",
      item.deadlineCountdown.label,
      item.deadlineCountdown.tone,
    ]);
  }

  rows.push([
    item.verified ? "✓" : "?",
    "Verification",
    item.verified
      ? "Verified listing"
      : "Not verified — check the official page",
    item.verified ? "green" : "orange",
  ]);

  return rows;
}

function Activity({ icon, title, text, tone }) {
  return (
    <div className="activity">
      <div className="activity-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <span
          style={
            tone === "green"
              ? { color: "#15803d" }
              : tone === "orange"
                ? { color: "#b45309" }
                : undefined
          }
        >
          {text}
        </span>
      </div>
    </div>
  );
}

function OpportunityPage() {
  const { items, setItems, loading, error, refresh } = useOpportunities();

  return (
    <Shell>
      {loading && <p>Loading opportunities...</p>}
      {error && <div className="notice">API error: {error}</div>}
      <Explorer
        items={items}
        title="Explore opportunities"
        subtitle="Real listings synced from public sources, plus anything you add."
        toolbar={
          <OpportunityToolbar
            items={items}
            setItems={setItems}
            refresh={refresh}
          />
        }
      />
    </Shell>
  );
}

function Detail() {
  const { id } = useParams();
  const { items, loading, error } = useOpportunities();
  const item = items.find((o) => String(o.id) === String(id));

  if (loading) {
    return <Shell><p>Loading opportunity details...</p></Shell>;
  }

  if (!item) {
    return (
      <Shell>
        <div className="empty">
          <strong>Opportunity not found</strong>
          {error && <p>{error}</p>}
          <Link to="/opportunities">Back to opportunities</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="topbar">
        <div>
          <Link to="/opportunities" className="subtitle">← Back to opportunities</Link>
          <div className="eyebrow" style={{ marginTop: 18 }}>{item.category}</div>
          <h1 className="h1">{item.title}</h1>
          <p className="subtitle">{item.org} · {item.location}</p>
        </div>

        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-primary">
            Open source page ↗
          </a>
        )}
      </div>

      <div className="detail-grid">
        <section className="panel">
          <div className="org">
            <div className="org-logo detail-logo">{item.icon}</div>
            <div>
              <div className="org-name">{item.org}</div>
              <h2 className="detail-heading">{item.title}</h2>
            </div>
          </div>

          <div className="detail-facts">
            <div className="fact"><span>TYPE</span><strong>{item.type}</strong></div>
            <div className="fact">
              <span>{item.salary ? "ANNUAL SALARY" : "MONTHLY STIPEND"}</span>
              <strong>
                {item.salary
                  ? `₹${Number(item.salary).toLocaleString()} / yr`
                  : item.stipend
                    ? `₹${Number(item.stipend).toLocaleString()} / mo`
                    : item.amount}
              </strong>
            </div>
            <div className="fact">
              <span>DEADLINE</span>
              <strong>
                {item.deadline}{" "}
                {item.deadlineCountdown && (
                  <span className={`pill ${item.deadlineCountdown.tone}`}>
                    {item.deadlineCountdown.label}
                  </span>
                )}
              </strong>
            </div>
            <div className="fact">
              <span>WORK MODE</span>
              <strong>{item.workMode || item.level}</strong>
            </div>
            {item.durationMonths && (
              <div className="fact">
                <span>DURATION</span>
                <strong>{item.durationMonths} months</strong>
              </div>
            )}
            {item.prize && (
              <div className="fact">
                <span>PRIZE POOL</span>
                <strong>{item.prize}</strong>
              </div>
            )}
          </div>

          <h3>About this opportunity</h3>
          <p className="detail-body">{item.description}</p>

          <h3>Required skills</h3>
          <p className="detail-body">
            {item.skills.length ? item.skills.join(", ") : "Not specified"}
          </p>

          {(item.marksRequired != null || item.incomeCap != null) && (
            <>
              <h3>Eligibility gates</h3>
              <div className="detail-facts">
                {item.marksRequired != null && (
                  <div className="fact">
                    <span>MINIMUM MARKS</span>
                    <strong>{item.marksRequired}%</strong>
                  </div>
                )}
                {item.incomeCap != null && (
                  <div className="fact">
                    <span>FAMILY INCOME CAP</span>
                    <strong>₹{Number(item.incomeCap).toLocaleString()} / yr</strong>
                  </div>
                )}
              </div>
            </>
          )}

          <h3>Before you apply</h3>
          <ul className="detail-body">
            <li>Read the current official notification carefully.</li>
            <li>Confirm eligibility, deadline, documents and any fees.</li>
            <li>Never share passwords or OTPs with a recruiter.</li>
          </ul>

          <div className="notice">
            Verify all current details on the official source before applying.
            {item.verified
              ? " This listing is marked verified by the backend."
              : " This listing has not been marked verified."}
          </div>

          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-primary">
              Visit source website ↗
            </a>
          )}
        </section>

        <aside className="panel">
          <h3>Quick information</h3>
          <p className="panel-sub">Use this as a checklist.</p>
          {buildQuickChecklist(item).map(([icon, title, text, tone]) => (
            <Activity
              key={title + text}
              icon={icon}
              title={title}
              text={text}
              tone={tone}
            />
          ))}
        </aside>
      </div>

      <div className="section-head"><div><h2>You may also like</h2></div></div>
      <div className="cards">
        {items.filter((o) => o.id !== item.id && o.category === item.category)
          .slice(0, 3)
          .map((o) => <OpportunityCard key={o.id} item={o} />)}
      </div>
    </Shell>
  );
}

function Saved() {
  const { items: allItems, loading, error } = useOpportunities();
  const [ids, setIds] = useState(() => getSaved().map(String));

  useEffect(() => {
    const read = () => setIds(getSaved().map(String));
    window.addEventListener("nexora-saved-change", read);
    window.addEventListener("storage", read);

    return () => {
      window.removeEventListener("nexora-saved-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const items = allItems.filter((o) => ids.includes(String(o.id)));

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">YOUR SHORTLIST</div>
          <h1 className="h1">Saved opportunities</h1>
          <p className="subtitle">Keep useful opportunities together so you can review them later.</p>
        </div>
      </div>

      {loading && <p>Loading saved opportunities...</p>}
      {error && <div className="notice">API error: {error}. Some saved listings may not appear.</div>}

      {items.length ? (
        <>
          <div className="section-head">
            <div><h2>{items.length} saved</h2><p>Saved in this browser on this device.</p></div>
          </div>
          <div className="cards">{items.map((item) => <OpportunityCard key={item.id} item={item} />)}</div>
        </>
      ) : (
        !loading && <div className="empty"><strong>No saved opportunities yet</strong>Use the heart button on any opportunity card to save it.</div>
      )}
    </Shell>
  );
}

// ------------------------------------------------------------
// Profile — connected to the backend with a local fallback
// ------------------------------------------------------------

function initials(name) {
  if (!name || !name.trim()) return "◆";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function Profile() {
  const defaults = {
    name: "Ranveer Kumar",
    email: "",
    college: "",
    degree: "B.Tech",
    year: "1st Year",
    interests: "Python, AI/ML, backend development",
    location: "India",
    work_mode: "Any",
    marks: "",
  };

  const [profile, setProfile] = useState(defaults);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverLinked, setServerLinked] = useState(false);

  // Load: try the backend first, fall back to local storage.
  useEffect(() => {
    let local = defaults;
    try {
      local = {
        ...defaults,
        ...JSON.parse(localStorage.getItem("nexora_profile") || "{}"),
      };
    } catch { /* keep defaults */ }

    setProfile(local);

    getMyProfile()
      .then((saved) => {
        setProfile((previous) => ({
          ...previous,
          degree: saved.degree || previous.degree,
          year: saved.year_of_study || previous.year,
          location: saved.preferred_location || previous.location,
          work_mode:
            saved.preferred_work_mode
              ? saved.preferred_work_mode.replace(
                  /^\w/,
                  (c) => c.toUpperCase()
                )
              : previous.work_mode,
          marks: saved.marks_percentage
            ? String(saved.marks_percentage)
            : previous.marks,
          interests: (saved.interests || []).join(", ") || previous.interests,
        }));
        setServerLinked(true);
      })
      .catch(() => setServerLinked(false))
      .finally(() => setLoading(false));
  }, []);

  function change(e) {
    setProfile({ ...profile, [e.target.name]: e.target.value });
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    try {
      localStorage.setItem("nexora_profile", JSON.stringify(profile));
    } catch { /* storage may be unavailable */ }

    try {
      await saveMyProfile({
        degree: profile.degree,
        course: profile.degree,
        year_of_study: profile.year,
        preferred_location: profile.location,
        preferred_work_mode: profile.work_mode.toLowerCase(),
        marks_percentage: profile.marks ? Number(profile.marks) : undefined,
        interests: profile.interests
          ? profile.interests.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        skills: (profile.interests || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6),
      });
      setServerLinked(true);
      setMessage(serverLinked
        ? "Profile saved to your Nexora account and this browser."
        : "Profile saved. Saved locally — the backend profile is ready once the API is reachable.");
    } catch (err) {
      setIsError(false);
      setMessage(
        "Profile saved in this browser only. Backend says: " +
          (err.message || "unreachable")
      );
    }
  }

  const chips = [
    profile.degree,
    profile.year,
    profile.work_mode !== "Any" ? profile.work_mode : null,
    profile.location,
  ].filter(Boolean);

  const complete = [
    profile.name, profile.email, profile.college, profile.degree,
    profile.year, profile.interests, profile.location, profile.marks,
  ].filter((value) => value && value.trim()).length;

  const completeness = Math.round((complete / 8) * 100);

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">YOUR DETAILS</div>
          <h1 className="h1">My profile</h1>
          <p className="subtitle">
            Keep your education and interests ready for opportunity matching.
          </p>
        </div>
      </div>

      <div className="form-wrap">
        <form className="form-panel" onSubmit={save}>
          <div className="org profile-intro">
            <div className="avatar profile-avatar">{initials(profile.name)}</div>
            <div>
              <h2 className="form-title">{profile.name || "Student profile"}</h2>
              <span className="muted small-text">
                {serverLinked
                  ? "Linked to your Nexora backend account"
                  : "Saved locally — connect the backend to sync"}
              </span>
            </div>
          </div>

          <div className="card-facts" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 8px" }}>
            {chips.map((chip) => (
              <span className="pill" key={chip}>{chip}</span>
            ))}
          </div>

          <div className="progress-row">
            <div className="progress-label">
              <span>Profile completeness</span>
              <strong>{completeness}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${completeness}%` }} />
            </div>
          </div>

          {loading && <p className="muted small-text">Loading saved profile...</p>}

          {message && (
            <div className={`${isError || message.startsWith("Profile saved in") ? "notice" : "toast"}`}>
              {message}
            </div>
          )}

          <div className="form-grid">
            <Field label="Full name"><input name="name" value={profile.name} onChange={change} /></Field>
            <Field label="Email"><input name="email" type="email" value={profile.email} onChange={change} placeholder="you@example.com" /></Field>
            <Field label="College / university"><input name="college" value={profile.college} onChange={change} placeholder="Your college" /></Field>
            <Field label="Degree">
              <select name="degree" value={profile.degree} onChange={change}>
                <option>B.Tech</option><option>B.E.</option><option>B.Sc.</option><option>BCA</option><option>MBA</option><option>Diploma</option><option>Other</option>
              </select>
            </Field>
            <Field label="Study year">
              <select name="year" value={profile.year} onChange={change}>
                <option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option><option>Graduate</option>
              </select>
            </Field>
            <Field label="Marks (%)"><input name="marks" value={profile.marks} onChange={change} placeholder="e.g. 78" inputMode="decimal" /></Field>
            <Field label="Location / domicile"><input name="location" value={profile.location} onChange={change} /></Field>
            <Field label="Preferred work mode">
              <select name="work_mode" value={profile.work_mode} onChange={change}>
                <option>Any</option><option>Remote</option><option>Hybrid</option><option>On-site</option>
              </select>
            </Field>
            <Field label="Interests and skills" full><textarea name="interests" value={profile.interests} onChange={change} /></Field>
          </div>

          <div className="notice">
            Degree, year, marks, work mode and skills are stored in your Nexora
            account via the API. Name, email and college stay in this browser for now.
          </div>
          <button className="btn btn-primary" type="submit">
            Save profile
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Field({ label, children, full }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}</div>;
}

function Onboarding() {
  const [form, setForm] = useState(() => {
    const defaults = {
      interests: ["Scholarship", "Internship"],
      mode: "Remote",
      goal: "Get an internship",
      skills: "Python, FastAPI, SQL",
    };

    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("nexora_preferences") || "{}") };
    } catch {
      return defaults;
    }
  });

  const [saved, setSavedState] = useState(false);

  function toggle(value) {
    setForm((previous) => ({
      ...previous,
      interests: previous.interests.includes(value)
        ? previous.interests.filter((x) => x !== value)
        : [...previous.interests, value],
    }));
  }

  function submit(e) {
    e.preventDefault();
    localStorage.setItem("nexora_preferences", JSON.stringify(form));
    setSavedState(true);
  }

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">PERSONALIZE NEXORA</div>
          <h1 className="h1">Your preferences</h1>
          <p className="subtitle">Tell Nexora what you are looking for.</p>
        </div>
      </div>

      <div className="form-wrap">
        <form className="form-panel" onSubmit={submit}>
          <h2 className="form-title">What should we help you find?</h2>
          <p className="panel-sub">Choose all categories you care about.</p>

          {["Scholarship", "Internship", "Job", "Hackathon", "Course"].map((value) => (
            <label className="check-row" key={value}>
              <input type="checkbox" checked={form.interests.includes(value)} onChange={() => toggle(value)} />
              {value}
            </label>
          ))}

          <Field label="Preferred work mode">
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option>Remote</option><option>Hybrid</option><option>On-site</option><option>Any</option>
            </select>
          </Field>

          <Field label="Main goal">
            <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
              <option>Get an internship</option><option>Find scholarships</option><option>Join hackathons</option><option>Learn new skills</option><option>Explore all options</option>
            </select>
          </Field>

          <Field label="Skills / topics"><input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>

          <div className="notice">This prototype does not make scholarship eligibility decisions.</div>
          {saved && <div className="toast">Preferences saved in this browser.</div>}

          <button className="btn btn-primary" type="submit">Save preferences</button>{" "}
          <Link to="/opportunities" className="btn btn-light">Explore now</Link>
        </form>
      </div>
    </Shell>
  );
}

function Auth({ signup = false }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function submit(e) {
    e.preventDefault();
    setMessage("Demo only: authentication is not connected yet.");
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link to="/dashboard" className="brand auth-brand"><span className="brandmark">✦</span>Nexora</Link>
        <div className="eyebrow auth-eyebrow">{signup ? "GET STARTED" : "WELCOME BACK"}</div>
        <h1 className="h1">{signup ? "Create your account" : "Log in to your workspace"}</h1>
        <p className="subtitle">Your next opportunity is closer than you think.</p>

        {message && <div className="notice auth-notice">{message} <Link to="/dashboard">Go to dashboard →</Link></div>}

        <form onSubmit={submit} className="auth-form">
          {signup && <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>}
          <Field label="Email address"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <Field label="Password"><input type="password" required minLength={signup ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={signup ? "At least 8 characters" : "Enter your password"} /></Field>
          <button className="btn btn-primary auth-submit" type="submit">{signup ? "Create account" : "Log in"}</button>
        </form>

        <p className="subtitle auth-switch">
          {signup ? "Already have an account? " : "New to Nexora? "}
          <Link to={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Create account"}</Link>
        </p>
        <p className="footer-note">Prototype UI — connect real authentication before production.</p>
      </div>
    </main>
  );
}

function NotFound() {
  return <div className="empty not-found"><strong>Page not found</strong><Link to="/dashboard">Return to dashboard</Link></div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/opportunities" element={<OpportunityPage />} />
      <Route path="/eligibility" element={<EligibilityPage />} />
      <Route path="/calendar" element={<CalendarPage />} />

      {/* PDF upload route */}
      <Route
        path="/upload-pdf"
        element={
          <Shell>
            <PdfUpload />
          </Shell>
        }
      />

      <Route path="/opportunity/:id" element={<Detail />} />
      <Route path="/saved" element={<Saved />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/signup" element={<Auth signup />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
