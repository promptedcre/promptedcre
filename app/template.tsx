import type { ReactNode } from "react";

// A page arriving fades in over a fifth of a second (D224, the owner's "subtle cross-fade").
// The template is made anew on every navigation, so the fade runs each time; app/globals.css
// keeps it to screens, with scripts on and motion not reduced.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>;
}
