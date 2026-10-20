import { StrictMode, Suspense, lazy } from "react";
import { IconContext } from "@phosphor-icons/react";
import { createRoot } from "react-dom/client";
import "./index.css";
// Landing visitors and app users download only their own bundle.
const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./Landing"));
import { SessionGate } from "./lib/Session";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: "duotone", size: 24 }}>
    <Suspense fallback={null}>
    {/^\/$/.test(window.location.pathname)
      ? <Landing />
      : <SessionGate><App /></SessionGate>}
    </Suspense>
    </IconContext.Provider>
  </StrictMode>
);
