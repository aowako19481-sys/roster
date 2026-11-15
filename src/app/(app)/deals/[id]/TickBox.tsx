"use client";

import { useFormStatus } from "react-dom";
import { ui } from "@/components/ui";

/** A checklist tick box that saves as soon as it is changed. */
export function TickBox({ label, checked }: { label: string; checked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <label className={ui.check}>
      <input
        type="checkbox"
        name="done"
        defaultChecked={checked}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      />
      {label}
    </label>
  );
}
