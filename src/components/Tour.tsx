"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRAND } from "@/lib/brand";
import styles from "./Tour.module.css";

type Step = { target?: string; title: string; body: string };
type Box = { top: number; left: number; width: number; height: number };

const PAD = 10;
const CARD_WIDTH = 348;
const GAP = 18;
const CARD_HEIGHT = 300; // tallest the card gets; used to keep it on screen

function buildSteps(firstName: string): Step[] {
  return [
    {
      title: `Welcome to ${BRAND}, ${firstName}`,
      body: "Here is a one-minute look at where everything lives. You can skip it at any time.",
    },
    {
      target: "nav",
      title: "Find your way around",
      body: "Agents, teams, riders and files each have their own page here. Add-ons sit underneath.",
    },
    {
      target: "live",
      title: "Onboarding, live",
      body: "How many invited agents are ready to go live right now. It re-reads every five minutes on its own.",
    },
    {
      target: "rollers",
      title: "Your top agents",
      body: "The five highest earners this year. Use the arrows to see who is close behind.",
    },
    {
      target: "tier",
      title: "Tier clearance",
      body: "When an agent crosses a tier, the new split waits here for a person to approve. Pay never changes on its own.",
    },
    {
      target: "flags",
      title: "Needs a human",
      body: `Anything ${BRAND} could not settle by itself, like a licence number that does not match.`,
    },
    {
      target: "jump",
      title: "Quick actions",
      body: "The jobs you will do most often, one tap away. That is the whole tour.",
    },
  ];
}

function findTarget(name: string | undefined) {
  if (!name) return null;
  // The navigation exists once; other targets are unique on the page.
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

/**
 * First-run walkthrough. Opens by itself the first time a person reaches the
 * dashboard, then never again (saved against their account). It can be
 * replayed from the link this component renders.
 */
export function Tour({
  firstName,
  autoStart,
  onDone,
}: {
  firstName: string;
  autoStart: boolean;
  onDone: () => Promise<void>;
}) {
  const steps = buildSteps(firstName);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [narrow, setNarrow] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const saved = useRef(false);

  const step = steps[index];
  const last = index === steps.length - 1;

  // Open on first visit, after the page has settled.
  useEffect(() => {
    if (!autoStart) return;
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, [autoStart]);

  const measure = useCallback(() => {
    setNarrow(window.innerWidth < 760);
    const element = findTarget(steps[index]?.target);
    if (!element) {
      setBox(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Bring each stop into view, then keep the spotlight glued to it.
  useLayoutEffect(() => {
    if (!open) return;
    const element = findTarget(steps[index]?.target);
    if (element) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const tall = element.getBoundingClientRect().height > window.innerHeight * 0.8;
      element.scrollIntoView({ block: tall || window.innerWidth < 760 ? "start" : "center", behavior: calm ? "auto" : "smooth" });
    }
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, measure]);

  // Move keyboard focus to the main button on every step.
  useEffect(() => {
    if (open) nextButton.current?.focus({ preventScroll: true });
  }, [open, index]);

  const close = useCallback(() => {
    setOpen(false);
    setIndex(0);
    if (!saved.current) {
      saved.current = true;
      void onDone();
    }
    replayButton.current?.focus({ preventScroll: true });
  }, [onDone]);

  // Escape skips; Tab stays inside the card while the tour is open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !card.current) return;
      const focusable = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      const first = focusable[0];
      const lastOne = focusable[focusable.length - 1];
      if (!first || !lastOne) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.current.contains(active))) {
        event.preventDefault();
        lastOne.focus();
      } else if (!event.shiftKey && (active === lastOne || !card.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Where the explanation card sits: beside the spotlight if there is room.
  let cardStyle: React.CSSProperties = {};
  if (!narrow) {
    if (!box) {
      cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    } else {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const roomRight = vw - (box.left + box.width);
      const roomLeft = box.left;
      const roomBelow = vh - (box.top + box.height);
      let top: number;
      let left: number;
      if (roomRight >= CARD_WIDTH + GAP * 2) {
        left = box.left + box.width + GAP;
        top = clamp(box.top, 16, vh - CARD_HEIGHT - 16);
      } else if (roomLeft >= CARD_WIDTH + GAP * 2) {
        left = box.left - CARD_WIDTH - GAP;
        top = clamp(box.top, 16, vh - CARD_HEIGHT - 16);
      } else if (roomBelow >= CARD_HEIGHT + GAP * 2) {
        left = clamp(box.left, 16, vw - CARD_WIDTH - 16);
        top = box.top + box.height + GAP;
      } else if (box.top >= CARD_HEIGHT + GAP * 2) {
        left = clamp(box.left, 16, vw - CARD_WIDTH - 16);
        top = box.top - CARD_HEIGHT - GAP;
      } else {
        // No room around it: sit in the lower corner, over the spotlight.
        left = vw - CARD_WIDTH - 24;
        top = vh - CARD_HEIGHT - 24;
      }
      cardStyle = { top, left };
    }
  }

  return (
    <>
      <button
        ref={replayButton}
        type="button"
        className={styles.replay}
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
      >
        Replay the tour
      </button>

      {open &&
        step &&
        createPortal(
          <div className={styles.layer}>
            {/* The dimmed page with one clear window cut into it. */}
            <div
              className={`${styles.spot} ${box ? "" : styles.spotNone}`}
              style={box ? { top: box.top, left: box.left, width: box.width, height: box.height } : undefined}
              aria-hidden="true"
            />
            <div
              ref={card}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-title"
              aria-describedby="tour-body"
              className={`${styles.card} ${narrow ? styles.cardNarrow : ""}`}
              style={cardStyle}
            >
              <p className={`brandLabel ${styles.count}`}>
                {BRAND} tour · {index + 1} of {steps.length}
              </p>
              <h2 id="tour-title" key={`t${index}`} className={styles.title}>
                {step.title}
              </h2>
              <p id="tour-body" key={`b${index}`} className={styles.body}>
                {step.body}
              </p>
              <div className={styles.dots} aria-hidden="true">
                {steps.map((_, dot) => (
                  <span key={dot} className={dot === index ? styles.dotOn : styles.dot} />
                ))}
              </div>
              <div className={styles.actions}>
                {!last && (
                  <button type="button" className={styles.skip} onClick={close}>
                    Skip
                  </button>
                )}
                <button type="button" className={styles.back} onClick={() => setIndex((value) => value - 1)} disabled={index === 0}>
                  Back
                </button>
                <button
                  ref={nextButton}
                  type="button"
                  className={`${styles.next} press`}
                  onClick={() => (last ? close() : setIndex((value) => value + 1))}
                >
                  {last ? "Done" : index === 0 ? "Start" : "Next"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
