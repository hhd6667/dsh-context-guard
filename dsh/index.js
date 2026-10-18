// dsh-context-guard — DSH web client model/context guard.
// Copyright (C) 2026 dsh-context-guard contributors
// SPDX-License-Identifier: GPL-3.0-only
//
// Host half of dsh-context-guard. Pure client-surface plugin: all behavior
// lives in the browser (dsh/client.js), which reads each session's
// `modelSelection` and `contextPressure` projections and offers to run
// `/compact` before a large context is sent to a smaller model.
//
// The browser model catalog deliberately omits per-model contextWindow
// (id/name/reasoning only), so the target window comes from a small local
// provider/model -> window table at the top of dsh/client.js. Edit the
// DEFAULTS there (ratio / unknownWindow / windows) and restart to tune it.
//
// No host behavior beyond being loaded is required, so apply() is empty — the
// same shape as dsh-client-ui-model-selection's host half.
export const name = 'context-guard'
export function apply(/* ctx, config */) {}
export default { name, apply }
