import { Badge } from "@/components/ui";
import { statusWord, type WordKind } from "@/lib/ops";

/** A stored status shown as a word in a pill. */
export function StatusBadge({ kind, value }: { kind: WordKind; value: string | null | undefined }) {
  const word = statusWord(kind, value);
  return <Badge tone={word.tone}>{word.label}</Badge>;
}
