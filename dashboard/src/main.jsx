import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Wait for DOM, then hydrate with staggered entrance
window.addEventListener("DOMContentLoaded", () => {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
});
