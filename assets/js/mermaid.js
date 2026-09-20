function css(name) {
  return "rgb(" + getComputedStyle(document.documentElement).getPropertyValue(name) + ")";
}

function initMermaidLight() {
  mermaid.initialize({
    startOnLoad: true,
    theme: "base",
    themeVariables: {
      darkMode: false,
      background: "#ffffff",
      primaryColor: "#dbeafe",
      primaryTextColor: "#1e3a8a",
      primaryBorderColor: "#3b82f6",
      lineColor: "#2563eb",
      secondaryColor: "#f1f5f9",
      secondaryTextColor: "#0f172a",
      secondaryBorderColor: "#94a3b8",
      tertiaryColor: "#f8fafc",
      tertiaryTextColor: "#334155",
      tertiaryBorderColor: "#cbd5e1",
      clusterBkg: "#f8fafc",
      clusterBorder: "#93c5fd",
      titleColor: "#1e40af",
      edgeLabelBackground: "#ffffff",
      nodeTextColor: "#1e293b",
      fontFamily:
        "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif",
      fontSize: "14px",
    },
  });
}

function initMermaidDark() {
  mermaid.initialize({
    startOnLoad: true,
    theme: "base",
    themeVariables: {
      darkMode: true,
      background: "#0f172a",
      primaryColor: "#1e293b",
      primaryTextColor: "#f8fafc",
      primaryBorderColor: "#3b82f6",
      lineColor: "#60a5fa",
      secondaryColor: "#172554",
      secondaryTextColor: "#f8fafc",
      secondaryBorderColor: "#2563eb",
      tertiaryColor: "#0f172a",
      tertiaryTextColor: "#e2e8f0",
      tertiaryBorderColor: "#334155",
      clusterBkg: "#0b1329",
      clusterBorder: "#1e3a8a",
      titleColor: "#93c5fd",
      edgeLabelBackground: "#1e293b",
      nodeTextColor: "#f8fafc",
      fontFamily:
        "ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,segoe ui,Roboto,helvetica neue,Arial,noto sans,sans-serif",
      fontSize: "14px",
    },
  });
}
