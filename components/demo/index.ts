// The formation demonstration: an AI agent forming an LLC, shown as an agent session, from a
// recorded run of the engine on a fictional firm (content/demo/form-llc.json, npm run
// demo:record-llc).
//
//   import { LlcDemo, getLlcDemo } from "@/components/demo";
//   <LlcDemo data={getLlcDemo()} />
//
// getLlcDemo() is server only: it reads the recording, the catalog, the step-to-software map
// and the rankings from disk and returns plain data. LlcDemo is a server component; the
// client code it brings is the motion kit's own enhancer and ChatFollow, which scrolls the
// session's window while the run plays. The component never says that the engine is not
// released yet: data.engineReleased is there for the page to say it once.
export { BEATS, LlcDemo, beatsFor, chatBeats, thinkingLabel, type Beat, type BeatDraw } from "./llc-demo";
export { getLlcDemo, stepVendors, type LlcDemoData } from "./data";
