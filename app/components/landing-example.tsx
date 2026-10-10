"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WorkspaceIcon } from "../workspace/workspace-shell";
import { GitHubMark } from "./landing-connect";
const skills = ["TypeScript", "React", "Node.js", "Python"];
export function WorkspaceExample() {
  const [active, setActive] = useState("readme");
  const reduced = useReducedMotion();
  return (
    <figure
      className="landing-example"
      aria-label="Interactive example workspace with sample content for M. Khalil"
    >
      <div className="landing-example-top">
        <span className="landing-brand">
          <WorkspaceIcon name="forge" />
          GitHubKit
        </span>
        <span className="landing-example-account">
          <GitHubMark />
          @iammalikkhalil
        </span>
        <span className="landing-example-avatar" aria-hidden="true">
          <WorkspaceIcon name="profile" />
        </span>
      </div>
      <div
        className="landing-example-tabs"
        role="tablist"
        aria-label="Explore the workspace"
      >
        {(
          [
            ["profile", "My Profile"],
            ["readme", "My README"],
            ["activity", "Generate Activity"],
          ] as const
        ).map(([id, label], index) => (
          <button
            type="button"
            role="tab"
            id={`demo-tab-${id}`}
            aria-selected={active === id}
            aria-controls="demo-panel"
            tabIndex={active === id ? 0 : -1}
            className={active === id ? "active" : ""}
            key={id}
            onClick={() => setActive(id)}
            onKeyDown={(event) => {
              const ids = ["profile", "readme", "activity"];
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % 3;
              else if (event.key === "ArrowLeft") next = (index + 2) % 3;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = 2;
              else return;
              event.preventDefault();
              setActive(ids[next]);
              document.getElementById(`demo-tab-${ids[next]}`)?.focus();
            }}
          >
            <WorkspaceIcon name={id} />
            {label}
          </button>
        ))}
      </div>
      <div
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${active}`}
        tabIndex={0}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            {active === "readme" ? (
              <div className="landing-example-panels">
                <div className="landing-example-editor">
                  <h3>README Content</h3>
                  <p className="landing-example-label">Name</p>
                  <div className="landing-example-input">M. Khalil</div>
                  <p className="landing-example-label">Introduction</p>
                  <div className="landing-example-input landing-example-textarea">
                    Software developer passionate about building useful tools
                    and learning in public.
                  </div>
                  <p className="landing-example-label">Skills</p>
                  <SkillChips />
                </div>
                <div className="landing-example-preview">
                  <h3>README Preview</h3>
                  <div className="landing-example-markdown">
                    <h4>Hi, I’m M. Khalil 👋</h4>
                    <p>
                      Software developer passionate about building useful tools
                      and learning in public.
                    </p>
                    <SkillChips />
                    <div className="landing-example-links">
                      <span>
                        <GitHubMark />
                        GitHub
                      </span>
                      <span>
                        <b className="landing-linkedin">in</b>LinkedIn
                      </span>
                      <span>↗ Website</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : active === "profile" ? (
              <ProfileDemo />
            ) : (
              <ActivityDemo />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <figcaption>
        <span>Interactive demo - sample content</span>
        <span className="landing-example-publish" aria-hidden="true">
          Publish to GitHub
        </span>
      </figcaption>
    </figure>
  );
}
function SkillChips() {
  return (
    <div className="landing-skills">
      {skills.map((skill, index) => (
        <span className={`landing-skill-${index}`} key={skill}>
          {skill}
        </span>
      ))}
    </div>
  );
}

function ProfileDemo() {
  return (
    <div className="landing-example-panels">
      <div>
        <h3>Public profile details</h3>
        <p className="landing-example-label">Name</p>
        <div className="landing-example-input">M. Khalil</div>
        <p className="landing-example-label">Bio</p>
        <div className="landing-example-input landing-example-textarea">
          Software developer building useful tools and learning in public.
        </div>
        <p className="landing-example-label">Website</p>
        <div className="landing-example-input">mkhalil.vercel.app</div>
      </div>
      <div>
        <h3>Profile preview</h3>
        <div className="landing-example-markdown landing-demo-profile">
          <span className="landing-demo-avatar">
            <WorkspaceIcon name="profile" />
          </span>
          <h4>M. Khalil</h4>
          <p className="landing-demo-handle">@iammalikkhalil</p>
          <p>
            Software developer building useful tools and learning in public.
          </p>
          <span className="landing-demo-status">
            Available for new opportunities
          </span>
        </div>
      </div>
    </div>
  );
}
function ActivityDemo() {
  return (
    <div className="landing-example-panels">
      <div>
        <h3>Shape your schedule</h3>
        <p className="landing-example-label">Date range</p>
        <div className="landing-example-input">Jan 1 - Dec 31, 2025</div>
        <p className="landing-example-label">Activity pattern</p>
        <div className="landing-example-input">
          Balanced - weekdays preferred
        </div>
        <p className="landing-example-label">Daily limit</p>
        <div className="landing-example-input">Up to 10 commits per day</div>
        <p className="landing-demo-note">
          Preview the schedule before publishing to a new private repository.
        </p>
      </div>
      <div>
        <h3>Synthetic activity preview</h3>
        <div className="landing-example-markdown">
          <div className="landing-demo-calendar" aria-hidden="true">
            {Array.from({ length: 182 }, (_, i) => (
              <span key={i} data-level={(i * 7 + Math.floor(i / 7) * 3) % 5} />
            ))}
          </div>
          <div className="landing-demo-legend">
            Less <span /> <span /> <span /> More
          </div>
          <p className="landing-demo-note">
            Illustrative sample. Generated history is synthetic; GitHub
            determines contribution eligibility.
          </p>
        </div>
      </div>
    </div>
  );
}
