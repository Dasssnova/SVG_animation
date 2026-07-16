import React from "react";
import { createRoot } from "react-dom/client";
import Editor from "../app/page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
