import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { AddItemDialog } from "./AddItemDialog";
import { DitherDefs } from "./Dither";

/**
 * Edge-to-edge shell. The window fills its frame with no outer canvas gap: the
 * dark sidebar is flush to the top/left/bottom edges and the light content fills
 * the rest (flush right/top/bottom). The macOS title bar is overlaid
 * (`titleBarStyle: "Overlay"` in tauri.conf.json), so the traffic lights float
 * over the sidebar's top padding; a draggable top strip lets the window move.
 *
 * The two panels meet with a soft seam — the dark/light contrast plus a faint
 * shadow cast off the sidebar's right edge, no harsh divider line.
 */
export function AppShell() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        width: "100vw",
        background: "var(--side-bg)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Reusable monochrome dither <filter> (mounted once). */}
      <DitherDefs />

      {/* Draggable strip across the top (overlaid traffic-light area stays
          movable). Interactive children carry `.qb-no-drag`. */}
      <div
        className="qb-drag"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "28px",
          zIndex: 50,
        }}
      />

      {/* Sidebar rail — flush to the left/top/bottom edges. */}
      <Sidebar />

      {/* Content — fills the rest, flush right/top/bottom. A faint inset shadow
          on the left gives the seam soft depth without a hard border. */}
      <main
        className="qb-no-drag"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          background: "var(--panel-bg)",
          boxShadow: "inset 6px 0 16px -10px rgba(0,0,0,0.35)",
        }}
      >
        <Outlet />
      </main>

      {/* Mounted once; controlled by useItems().addOpen (Sidebar's Add button). */}
      <AddItemDialog />
    </div>
  );
}
