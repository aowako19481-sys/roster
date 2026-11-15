import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ui } from "@/components/ui";
import type { PlanPieceKey } from "@/lib/admin-pages";
import { setPlanPiece } from "./actions";

/** One piece of one brokerage's plan: the word Locked or Unlocked, and a one-click button to change it. */
export function PieceToggle({
  brokerageId, brokerageName, piece, label, unlocked,
}: { brokerageId: string; brokerageName: string; piece: PlanPieceKey; label: string; unlocked: boolean }) {
  return (
    <ActionForm action={setPlanPiece} className={ui.inline}>
      <input type="hidden" name="id" value={brokerageId} />
      <input type="hidden" name="piece" value={piece} />
      <input type="hidden" name="to" value={unlocked ? "locked" : "unlocked"} />
      <Badge tone={unlocked ? "ok" : "muted"}>{unlocked ? "Unlocked" : "Locked"}</Badge>
      <Submit small variant="plain">
        {unlocked ? "Lock" : "Unlock"}
        <span className="sr-only"> {label} for {brokerageName}</span>
      </Submit>
    </ActionForm>
  );
}
