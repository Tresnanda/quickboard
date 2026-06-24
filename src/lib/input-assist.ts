// Turn off the webview's autocorrect / autocapitalize / spellcheck / autocomplete on
// every text field — current and future (modals, combobox, etc.). This app is full of
// codes, secrets, IDs and names where the OS "helpfully" capitalizing or suggesting is
// always wrong. One MutationObserver covers everything, including portaled dialogs.

function strip(el: Element): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocomplete", "off");
    el.spellcheck = false;
  }
}

export function installInputAssistOff(): void {
  const scan = (root: ParentNode) => root.querySelectorAll("input, textarea").forEach(strip);
  scan(document);
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        strip(el);
        scan(el);
      });
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}
