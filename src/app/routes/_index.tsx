import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Tools — Modular browser-based utilities" },
    {
      name: "description",
      content:
        "A browser-first collection of developer and IT utilities. All processing runs locally in your browser.",
    },
  ];
}

export default function HomePage() {
  return (
    <main>
      <h1>Tools</h1>
      <p>
        A modular collection of browser-based utilities for developers and IT
        professionals. All processing runs entirely in your browser.
      </p>
    </main>
  );
}