import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { ItemsProvider } from "./lib/items-store";
import { TrayDock } from "./components/TrayDock";
import { installInputAssistOff } from "./lib/input-assist";

installInputAssistOff();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ItemsProvider>
        <TrayDock />
      </ItemsProvider>
    </MotionConfig>
  </React.StrictMode>,
);
