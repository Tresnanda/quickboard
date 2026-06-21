// SPIKE: throwaway drag-out test, removed in Plan 2
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import "./App.css";

// HARNESS: throwaway store test, replaced by the real UI in Plan 2
type Item = { id: string; label: string; category: string; confidential: boolean };

function App() {
  const [filePath, setFilePath] = useState<string>("");
  const [iconPath, setIconPath] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");
  // SPIKE: throwaway Touch ID-gate feasibility, removed/replaced in Plan 2.
  const [bioStatus, setBioStatus] = useState<string>("idle");
  const [bioError, setBioError] = useState<string>("");

  // HARNESS: throwaway store test, replaced by the real UI in Plan 2
  const [items, setItems] = useState<Item[]>([]);
  const [storeError, setStoreError] = useState<string>("");

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

  // HARNESS: throwaway store test, replaced by the real UI in Plan 2
  // Fetches the current item list from the encrypted store via IPC.
  function refreshItems() {
    setStoreError("");
    invoke<Item[]>("list_items")
      .then(setItems)
      .catch((e) => setStoreError(String(e)));
  }

  useEffect(() => {
    refreshItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HARNESS: adds a fixed sample item then refreshes.
  async function handleAddSample() {
    setStoreError("");
    try {
      await invoke("add_text_item", {
        label: "BCA IBAN",
        category: "Finance",
        confidential: false,
        value: "ID1234567890",
      });
      refreshItems();
    } catch (e) {
      setStoreError(String(e));
    }
  }

  // HARNESS: decrypts the stored value via the backend and copies it to clipboard.
  async function handleCopy(id: string) {
    setStoreError("");
    try {
      const plaintext = await invoke<string>("get_text_value", { id });
      await navigator.clipboard.writeText(plaintext);
    } catch (e) {
      setStoreError(String(e));
    }
  }

  // SPIKE: throwaway Touch ID-gate feasibility, removed/replaced in Plan 2.
  // Invokes the Rust LAContext call; this should trigger a Touch ID prompt.
  async function handleTestTouchId() {
    setBioError("");
    setBioStatus("invoking… (expect a Touch ID prompt)");
    try {
      const ok = await invoke<boolean>("spike_biometric");
      setBioStatus(`result: ${ok}`);
    } catch (err) {
      setBioError(String(err));
      setBioStatus("error");
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

      {/* SPIKE: throwaway Touch ID-gate feasibility, removed/replaced in Plan 2. */}
      <hr style={{ margin: "32px 0", border: "none", borderTop: "1px solid #ddd" }} />
      <h2 style={{ fontSize: 18 }}>Touch ID (LocalAuthentication) SPIKE</h2>
      <p style={{ color: "#666", fontSize: 13 }}>
        SPIKE: calls LocalAuthentication (LAContext) in Rust to trigger a system
        Touch ID prompt. Needs no keychain entitlement and no code-signing, so it
        works under unsigned <code>tauri dev</code>. Removed in Plan 2.
      </p>
      <button
        type="button"
        onClick={handleTestTouchId}
        style={{
          marginTop: 12,
          padding: "12px 24px",
          border: "2px solid #059669",
          borderRadius: 10,
          background: "#ecfdf5",
          color: "#059669",
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Test Touch ID
      </button>
      <dl style={{ marginTop: 16, fontSize: 13, color: "#444" }}>
        <dt style={{ fontWeight: 600 }}>biometric status</dt>
        <dd style={{ margin: 0 }}>{bioStatus}</dd>
      </dl>
      {bioError && (
        <p style={{ color: "crimson", marginTop: 12 }}>error: {bioError}</p>
      )}

      {/* HARNESS: throwaway store test, replaced by the real UI in Plan 2 */}
      <hr style={{ margin: "32px 0", border: "none", borderTop: "1px solid #ddd" }} />
      <h2 style={{ fontSize: 18 }}>Encrypted Store HARNESS</h2>
      <p style={{ color: "#666", fontSize: 13 }}>
        HARNESS: exercises list_items / add_text_item / get_text_value over IPC.
        Replaced by the real UI in Plan 2.
      </p>

      <button
        type="button"
        onClick={handleAddSample}
        style={{
          marginTop: 12,
          padding: "12px 24px",
          border: "2px solid #7c3aed",
          borderRadius: 10,
          background: "#f5f3ff",
          color: "#7c3aed",
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Add sample item
      </button>

      {storeError && (
        <p style={{ color: "crimson", marginTop: 12 }}>store error: {storeError}</p>
      )}

      <ul style={{ marginTop: 20, listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
              padding: "10px 14px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <span style={{ fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: "#6b7280" }}>{item.category}</span>
            {item.confidential && (
              <span style={{ color: "#dc2626", fontSize: 12 }}>confidential</span>
            )}
            <button
              type="button"
              onClick={() => handleCopy(item.id)}
              style={{
                marginLeft: "auto",
                padding: "6px 14px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                background: "#f9fafb",
                color: "#374151",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              copy
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li style={{ color: "#9ca3af", fontSize: 13 }}>
            No items yet — click "Add sample item".
          </li>
        )}
      </ul>
    </main>
  );
}

export default App;
