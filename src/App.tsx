import { useState } from "react";
import Dashboard from "./components/Dashboard";
import DocumentationPage from "./components/DocumentationPage";

export default function App() {
  const [view, setView] = useState<"dashboard" | "docs">("dashboard");
  if (view === "docs") {
    return <DocumentationPage onBack={() => setView("dashboard")} />;
  }
  return <Dashboard onOpenDocs={() => setView("docs")} />;
}
