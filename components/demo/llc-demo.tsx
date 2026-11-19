import type { CSSProperties } from "react";
import { SequenceControls, SequenceRoot } from "@/components/motion";
import { Icon, Logo, Outcome, RoleMark, cx } from "@/components/ui";
import { BrandMark } from "@/components/ui/wordmark";
import type { LlcArg, LlcCall, LlcEntry, LlcVendor } from "@/lib/demo/llc";
import { site } from "@/lib/site";
import { ChatFollow } from "./chat-follow";
import type { LlcDemoData } from "./data";
import { LlcRowRules, LlcStyles } from "./llc-styles";

// LlcDemo: an AI agent forming an LLC, shown as an agent app's chat (the owner's "sleek and
// modern", after BoardUI's AI Chat and Agent Progress: ideas only, decision 78), from a
// recorded run of the engine on a fictional firm (content/demo/form-llc.json; the data is
// getLlcDemo() in ./data). It reads the way an agent app shows a session, without copying
// one: the engine's connector, connected; the sentence a person pastes, as their message;
// then for each recorded command the agent's short line and its call to the engine's own
// tool (the name the local MCP server gives it) as a row that opens on the arguments the
// record holds and the engine's result in its own words. A refusal is a soft warning in the
// engine's words. A person's step is handed over on a card and comes back as that person's
// reply with the proof as a file, both read off the record, before the agent records it.
// Where the record names the service a step was done through (ZenBusiness, Mercury: its
// proof's file name says so), the service shows with its icon, and a check lands when the
// step is recorded done. Beside the chat the playbook's steps in the run's view are the
// agent's task list: each ring is checked, and its line struck through, when the step's
// record arrives. It ends on the result: the firm formed, and the first filing dates the run
// put on a calendar. Nothing here is typed in; the message box under the chat is a picture.
// The engine's release state is data for the page, which says it once (data.engineReleased).
//
// The session sits in a window of its own height (about one screen) that scrolls: a labelled
// region a keyboard can reach and scroll. While the run plays, ChatFollow (./chat-follow.tsx)
// scrolls that window, and only that window, to the newest line. On paper it is full height.
//
// Motion (docs/MOTION.md, with the owner's agent style: decisions 82, 83, 86 and 101). The
// markup is the finished session. With full motion it starts frosted when half of it is in
// view, and the generic rule plays it in recorded order: before each of the agent's tool
// calls a thinking row (a small spinner and "Working on step 4 of 12", the step and the count
// from the recording; no clock, since the recording holds no durations) shows while the
// call's first stroke is drawn, from 768 px only; each new line comes into focus (.lc-in);
// a service's check and each task's check land when their record arrives. Phones (under 768
// px) play it with shorter beats: no thinking rows and shorter pauses. Scripts off, reduced
// motion and print get the finished session: no thinking row, no blur.

// ---------- Timing ----------

type Ease = "out" | "inout" | "linear";

/** One stroke of a step. `wide`: drawn only on screens 768 px wide and wider (a thinking row). */
export type BeatDraw = { ms: number; ease: Ease; wide?: boolean };

/** One step of the sequence: what it draws, in DOM order, and the pause after it inks. `wide`: the step is laid out only from 768 px. */
export type Beat = { key: string; role: string; draws: BeatDraw[]; hold: number; wide?: boolean };

/** The beats, in ms. The refusal of a step a person signs holds longest: the pause for the person. */
export const BEATS = {
  think: 360,
  connected: 80,
  prompt: 200,
  call: 80,
  ask: 40,
  record: 80,
  service: 160,
  completeHold: 300,
  tried: 40,
  refused: 360,
  refusedWide: 120,
  gate: 560,
  gateWide: 320,
} as const;

const THINK: BeatDraw = { ms: BEATS.think, ease: "linear", wide: true };

