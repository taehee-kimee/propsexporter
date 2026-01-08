import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

console.log("=== Main.tsx loaded ===");
console.log("Root element:", document.getElementById("root"));

try {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    console.log("Creating React root...");
    const root = createRoot(rootElement);
    console.log("React root created, rendering App...");
    root.render(<App />);
    console.log("React app rendered");
  } else {
    console.error("Root element not found!");
    document.body.innerHTML = "<h1 style='color: red;'>Error: Root element not found!</h1>";
  }
} catch (error: any) {
  console.error("Error rendering React app:", error);
  document.body.innerHTML = `<h1 style='color: red;'>Error: ${error.message}</h1>`;
}
