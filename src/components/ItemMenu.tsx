import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";

type ItemMenuProps = {
  item: Item;
  onChanged: () => void | Promise<void>;
};

/**
 * The per-item "⋯" overflow menu — shadcn/ui `DropdownMenu` (animates via
 * tailwindcss-animate data-state classes; no Framer Motion).
 *
 * Entries:
 *   - Pin / Unpin   -> setPinned(...) then reload (onChanged)
 *   - Edit          -> disabled "Soon" (lands in R5)
 *   - Customize     -> disabled "Soon" (lands in R4)
 *   - Delete        -> two-step confirm, then deleteItem(...) then reload
 */
export function ItemMenu({ item, onChanged }: ItemMenuProps) {
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
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="More actions"
          className="qb-press qb-menu-trigger h-[30px] w-[30px] text-muted-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[188px] rounded-xl p-1.5 shadow-[var(--shadow-pop)]"
      >
        <DropdownMenuItem
          className="gap-2.5 px-2.5 py-2 text-[0.8125rem] font-semibold"
          onSelect={(e) => {
            e.preventDefault();
            void handleTogglePin();
          }}
        >
          {item.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          {item.pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>

        {/* Edit — lands in R5 */}
        <DropdownMenuItem
          disabled
          className="gap-2.5 px-2.5 py-2 text-[0.8125rem] font-semibold"
          onSelect={(e) => e.preventDefault()}
        >
          <Pencil size={15} />
          Edit
          <span className="qb-menu-soon">Soon</span>
        </DropdownMenuItem>

        {/* Customize — lands in R4 */}
        <DropdownMenuItem
          disabled
          className="gap-2.5 px-2.5 py-2 text-[0.8125rem] font-semibold"
          onSelect={(e) => e.preventDefault()}
        >
          <Sparkles size={15} />
          Customize
          <span className="qb-menu-soon">Soon</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-[var(--hair)]" />

        {confirmDelete ? (
          <DropdownMenuItem
            className="gap-2.5 px-2.5 py-2 text-[0.8125rem] font-semibold text-destructive focus:bg-destructive/[0.08] focus:text-destructive bg-destructive/[0.08]"
            onSelect={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            <Trash2 size={15} />
            Confirm delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="gap-2.5 px-2.5 py-2 text-[0.8125rem] font-semibold text-destructive focus:bg-destructive/[0.08] focus:text-destructive"
            onSelect={(e) => {
              // Keep the menu open and flip to the confirm step.
              e.preventDefault();
              setConfirmDelete(true);
            }}
          >
            <Trash2 size={15} />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