/** Every step of the session's sequence, in DOM order. The markup reads its attributes from these. */
export function chatBeats(data: LlcDemoData): Beat[] {
  const signs = new Set(data.steps.filter((s) => s.gate === "signature").map((s) => s.n));
  const beats: Beat[] = [
    { key: "connected", role: "connected", draws: [], hold: BEATS.connected },
    { key: "prompt", role: "prompt", draws: [], hold: BEATS.prompt },
  ];
  for (const e of data.entries) {
    if (e.refused) {
      const gate = e.step !== null && signs.has(e.step);
      beats.push({ key: `call-${e.line}`, role: "tried", draws: [THINK], hold: BEATS.tried });
      beats.push({ key: `refused-${e.line}`, role: "refused", draws: [], hold: gate ? BEATS.gate : BEATS.refused });
      beats.push({ key: `pause-${e.line}`, role: "pause", draws: [], hold: gate ? BEATS.gateWide : BEATS.refusedWide, wide: true });
    } else if (e.who.lane === "agent") {
      beats.push({ key: `call-${e.line}`, role: "", draws: [THINK], hold: e.complete ? BEATS.completeHold : BEATS.call });
    } else {
      beats.push({ key: `ask-${e.line}`, role: "ask", draws: [], hold: BEATS.ask });
      beats.push({ key: `call-${e.line}`, role: "", draws: [], hold: e.complete ? BEATS.completeHold : BEATS.record });
    }
    if (e.service) beats.push({ key: `service-${e.line}`, role: "service", draws: [], hold: BEATS.service });
  }
  beats.push({ key: "result", role: "result", draws: [], hold: 0 });
  beats.push({ key: "dates", role: "dates", draws: [], hold: 0 });
  return beats;
}

/** The beats a screen plays: all of them from 768 px; under it, none of the wide steps or strokes. */
export function beatsFor(beats: Beat[], wide: boolean): Beat[] {
  if (wide) return beats;
  return beats.filter((b) => !b.wide).map((b) => ({ ...b, draws: b.draws.filter((d) => !d.wide) }));
}

type Beats = Map<string, Beat>;

function beatOf(beats: Beats, key: string): Beat {
  const beat = beats.get(key);
  if (!beat) throw new Error(`LlcDemo: no beat "${key}".`);
  return beat;
}

// The attributes a step carries: its role, and its hold so the generic rule's default does not apply.
const stepAttrs = (beat: Beat) => ({ "data-seq-step": beat.role, "data-seq-hold": beat.hold });

// ---------- Parts ----------

/** What the thinking row says: the step and the count the recording holds, or one plain word when the command records no step. */
export function thinkingLabel(step: number | null, total: number): string {
  return step === null ? "Working" : `Working on step ${step} of ${total}`;
}

// The thinking row before one of the agent's calls (BoardUI's idea, our drawing): a small
// spinner and the label, with a light passing over it once. A drawable whose whole life is
// the call step's first stroke: laid out only while the run is going and only from 768 px,
// shown only while its own --draw is between 0 and 1, and hidden from a screen reader.
function Thinking({ label }: { label: string }) {
  return (
    <div aria-hidden="true" data-draw="" data-draw-ms={BEATS.think} data-draw-ease="linear" className="lc-think">
      <svg viewBox="0 0 16 16" focusable="false" className="lc-spin">
        <circle cx="8" cy="8" r="5.5" pathLength={1} />
      </svg>
      <span className="lc-think-label">{label}</span>
    </div>
  );
}

const shown = (v: LlcArg["value"]) => (typeof v === "string" ? JSON.stringify(v) : String(v));

// A file the record names, by its own name (its path on hover), the way a chat shows an attachment.
function FileChip({ path }: { path: string }) {
  return (
    <span className="lc-file" title={path}>
      <Icon name="file" />
      <span className="lc-file-name">{path.split("/").at(-1)}</span>
    </span>
  );
}

