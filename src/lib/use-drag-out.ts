import { useState } from "react";
import { type Transition } from "framer-motion";
import { dragOutItem } from "./drag";

// "Photo pops from the row": the row dims to a ghost while the grabbed thumbnail
// recoils (a quick squash-and-return) as the native drag image lifts off it.
export const GRAB_TRANSITION: Transition = { duration: 0.18 }; // the row/card dim
export const RECOIL_TRANSITION: Transition = { duration: 0.42, ease: [0.34, 1.4, 0.5, 1] }; // the thumbnail recoil

export function useDragOut(id: string, isImage: boolean, thumb?: string | null, onEnd?: () => void) {
  const [grabbing, setGrabbing] = useState(false);
  // `origin` is the dragged element's rect [x, y, w, h] in CSS px — so the native
  // drag lifts the preview off the source instead of teleporting to the cursor.
  function begin(origin?: number[]) {
    setGrabbing(true);
    void dragOutItem(
      id,
      isImage,
      thumb,
      () => {
        setGrabbing(false);
        onEnd?.();
      },
      origin,
    );
  }
  return { grabbing, begin };
}
