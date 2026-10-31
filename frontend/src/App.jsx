
import React, { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
} from "react-router-dom";

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
import Calendar from "./Calendar";
import {
  opportunities,
  categories,
  getSaved,
  setSaved,
} from "./data.js";

import { getOpportunities } from "./api.js";

// Convert backend data into the format used by the Nexora UI.
function normalizeOpportunity(item) {
  const categoryMap = {
    scholarship: "Scholarship",
    internship: "Internship",
    hackathon: "Hackathon",
    course: "Course",
  };

  const category =
    categoryMap[String(item.category || "").toLowerCase()] || "Other";

  let url = item.source_url || "";

  const match = url.match(/^\[.*?\]\((https?:\/\/.*?)\)$/);
  if (match) url = match[1];

  return {
    id: String(item.id),
    title: item.title || "Untitled opportunity",
    org: item.organization || "Organization not specified",
    category,
    icon:
      category === "Scholarship"
        ? "🎓"
        : category === "Internship"
          ? "💻"
          : category === "Hackathon"
            ? "🚀"
            : category === "Course"
              ? "🧠"
              : "✨",
    type: category,
    amount: "See official listing",
    location: "See listing details",
    deadline: item.deadline || "Not specified",
    level: "Check eligibility",
    description: item.description || "No description available.",
    tags: [category, ...(item.eligibility?.eligible_courses || [])],
    url,
    verified: item.verified ?? false,
  };
}

