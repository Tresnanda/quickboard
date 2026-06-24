import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "slot-text/style.css";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { ItemsProvider } from "./lib/items-store";
import { ToastProvider } from "./components/Toast";
import { ConfettiProvider } from "./components/Confetti";
import { MintFlightProvider } from "./components/MintFlight";
import { ShaderBakerProvider } from "./components/ShaderBaker";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { installInputAssistOff } from "./lib/input-assist";

installInputAssistOff();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ItemsProvider>
      <ToastProvider>
        <ConfettiProvider>
          <MintFlightProvider>
            <ShaderBakerProvider>
              <ConfirmProvider>
                <RouterProvider router={router} />
              </ConfirmProvider>
            </ShaderBakerProvider>
          </MintFlightProvider>
        </ConfettiProvider>
      </ToastProvider>
    </ItemsProvider>
  </React.StrictMode>,
);
