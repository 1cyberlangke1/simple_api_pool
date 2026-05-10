import { createRoot } from "react-dom/client";

import App from "@/App.tsx";
import "@/styles.css";

const appRoot = document.getElementById("app-root");

if (appRoot) {
  createRoot(appRoot).render(<App />);
}
