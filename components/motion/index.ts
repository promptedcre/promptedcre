// The motion kit's components. docs/MOTION.md is the contract.
//
//   import { SequenceRoot, SequenceControls } from "@/components/motion";
//
// Both are server components; importing them adds no GSAP to a page (lib/motion/loader.ts
// fetches it when a sequence is about to play).
export { SequenceControls, SequenceRoot } from "./sequence-root";
