import { useReducedMotion } from "framer-motion";
import { SlotText } from "slot-text/react";

type RollNumberProps = {
  value: number | string;
  /** Roll direction for the digit slide. Default "up". */
  direction?: "up" | "down";
};

/**
 * Odometer-style rolling number backed by slot-text.
 *
 * Under `prefers-reduced-motion: reduce` we render a plain, non-animating
 * string so nothing slides — honouring the motion spec's hard rule.
 */
export function RollNumber({ value, direction = "up" }: RollNumberProps) {
  const reduce = useReducedMotion();
  const text = String(value);

  if (reduce) {
    return <span>{text}</span>;
  }

  return <SlotText text={text} options={{ direction }} />;
}
