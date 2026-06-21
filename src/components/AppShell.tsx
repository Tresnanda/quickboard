import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { AddItemDialog } from "./AddItemDialog";
import { DitherDefs } from "./Dither";

/**
 * Soft floating shell (R2.5). An outer neutral canvas holds two rounded
 * floating panels — the dark sidebar rail and the light content panel — with a
 * visible gap between them and inset margins all around. The top margin keeps
 * the macOS traffic lights clear; that strip stays draggable.
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
        background: "var(--canvas)",
        boxSizing: "border-box",
        // Inset margins around the panels; extra top keeps traffic lights clear.
        padding: "38px 10px 10px",
        gap: "10px",
        overflow: "hidden",
      }}
    >
      {/* Reusable monochrome dither <filter> (mounted once). */}
      <DitherDefs />

      {/* Draggable strip across the top (traffic-light area stays movable). */}
      <div
        className="qb-drag"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "38px",
          zIndex: 5,
        }}
      />

      {/* Sidebar rail — rounded floating panel */}
      <Sidebar />

      {/* Content — rounded floating panel on the canvas */}
      <main
        className="qb-no-drag"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          background: "var(--panel-bg)",
          borderRadius: "var(--r-panel)",
          boxShadow: "var(--shadow-panel)",
          border: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <Outlet />
      </main>

      {/* Mounted once; controlled by useItems().addOpen (Sidebar's Add button). */}
      <AddItemDialog />
    </div>
  );
}