// A call to one of the engine's tools, the way an agent app lists one: a row with the call's
// state (a check, or a cross where the engine refused it), the tool's name and the first line
// of the engine's result. Opened, it gives the arguments the record holds and the result in
// full, and the proof as a file. A native disclosure, so it opens with scripts off too.
function ToolCall({ call, result, refused, proof }: { call: LlcCall; result: string[]; refused: boolean; proof: string | null }) {
  return (
    <details className={cx("lc-tool", refused && "lc-tool--err")}>
      <summary className="lc-tool-sum">
        <span className="lc-tool-ico" aria-hidden="true">
          <Icon name={refused ? "close" : "check"} />
        </span>
        <span className="lc-tool-name">{call.tool}</span>
        <span className="lc-tool-say">{refused ? "Refused by the engine" : result[0]}</span>
        <Icon name="chevron-down" className="lc-tool-chev" />
      </summary>
      <div className="lc-tool-body">
        {call.args.length > 0 && (
          <dl className="lc-args">
            {call.args.map((a) => (
              <div key={a.name} className="lc-arg">
                <dt>{a.name}</dt>
                <dd className="lc-val type-data">{shown(a.value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {/* A refusal's words stand under the row, in the warning; a result is here in full. */}
        {!refused && (
          <div className="lc-res">
            {result.map((l, i) => (
              <p key={i} className="lc-res-line">
                {l}
              </p>
            ))}
          </div>
        )}
        {proof && <FileChip path={proof} />}
      </div>
    </details>
  );
}

// The engine's refusal, under the call it stopped: a soft warning with the danger ink on its
// icon and its first word, in the engine's own words.
function Refusal({ text }: { text: string }) {
  return (
    <div className="lc-warn">
      <Icon name="risk" className="lc-warn-ico" />
      <p className="lc-warn-text">
        <b>Refused. </b>
        {text}
      </p>
    </div>
  );
}

// The agent handing a person's step over: a card with the person's mark and the plain words.
function Handoff({ text, mark }: { text: string; mark: "H" | "O" }) {
  return (
    <div className="lc-hand" data-lane="person">
      <RoleMark mode={mark} showLabel={false} size="sm" className="lc-hand-mark" />
      <p className="lc-hand-text">{text}</p>
    </div>
  );
}

// What the person reports, read off the record: their name over a reply ("Done", "Approved")
// and the proof the record names, as a file.
function Reply({ name, reply, proof }: { name: string; reply: string; proof: string | null }) {
  const word = reply.split(",")[0]?.trim() ?? reply;
  return (
    <div className="lc-them">
      <span className="lc-who">{name}</span>
      <p className="lc-bubble lc-bubble--them">
        <span>{word.charAt(0).toUpperCase() + word.slice(1)}</span>
        {proof && <FileChip path={proof} />}
      </p>
    </div>
  );
}

// The service the record names for its step, with its own icon; its check lands when the
// step is recorded done (the step before this one).
function Service({ v, beat }: { v: LlcVendor; beat: Beat }) {
  return (
    <div {...stepAttrs(beat)} className="lc-step">
      <p className="lc-svc lc-in">
        <Logo id={v.id} name={v.name} government={v.government} size="sm" />
        <span className="lc-svc-name">{v.name}</span>
        <span className="lc-svc-chk">
          <Icon name="check" />
        </span>
        <span className="sr-only">: done</span>
      </p>
    </div>
  );
}

// What the agent says before a call: the step's own title, or the command's fixed label.
function Say({ text }: { text: string }) {
  return <p className="lc-say">{text}</p>;
}

function Entry({ e, beats, total }: { e: LlcEntry; beats: Beats; total: number }) {
  const call = beatOf(beats, `call-${e.line}`);
  const service = e.service ? <Service v={e.service} beat={beatOf(beats, `service-${e.line}`)} /> : null;
  // A person's proof is shown in their reply; an agent's is in its call, opened.
  const tool = <ToolCall call={e.call} result={e.result} refused={e.refused} proof={e.who.lane === "agent" ? e.proof : null} />;
  if (e.refused) {
    return (
      <li className="lc-entry">
        <div {...stepAttrs(call)} className="lc-step">
          <Thinking label={thinkingLabel(e.step, total)} />
          <div className="lc-in">
            <Say text={e.title} />
            {tool}
          </div>
        </div>
        <div {...stepAttrs(beatOf(beats, `refused-${e.line}`))} className="lc-step">
          <div className="lc-in">
            <Refusal text={e.result[0] ?? ""} />
          </div>
        </div>
        <div {...stepAttrs(beatOf(beats, `pause-${e.line}`))} aria-hidden="true" className="lc-pause" />
      </li>
    );
  }
  if (e.who.lane === "agent") {
    return (
      <li className="lc-entry">
        <div {...stepAttrs(call)} data-lc-done={e.step ?? undefined} className="lc-step">
          <Thinking label={thinkingLabel(e.step, total)} />
          <div className="lc-in">
            <Say text={e.title} />
            {tool}
          </div>
        </div>
        {service}
      </li>
    );
  }
  // A person's record: the agent hands the step over, the person reports, the agent records it.
  return (
    <li className="lc-entry">
      <div {...stepAttrs(beatOf(beats, `ask-${e.line}`))} className="lc-step">
        <div className="lc-in">{e.ask && <Handoff text={e.ask} mark={e.who.mark === "O" ? "O" : "H"} />}</div>
      </div>
      <div {...stepAttrs(call)} data-lc-done={e.step ?? undefined} className="lc-step">
        <div className="lc-in">
          <Reply name={e.who.name} reply={e.reply ?? "done"} proof={e.proof} />
          {tool}
        </div>
      </div>
      {service}
    </li>
  );
}

// The playbook's steps in the run's view, as the agent's task list: a box per step, checked
// and its line struck through when the step's record arrives (llc-styles.tsx says how).
// Under 1024 px it is a strip of numbered boxes, the titles kept for a screen reader.
function TaskList({ data, id }: { data: LlcDemoData; id: string }) {
  const { steps, playbook } = data;
  return (
    <div className="lc-side" style={{ "--lc-n": steps.length } as CSSProperties}>
      <div className="lc-side-head">
        <h3 id={`${id}-steps`} className="type-label m-0 text-text lg:type-title-s">
          {playbook.title}
        </h3>
        <p className="lc-side-view type-body-s m-0 mt-1 text-muted">
          {steps.length} tasks · {data.view.label}
        </p>
      </div>
      <ol className="lc-steps">
        {steps.map((s) => (
          <li key={s.id} data-lc-row={s.n} data-lane={s.mark === "A" || s.mark === "B" ? "agent" : "person"} className="lc-row">
            <span className="lc-chk">
              <Icon name="check" draw />
            </span>
            <span aria-hidden="true" className="lc-row-n type-note text-faint lg:hidden print:hidden">
              {s.n}
            </span>
            <span className="lc-row-title type-body-s">
              <span className="sr-only">Step {s.n}: </span>
              {s.title}
              <span className="sr-only">{s.doneAt !== null ? ", done." : ", not done."}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function DateCell({ date }: { date: string }) {
  const [y = "", mo = "", d = ""] = date.split("-");
  return (
    <time dateTime={date} className="lc-date">
      <span className="type-label text-muted">{MONTHS[Number(mo) - 1] ?? mo}</span> <span className="type-title-l text-text">{Number(d)}</span>{" "}
      <span className="type-data text-muted">{y}</span>
    </time>
  );
}

// The end of the run, as a card under the session: it comes into focus and lifts, then the dates do.
function ResultCard({ data, id, beats }: { data: LlcDemoData; id: string; beats: Beats }) {
  const r = data.result;
  return (
    <div className="lc-result">
      <div className="lc-result-in">
        <div {...stepAttrs(beatOf(beats, "result"))} className="min-w-0">
          <div className="lc-in">
            <h3 id={`${id}-result`} className="type-title-m m-0 text-text">
              {r.firm}
            </h3>
            <Outcome kind="done" className="mt-2">
              <b>Formed.</b>{" "}
              <span className="font-normal">
                {r.playbook} is complete: {r.done} done of {r.total}.
              </span>
            </Outcome>
            {r.formation && (
              <p className="type-body-s m-0 mt-2 text-muted">
                Step {r.formation.step}, {r.formation.title}: done by {r.formation.by} on <time dateTime={r.formation.date}>{r.formation.date}</time>.
              </p>
            )}
          </div>
        </div>
        <div {...stepAttrs(beatOf(beats, "dates"))} className="min-w-0">
          <div className="lc-in">
            <p className="type-title-s m-0 flex items-center gap-2 text-text">
              <Icon name="calendar" />
              The first filing dates
            </p>
            {r.datesTitle && <p className="type-body-s m-0 mt-1 text-muted">{r.datesTitle}</p>}
            <ol className="lc-dates" style={{ "--lc-dates": Math.max(1, r.dates.length) } as CSSProperties}>
              {r.dates.map((d) => (
                <li key={d.date}>
                  <DateCell date={d.date} />
                  {!r.datesTitle && <span className="type-body-s text-muted">{d.title}</span>}
                  {d.moved && (
                    <span className="type-note text-muted">
                      Moved from {d.moved.from}, a {d.moved.weekday}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {(r.calendar || r.review) && (
              <p className="type-body-s m-0 mt-3 text-muted">
                {r.calendar && (
                  <>
                    <span className="type-data">{r.calendar.path}</span>, {r.calendar.events} {r.calendar.events === 1 ? "event" : "events"}.{" "}
                  </>
                )}
                {r.review}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LlcDemo({ data, id = "llc", className }: { data: LlcDemoData; id?: string; className?: string }) {
  const beats: Beats = new Map(chatBeats(data).map((b) => [b.key, b]));
  const total = data.steps.length;
  const services = [...new Map(data.entries.flatMap((e) => (e.service ? [[e.service.id, e.service.name] as const] : []))).values()];
  return (
    <SequenceRoot as="figure" name="chat" label="the run" stepThrough={false} className={cx("lc-fig m-0 min-w-0", className)}>
      <LlcStyles />
      <LlcRowRules rows={total} />
      <div className="lc-grid">
        <div className="lc-win">
          <div className="lc-bar">
            <span className="type-label text-text">Agent session</span>
            <span className="type-note text-faint">{data.firm}</span>
          </div>
          {/* A window of its own height that scrolls. While the run plays, ChatFollow scrolls it
              to the newest line; otherwise the reader does, by pointer or by keyboard. */}
          <div role="region" tabIndex={0} aria-label="The run as an agent session, in a window that scrolls" className="lc-scroll">
            <ol className="lc-log type-body-s">
              <li className="lc-entry">
                <div {...stepAttrs(beatOf(beats, "connected"))} className="lc-step">
                  <p className="lc-conn lc-in">
                    <BrandMark size={16} />
                    <span>
                      {site.name} connected <span className="lc-faint">{data.server.name}</span>
                    </span>
                    <span className="lc-svc-chk">
                      <Icon name="check" />
                    </span>
                  </p>
                </div>
              </li>
              <li className="lc-entry">
                <div {...stepAttrs(beatOf(beats, "prompt"))} className="lc-step">
                  <div className="lc-me lc-in">
                    <p className="lc-bubble lc-bubble--me">
                      <span className="sr-only">You: </span>
                      {data.prompt}
                    </p>
                  </div>
                </div>
              </li>
              {data.entries.map((e) => (
                <Entry key={e.line} e={e} beats={beats} total={total} />
              ))}
            </ol>
            <ChatFollow />
          </div>
          {/* The agent app's message box, drawn as the app draws it so the window reads as one;
              it is a picture, not a control: nothing here can be typed into or focused. */}
          <div aria-hidden="true" className="lc-composer">
            <Icon name="plus" className="lc-composer-ico" />
            <span className="lc-composer-ph">Ask a follow-up</span>
            <span className="lc-composer-send">
              <Icon name="arrow-up" />
            </span>
          </div>
        </div>
        <TaskList data={data} id={id} />
      </div>

      <ResultCard data={data} id={id} beats={beats} />

      <figcaption className="lc-cap">
        <div className="min-w-0">
          <p className="type-body-s measure m-0 text-muted">
            A recorded run of the engine on {data.firm}, a fictional firm, shown as an agent session,{" "}
            <time dateTime={data.recordedOn}>{data.recordedOn}</time>.
          </p>
          <p className="type-body-s measure m-0 mt-1 text-faint">
            The first line is the sentence a person pastes. Each call after it is a command the engine recorded, under the name of its tool, and each
            result is the engine&rsquo;s own words.
            {data.people.length > 0 && ` ${data.people.join(" and ")} ${data.people.length === 1 ? "is" : "are"} made up too`}
            {services.length > 0 && `; ${services.join(" and ")} ${services.length === 1 ? "is a real service" : "are real services"} named in the record`}
            {(data.people.length > 0 || services.length > 0) && "."}
          </p>
        </div>
        {/* The controls' place is held while scripts run, so nothing moves when they arrive. */}
        <span className="lc-ctl">
          <SequenceControls />
        </span>
      </figcaption>
    </SequenceRoot>
  );
}
