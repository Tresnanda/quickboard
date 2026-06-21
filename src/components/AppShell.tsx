import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { AddItemDialog } from "./AddItemDialog";

/**
 * FINAL two-card shell (matches `target-final.html`).
 *
 * A thin neutral canvas (`--canvas` #e7e7e5) holds **two separate rounded
 * cards** with a small ~8px gap between them and ~8px margin around: a LIGHT
 * sidebar card and a white main card. The canvas itself — the gaps and the
 * margins around the cards — is the window's drag handle (`.qb-drag`), so the
 * frameless window (`titleBarStyle: "Overlay"`) can be moved by grabbing the
 * chrome. EVERY interactive element inside the cards carries `.qb-no-drag`.
 *
 * The whole shell (the outer flex container) is the drag region; the two cards
 * sit on top of it. The cards' interactive contents opt back out of dragging.
 */
export function AppShell() {
  return (
    <div
      // The entire canvas (incl. the ~8px margin + the gap) is draggable. We
      // use BOTH data-tauri-drag-region (the real fix, paired with the window
      // permissions + start-dragging) and the -webkit-app-region CSS hint. The
      // cards' interiors re-enable interaction via .qb-no-drag.
      data-tauri-drag-region
      className="qb-drag"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        gap: "8px",
        height: "100vh",
        width: "100vw",
        padding: "8px",
        background: "var(--canvas)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* LIGHT sidebar card. */}
      <Sidebar />

      {/* Main card — white, rounded, fills the rest. */}
      <main
        className="qb-no-drag"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          background: "var(--panel-bg)",
          border: "1px solid var(--side-border)",
          borderRadius: "var(--r-panel)",
        }}
      >
        <Outlet />
      </main>

      {/* Mounted once; controlled by useItems().addOpen (Sidebar's Add button). */}
      <AddItemDialog />
    </div>
  );
}
