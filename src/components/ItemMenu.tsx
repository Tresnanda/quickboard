import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
} from "lucide-react";
import { deleteItem, setPinned } from "../lib/ipc";
import type { Item } from "../lib/types";

type ItemMenuProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
};

const MotionContent = motion.create(DropdownMenu.Content);

/**
 * The per-item "⋯" overflow menu (Radix DropdownMenu).
 *
 * Entries:
 *   - Pin / Unpin   -> setPinned(...) then reload (onChanged)
 *   - Edit          -> disabled "coming soon" (lands in R5)
 *   - Customize     -> disabled "coming soon" (lands in R4)
 *   - Delete        -> two-step confirm, then deleteItem(...) then reload
 *
 * Premium dark-on-light surface: white card, --shadow-pop, rounded.
 */
export function ItemMenu({ item, onChanged }: ItemMenuProps) {
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reset the destructive confirm step whenever the menu closes.
    if (!next) setConfirmDelete(false);
  }

  async function handleTogglePin() {
    if (busy) return;
    setBusy(true);
    try {
      await setPinned(item.id, !item.pinned);
      await onChanged();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteItem(item.id);
      await onChanged();
    } finally {
      setBusy(false);
      setOpen(false);
      setConfirmDelete(false);
    }
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="qb-press qb-menu-trigger"
          aria-label="More actions"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "30px",
            height: "30px",
            color: open ? "var(--ink)" : "var(--muted)",
            background: open ? "var(--hair)" : "transparent",
            border: "1px solid",
            borderColor: open ? "var(--border)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "color 140ms var(--ease-out), background 140ms var(--ease-out)",
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <AnimatePresence>
          {open && (
            <MotionContent
              forceMount
              align="end"
              sideOffset={6}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
              style={{
                minWidth: "188px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-pop)",
                padding: "5px",
                transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)",
                zIndex: 60,
              }}
            >
              <DropdownMenu.Item
                className="qb-menu-item"
                onSelect={(e) => {
                  e.preventDefault();
                  void handleTogglePin();
                }}
              >
                {item.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                {item.pinned ? "Unpin" : "Pin"}
              </DropdownMenu.Item>

              {/* Edit — lands in R5 */}
              <DropdownMenu.Item
                className="qb-menu-item"
                disabled
                onSelect={(e) => e.preventDefault()}
              >
                <Pencil size={15} />
                Edit
                <span className="qb-menu-soon">Soon</span>
              </DropdownMenu.Item>

              {/* Customize — lands in R4 */}
              <DropdownMenu.Item
                className="qb-menu-item"
                disabled
                onSelect={(e) => e.preventDefault()}
              >
                <Sparkles size={15} />
                Customize
                <span className="qb-menu-soon">Soon</span>
              </DropdownMenu.Item>

              <DropdownMenu.Separator
                style={{
                  height: "1px",
                  background: "var(--hair)",
                  margin: "5px 6px",
                }}
              />

              {confirmDelete ? (
                <DropdownMenu.Item
                  className="qb-menu-item qb-menu-item--danger qb-menu-item--confirm"
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleDelete();
                  }}
                >
                  <Trash2 size={15} />
                  Confirm delete
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className="qb-menu-item qb-menu-item--danger"
                  onSelect={(e) => {
                    // Keep the menu open and flip to the confirm step.
                    e.preventDefault();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 size={15} />
                  Delete
                </DropdownMenu.Item>
              )}
            </MotionContent>
          )}
        </AnimatePresence>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
