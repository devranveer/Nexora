import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { checkEligibility, getMyProfile } from "./api.js";

const SUPPORTED_CATEGORIES = ["scholarship", "internship", "job", "fellowship"];

const STATUS_META = {
  potential_match: {
    label: "Potential match",
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

// Build the matcher payload from the saved backend profile.
function profileToPayload(profile, category) {
  const numberOrNull = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const workMode = (profile.preferred_work_mode || "").toLowerCase();

  return {
    category,
    course: profile.course || profile.degree || null,
    degree: profile.degree || null,
    year_of_study: profile.year_of_study || null,
    marks_percentage: numberOrNull(profile.marks_percentage),
    annual_family_income: numberOrNull(profile.annual_family_income),
    student_category: null,
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    research_interests: Array.isArray(profile.interests)
      ? profile.interests
      : [],
    location: profile.preferred_location || null,
    work_mode: workMode && workMode !== "any" ? workMode : null,
    expected_stipend: numberOrNull(profile.expected_stipend),
    expected_salary: null,
    experience_years: null,
  };
}

export default function ProfileMatch({ item }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    result: null,
    skillOverlap: null,
  });

  useEffect(() => {
    let active = true;

    setState({ loading: true, error: "", result: null, skillOverlap: null });

    (async () => {
      try {
        const profile = await getMyProfile();

        // Hackathons/courses/other: the rule-based matcher doesn't
        // support them, so show a simple skill-overlap view instead.
        if (!SUPPORTED_CATEGORIES.includes(item.rawCategory)) {
          const mySkills = (profile.skills || []).map((s) =>
            String(s).toLowerCase()
          );
          const listingSkills = (item.skills || []).map((s) =>
            String(s).toLowerCase()
          );
          const shared = listingSkills.filter((s) =>
            mySkills.some((mine) => mine === s || mine.includes(s) || s.includes(mine))
          );

          if (!active) return;
          setState({
            loading: false,
            error: "",
            result: null,
            skillOverlap: shared,
          });
          return;
        }

        const data = await checkEligibility(
          profileToPayload(profile, item.rawCategory)
        );

        const result = (data.results || []).find(
          (r) => String(r.id) === String(item.id)
        );

        if (!active) return;

        setState({
          loading: false,
          error: "",
          result: result || null,
          skillOverlap: null,
        });
      } catch (err) {
        if (!active) return;
        setState({
          loading: false,
          error: err.message || "Could not check your match.",
          result: null,
          skillOverlap: null,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [item.id, item.rawCategory]);

  if (state.loading) {
    return (
      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Your eligibility match</h3>
        <p className="panel-sub">Comparing with your saved profile...</p>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Your eligibility match</h3>
        <div className="notice">
          Could not compare with your profile: {state.error}
        </div>
        <Link to="/eligibility" className="btn btn-light">
          Open the eligibility checker →
        </Link>
      </section>
    );
  }

  const meta = state.result
    ? STATUS_META[state.result.match_status]
    : null;

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h3>Your eligibility match</h3>
          <p className="panel-sub">
            Based on your saved profile. Open the eligibility checker to
            change details or check other listings.
          </p>
        </div>
        {meta && (
          <span className={`pill ${meta.tone}`}>
            {meta.icon} {meta.label}
          </span>
        )}
      </div>

      {state.result ? (
        <>
          {state.result.matching_reasons?.length > 0 && (
            <div className="notice" style={{ marginTop: 10 }}>
              {state.result.matching_reasons.map((reason) => (
                <div key={reason}>✓ {reason}</div>
              ))}
            </div>
          )}

          {state.result.missing_information?.length > 0 && (
            <div className="notice" style={{ marginTop: 10 }}>
              {state.result.missing_information.map((note) => (
                <div key={note}>? {note}</div>
              ))}
            </div>
          )}

          {state.result.mismatches?.length > 0 && (
            <div className="notice" style={{ marginTop: 10 }}>
              {state.result.mismatches.map((note) => (
                <div key={note}>✕ {note}</div>
              ))}
            </div>
          )}

          <p className="footer-note">
            Preliminary matching only — not confirmation of eligibility.
          </p>
        </>
      ) : state.skillOverlap !== null ? (
        state.skillOverlap.length ? (
          <div className="notice" style={{ marginTop: 10 }}>
            Skills you have that this listing also looks for:
            <div className="tag-row" style={{ marginTop: 8 }}>
              {state.skillOverlap.map((skill) => (
                <span className="pill green" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : (item.skills || []).length ? (
          <div className="notice" style={{ marginTop: 10 }}>
            This listing asks for skills you haven't added to your profile
            yet. Update your profile to compare properly.
          </div>
        ) : (
          <div className="notice" style={{ marginTop: 10 }}>
            This listing doesn't specify required skills, so a skills match
            can't be computed. Check the source page for details.
          </div>
        )
      ) : (
        <div className="notice" style={{ marginTop: 10 }}>
          This listing was not found in the current match run.
        </div>
      )}
    </section>
  );
}
