import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        width: "100vw",
        background: "var(--qb-bg)",
        overflow: "hidden",
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--qb-bg)",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
