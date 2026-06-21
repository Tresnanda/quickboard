import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
// Editorial serif — brand-moment headlines ONLY (minting sheet + empty state).
// All other UI stays Plus Jakarta Sans. Exposed via `.font-serif-brand`.
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "slot-text/style.css";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { ItemsProvider } from "./lib/items-store";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ItemsProvider>
      <RouterProvider router={router} />
    </ItemsProvider>
  </React.StrictMode>,
);
