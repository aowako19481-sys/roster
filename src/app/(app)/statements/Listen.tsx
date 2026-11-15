"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./statement.module.css";

const subscribe = () => () => {};
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Reads the statement aloud with the browser's own voice. Hidden where the browser has none. */
export function Listen({ text }: { text: string }) {
  const supported = useSyncExternalStore(subscribe, canSpeak, () => false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);

  if (!supported) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  return (
    <button type="button" className={styles.listen} onClick={toggle} aria-pressed={speaking}>
      {speaking ? "Stop reading" : "Listen"}
    </button>
  );
}
