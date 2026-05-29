// Undo/redo via full snapshots of the project document.
// Simple and robust for a POC; snapshots are small JSON blobs.
import { state, emit, normalizeActive } from './state.js';

const MAX = 100;
const undoStack = [];
const redoStack = [];

function snapshot() {
  // images are runtime-only; we serialize the whole workspace doc.
  return JSON.stringify(state.workspace);
}

export function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0;
  emit('history:change');
}

function restore(json) {
  state.workspace = JSON.parse(json);
  normalizeActive();
  emit('project:replaced');
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  emit('history:change');
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  emit('history:change');
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }
export function clearHistory() { undoStack.length = 0; redoStack.length = 0; emit('history:change'); }
