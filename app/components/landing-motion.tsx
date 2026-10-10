"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, inView, stagger, scroll } from "motion";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = matchMedia("(min-width: 901px) and (pointer: fine)");
    let cleanup = () => {};
    const configure = () => {
      cleanup();
      const stops: (() => void)[] = [];
      const header = element.querySelector("header");
      const updateHeader = () =>
        header?.classList.toggle("is-scrolled", window.scrollY > 16);
      updateHeader();
      window.addEventListener("scroll", updateHeader, { passive: true });
      stops.push(() => window.removeEventListener("scroll", updateHeader));
      if (!preference.matches) {
        const play = (targets: Element[], delay = 0) => {
          if (!targets.length) return;
          const animation = animate(
            targets,
            { opacity: [0, 1], y: [18, 0] },
            {
              duration: 0.5,
              delay: stagger(0.08, { startDelay: delay }),
              ease: [0.22, 1, 0.36, 1],
            },
          );
          stops.push(() => animation.complete());
        };
        play(
          Array.from(
            element.querySelectorAll(
              ".landing-eyebrow, .landing-hero h1, .landing-hero-description, .landing-hero-action",
            ),
          ),
        );
        const preview = element.querySelector<HTMLElement>(".landing-example");
        if (preview) {
          const entrance = animate(
            preview,
            { opacity: [0, 1], scale: [0.98, 1], y: [20, 0] },
            { duration: 0.65, delay: 0.25 },
          );
          stops.push(() => entrance.complete());
        }
        element
          .querySelectorAll(
            ".landing-features, .landing-steps, .landing-access, .landing-faq, .landing-final, .landing-creator",
          )
          .forEach((section) => {
            stops.push(
              inView(
                section,
                () => {
                  play(
                    Array.from(
                      section.querySelectorAll(
                        "h2, .landing-feature-grid article, .landing-steps li, .landing-access-item, .landing-faq-list, .landing-final > .landing-connect, .landing-creator > div, .creator-links",
                      ),
                    ),
                  );
                  section.classList.add("motion-entered");
                  const path = section.querySelector<SVGPathElement>(
                    ".landing-diagram-lines path",
                  );
                  if (path) {
                    const length = path.getTotalLength();
                    const drawing = animate(
                      path,
                      {
                        strokeDasharray: [
                          `${length} ${length}`,
                          `${length} ${length}`,
                        ],
                        strokeDashoffset: [length, 0],
                      },
                      { duration: 1.1, ease: "easeInOut" },
                    );
                    stops.push(() => drawing.complete());
                    play(
                      Array.from(
                        section.querySelectorAll(
                          ".landing-diagram-node, .landing-diagram-lock",
                        ),
                      ),
                      0.3,
                    );
                  }
                },
                { margin: "0px 0px -40px 0px" },
              ),
            );
          });
        if (desktop.matches) {
          const lenis = new Lenis({
            autoRaf: true,
            lerp: 0.12,
            smoothWheel: true,
            syncTouch: false,
            anchors: { offset: -110 },
          });
          stops.push(() => lenis.destroy());
          const stage = element.querySelector<HTMLElement>(
            ".landing-preview-stage",
          );
          if (stage) {
            const lift = animate(stage, { y: [0, -18] }, { ease: "linear" });
            stops.push(
              scroll(lift, {
                target: stage,
                offset: ["start center", "end start"],
              }),
            );
            stops.push(() => {
              lift.cancel();
              stage.style.transform = "";
            });
          }
        }
      }
      cleanup = () => stops.reverse().forEach((stop) => stop());
    };
    configure();
    preference.addEventListener("change", configure);
    desktop.addEventListener("change", configure);
    return () => {
      cleanup();
      preference.removeEventListener("change", configure);
      desktop.removeEventListener("change", configure);
    };
  }, []);
  return (
    <div className="landing" ref={root}>
      {children}
    </div>
  );
}
