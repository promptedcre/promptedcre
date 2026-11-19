// The recorded run: the board and the documents it wrote, each drawn as a sheet.
// RunBoard, RunBoardCompact, RunTranscript and the data helpers read content/demo/run.json
// on the server; the document components are pure and take parsed files. A page that draws
// the board or a document sheet renders <RunStyles /> once; ScoreFigure brings its own.
export { RunBoard, RunBoardCompact, RunTranscript } from "./run-board";
export { FindingsReport, ScoreFigure, SourcesElsewhere } from "./findings-report";
export { OwnerSheet } from "./owner-sheet";
export { CalendarSheet } from "./calendar-sheet";
export { RunDocuments } from "./run-documents";
export { SCENE_PANEL, SceneNote, SceneSwitch, type SceneTab } from "./scene-switch";
export { DOC_LABEL, Fold, OutcomeBox, SeverityChip, StatusChip, ownerLine, ownerPhrase, ownerWord } from "./doc-parts";
export { RunStyles } from "./run-styles";
export { OpenCommands } from "./run-enhance";
export { getRecordedAudit, getRecordedCalendar, runTotals, sceneDocuments, type RunDocument } from "./data";