// Fetch live opportunities from FastAPI.
function useOpportunities() {
  const [items, setItems] = useState(opportunities);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getOpportunities()
      .then((data) => {
        if (!cancelled) {
          setItems(data.map(normalizeOpportunity));
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not connect to the backend.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}

// Sidebar navigation.
function Sidebar() {
  const nav = [
    ["/dashboard", "▦", "Dashboard"],
    ["/opportunities", "⌕", "Explore opportunities"],
    ["/saved", "♡", "Saved"],
    ["/calendar", "▦", "Calendar"],
    ["/upload-pdf", "⇧", "Import PDF"],
    ["/profile", "◉", "My profile"],
  ];
  {nav.map(([path, icon, label]) => (
  <NavLink key={path} to={path}>
    <span>{icon}</span>
    <span>{label}</span>
  </NavLink>
))}

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
  const { items, loading, error } = useOpportunities();

  const counts = [
    ["Scholarships", "🏛️", items.filter((o) => o.category === "Scholarship").length, "Explore funding"],
    ["Internships", "💻", items.filter((o) => o.category === "Internship").length, "Build experience"],
    ["Hackathons", "🚀", items.filter((o) => o.category === "Hackathon").length, "Build with a team"],
    ["Courses", "🧠", items.filter((o) => o.category === "Course").length, "Keep learning"],
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
          <strong>4</strong>
          <span>categories to explore</span>
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
            Add opportunities through your backend API.
          </div>
        )
      )}

      <div className="two-col" style={{ marginTop: 22 }}>
        <section className="panel">
          <h3>Build a strong profile</h3>
          <p className="panel-sub">
            A few details can help you assess eligibility faster.
          </p>

          {[
            ["Education details", 35],
            ["Skills and interests", 60],
            ["Career preferences", 25],
          ].map(([name, p]) => (
            <div className="progress-row" key={name}>
              <div className="progress-label">
                <span>{name}</span>
                <strong>{p}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${p}%` }} />
              </div>
            </div>
          ))}

          <Link to="/onboarding" className="btn btn-primary">
            Complete preferences →
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

function Activity({ icon, title, text }) {
  return (
    <div className="activity">
      <div className="activity-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function OpportunityPage() {
  const { items, loading, error } = useOpportunities();

  return (
    <Shell>
      {loading && <p>Loading opportunities...</p>}
      {error && <div className="notice">API error: {error}</div>}
      <Explorer items={items} />
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
            <div className="fact"><span>AMOUNT / STIPEND</span><strong>{item.amount}</strong></div>
            <div className="fact"><span>DEADLINE</span><strong>{item.deadline}</strong></div>
          </div>

          <h3>About this opportunity</h3>
          <p className="detail-body">{item.description}</p>

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
          <Activity icon="⌖" title="Location" text={item.location} />
          <Activity icon="◉" title="Level" text={item.level} />
          <Activity icon="⌁" title="Tags" text={item.tags.join(", ")} />
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

function Profile() {
  const [profile, setProfile] = useState(() => {
    const defaults = {
      name: "Ranveer Kumar",
      email: "",
      college: "",
      degree: "B.Tech",
      year: "1st Year",
      interests: "Python, AI/ML, backend development",
      location: "India",
    };

    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("nexora_profile") || "{}") };
    } catch {
      return defaults;
    }
  });

  const [message, setMessage] = useState("");

  function change(e) {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  }

  function save(e) {
    e.preventDefault();
    localStorage.setItem("nexora_profile", JSON.stringify(profile));
    setMessage("Profile saved in this browser.");
  }

  return (
    <Shell>
      <div className="topbar">
        <div>
          <div className="eyebrow">YOUR DETAILS</div>
          <h1 className="h1">My profile</h1>
          <p className="subtitle">Keep your education and interests ready for opportunity matching.</p>
        </div>
      </div>

      <div className="form-wrap">
        <form className="form-panel" onSubmit={save}>
          <div className="org profile-intro">
            <div className="avatar profile-avatar">R</div>
            <div>
              <h2 className="form-title">Student profile</h2>
              <span className="muted small-text">Saved locally in your browser</span>
            </div>
          </div>

          {message && <div className="toast">{message}</div>}

          <div className="form-grid">
            <Field label="Full name"><input name="name" value={profile.name} onChange={change} /></Field>
            <Field label="Email"><input name="email" type="email" value={profile.email} onChange={change} placeholder="you@example.com" /></Field>
            <Field label="College / university"><input name="college" value={profile.college} onChange={change} placeholder="Your college" /></Field>
            <Field label="Degree">
              <select name="degree" value={profile.degree} onChange={change}>
                <option>B.Tech</option><option>B.E.</option><option>B.Sc.</option><option>BCA</option><option>Diploma</option><option>Other</option>
              </select>
            </Field>
            <Field label="Study year">
              <select name="year" value={profile.year} onChange={change}>
                <option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option><option>Graduate</option>
              </select>
            </Field>
            <Field label="Location / domicile"><input name="location" value={profile.location} onChange={change} /></Field>
            <Field label="Interests and skills" full><textarea name="interests" value={profile.interests} onChange={change} /></Field>
          </div>

          <div className="notice">Profile details are stored in your browser. They are not yet connected to your FastAPI database.</div>
          <button className="btn btn-primary" type="submit">Save profile</button>
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

          {["Scholarship", "Internship", "Hackathon", "Course"].map((value) => (
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

function PdfUploadPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleUpload() {
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await uploadOpportunityPdf(file);
      setResult(data);
    } catch (err) {
      setError(err.message || "PDF upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className="page">
        <h1>Import Opportunity from PDF</h1>
        <p>
          Upload a scholarship, internship, or other opportunity PDF.
          Nexora will extract its details using AI.
        </p>

        <div className="card" style={{ padding: 24, marginTop: 24 }}>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
              setResult(null);
            }}
          />

          {file && (
            <p style={{ marginTop: 12 }}>
              Selected file: <strong>{file.name}</strong>
            </p>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || loading}
            style={{ marginTop: 16 }}
          >
            {loading ? "Extracting details..." : "Upload and Extract"}
          </button>

          {error && (
            <p style={{ color: "red", marginTop: 16 }}>{error}</p>
          )}

          {result && (
            <div style={{ marginTop: 24 }}>
              <h2>Extracted Details</h2>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  padding: 16,
                  borderRadius: 8,
                  background: "#f3f4f6",
                  color: "#111827",
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}