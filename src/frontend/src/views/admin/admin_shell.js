import { html } from "../../shared/view_helpers.js";

export function AdminShell(props) {
  return html`
    <main class="admin-page">
      ${props.children}
      ${props.logsModal || null}
    </main>
  `;
}
