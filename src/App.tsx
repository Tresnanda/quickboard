// SPIKE: throwaway drag-out test, removed in Plan 2
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import "./App.css";

function App() {
  const [filePath, setFilePath] = useState<string>("");
  const [iconPath, setIconPath] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");

  // Resolve the absolute paths of the file to drag + the drag-preview icon.
  useEffect(() => {
    invoke<[string, string]>("spike_drag_paths")
      .then(([file, icon]) => {
        setFilePath(file);
        setIconPath(icon);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function handleDragStart(e: React.DragEvent) {
    // Prevent the browser's default (HTML) drag so the native plugin owns it.
    e.preventDefault();
    if (!filePath || !iconPath) {
      setError("paths not resolved yet");
      return;
    }
    setStatus("dragging...");
    try {
      await startDrag({ item: [filePath], icon: iconPath }, (payload) => {
        setStatus(`drag result: ${payload.result}`);
      });
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>QuickBoard drag-out SPIKE</h1>
      <p style={{ color: "#666" }}>
        SPIKE: throwaway drag-out test, removed in Plan 2.
      </p>

      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          marginTop: 24,
          display: "inline-block",
          padding: "24px 40px",
          border: "2px dashed #4f46e5",
          borderRadius: 12,
          cursor: "grab",
          userSelect: "none",
          fontSize: 18,
          fontWeight: 600,
          color: "#4f46e5",
        }}
      >
        Drag me out →
      </div>

      <dl style={{ marginTop: 24, fontSize: 13, color: "#444" }}>
        <dt style={{ fontWeight: 600 }}>file</dt>
        <dd style={{ margin: "0 0 8px", wordBreak: "break-all" }}>
          {filePath || "(resolving…)"}
        </dd>
        <dt style={{ fontWeight: 600 }}>icon</dt>
        <dd style={{ margin: "0 0 8px", wordBreak: "break-all" }}>
          {iconPath || "(resolving…)"}
        </dd>
        <dt style={{ fontWeight: 600 }}>status</dt>
        <dd style={{ margin: 0 }}>{status}</dd>
      </dl>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>error: {error}</p>
      )}
    </main>
  );
}

export default App;
