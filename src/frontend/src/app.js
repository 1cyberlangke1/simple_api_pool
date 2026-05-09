import { effect } from "@preact/signals";
import { h, render } from "preact";
import htm from "htm";
import { Router } from "wouter-preact";

import { AppRouter } from "./routes/app_router.js";
import { appState } from "./stores/app_store.js";

const html = htm.bind(h);

effect(function watchThemeSignal() {
  return appState.value.theme;
});

const appRoot = document.getElementById("app-root");
if (appRoot) {
  render(html`<${Router}><${AppRouter} /></${Router}>`, appRoot);
}
