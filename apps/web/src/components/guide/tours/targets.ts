/**
 * Every `data-tour` selector used by Saarthi, in one place.
 *
 * Tours reference `TOUR_TARGETS.x`, and the components being toured spread
 * `tourTarget('x')` onto the real element. Nothing else should hand-write a
 * `data-tour` string — a typo would silently produce a step that highlights
 * nothing, which is the most annoying possible failure for a guided tour.
 */
export const TOUR_TARGETS = {
  /* shared */
  langToggle: 'lang-toggle',
  helpFab: 'help-fab',

  /* admin */
  orgKpis: 'org-kpis',
  deptTable: 'dept-table',
  fraudAlerts: 'fraud-alerts',
  fraudAlertRow: 'fraud-alert-row',
  verifyChain: 'verify-chain',
  auditSearch: 'audit-search',
  slaEditor: 'sla-editor',

  /* manager */
  teamKpis: 'team-kpis',
  moraleGauge: 'morale-gauge',
  burnoutList: 'burnout-list',
  kanbanBoard: 'kanban-board',
  newTaskBtn: 'new-task-btn',
  reviewQueue: 'review-queue',

  /* employee */
  myKpis: 'my-kpis',
  taskRow: 'task-row',
  addProgress: 'add-progress',
  assistantInput: 'assistant-input',
  assistantChips: 'assistant-chips',
  perfTrend: 'perf-trend',
} as const;

export type TourTargetKey = keyof typeof TOUR_TARGETS;

/** Spread onto the element a tour step points at: `<div {...tourTarget('orgKpis')}>` */
export function tourTarget(key: TourTargetKey): { 'data-tour': string } {
  return { 'data-tour': TOUR_TARGETS[key] };
}

/** The selector NextStep matches against. */
export function tourSelector(key: TourTargetKey): string {
  return `[data-tour="${TOUR_TARGETS[key]}"]`;
}

/**
 * Custom DOM events dispatched by the app when a real action completes.
 *
 * Action steps hide their Next button and wait for one of these, so the user has
 * to actually do the thing rather than read about it.
 */
export const TOUR_EVENTS = {
  taskMoved: 'sw360:task-moved',
  // Not in the original event list, but the Employee tour needs it: the next
  // step's target lives inside the task drawer and does not exist until it opens.
  taskOpened: 'sw360:task-opened',
  alertOpened: 'sw360:alert-opened',
  chainVerified: 'sw360:chain-verified',
  progressAdded: 'sw360:progress-added',
  assistantReplied: 'sw360:assistant-replied',
} as const;

export type TourEventName = (typeof TOUR_EVENTS)[keyof typeof TOUR_EVENTS];

/** Fire-and-forget notification that a tour-relevant action succeeded. */
export function emitTourEvent(name: TourEventName, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
