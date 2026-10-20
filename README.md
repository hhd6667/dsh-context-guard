# dsh-context-guard

**English** · [简体中文](README.zh-CN.md)

A pure browser-side plugin for [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh). It protects large-context sessions when switching models and can automatically fail over to a user-selected model after quota or rate-limit errors.

- The interface follows the DSH language setting (Chinese/English). The automatic continuation prompt is sent in the active interface language.
- No build step, React dependency, native module, credential, or background worker is required.
- The host entry is an empty bundle mount; all behavior runs in the DSH web client.
- Developed and verified against the DSH web profile `0.2.0-rc.2` on Windows/Node 24. Compatibility with other versions is not guaranteed.

## Features

### Context guard for manual model switching

Switching a session that grew on a large-context model to a smaller model normally succeeds at selection time but can fail on the next request, when the oversized prompt is sent.

The plugin watches the active session's `modelSelection` and `contextPressure` projections. If the current usage reaches the target model's safety threshold (70% by default), it:

1. immediately reverts to the previous model;
2. displays an opaque, theme-aware dialog with three choices:
   - **Compact then switch** — run `/compact`, wait until context pressure drops, then switch;
   - **Switch anyway** — accept the risk and switch immediately;
   - **Keep current model** — stay on the previous model.

Programmatic model selections are read back from the projection, retried when the session is busy, and verified. This prevents a failed or raced RPC from silently leaving the wrong model active. Closing or refreshing the page also keeps the previously selected model rather than silently applying a risky switch.

### Automatic failover for quota/rate-limit errors

The **Auto switch** button in the composer toolbar opens settings for the current session. You can:

- enable or disable automatic failover independently for each conversation;
- choose candidates from the live model catalog;
- drag-free reorder candidates using up/down controls (top = highest priority);
- manually specify a context window in tokens for a model not in the built-in table;
- save the current ordered list as a named **candidate group** and re-apply it to any session. Groups are shared across every session in this browser/profile. Applying a group only replaces the ordered candidates; it never toggles failover on by itself. A route later removed from DSH's model list is simply skipped at failover time (unknown window, rejected switch, or unconfirmed selection), so a stale group never blocks the chain and you do not have to prune it by hand.

Adding a model or moving candidates up/down no longer snaps a long catalog/list back to the top; the scroll position is preserved.

When a live turn terminates with `QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT`, HTTP 429, or an explicit insufficient-balance/quota message, the plugin:

1. waits until the current turn is no longer running;
2. chooses the next candidate, skipping routes that already failed in the current chain or cannot be switched to (removed/unavailable model, unknown window);
3. checks context pressure against 70% of the candidate window;
4. runs `/compact` first when needed and verifies that pressure actually dropped;
5. switches and verifies the resulting model selection, falling through to the next candidate when a switch is rejected or not confirmed;
6. sends exactly one queued continuation message asking the model to resume from existing progress without repeating completed work.

Failover is disabled by default. Per-session settings and the shared candidate groups are stored in the browser's `localStorage`.

## Context windows

The browser model catalog does not carry a per-model `contextWindow`. The plugin resolves a window from these sources, in order:

1. **A value you typed in the candidate row** (highest priority; blank uses the detected value).
2. **The windows DSH already resolved for its own Models settings** — read once, read-only, through `remote.settings.describe()`. This covers provider profiles with explicit `contextWindow` entries and adapter defaults, and is refreshed when the panel opens.
3. **The shipped table** in `DEFAULTS` near the top of [`dsh/client.js`](dsh/client.js), keyed by exact `provider/model`, then model ID, then conservative substring patterns.
4. If nothing resolves, the window stays **unknown**.

Configured or detected windows are shown in the candidate row as a placeholder (`262144 auto`) and next to each catalog result (`· 262K`), so you can see what will be used before typing anything.

If a model cannot be resolved:

- the manual context guard does **not** block it, avoiding false alarms on an unrecognized 1M model;
- automatic failover does **not** use it as a safe candidate unless you enter a real context-window value in the row.

A typed override must be the model's **context window**, not its maximum output length. Known examples in the shipped table include `deepseek-flash` at 1,000,000 tokens and `ark-code-latest` at 262,144 tokens.

### The ring ceiling after a switch

DSH's context ring divides measured pressure by the ceiling stored in the session's newest real request (`request/context`). A model switch does not write that record — it only changes the saved selection — so for a moment after a switch the ring keeps showing the **previous** model's ceiling, even though the switch already succeeded.

While the ring and the selected model disagree, the plugin shows a small chip next to **Auto switch** with the ceiling that actually applies now and your usage against it (for example `42% · 262K`; it turns red and reads `118% · over 262K` once usage passes that ceiling). Hovering it names both values. The chip disappears on its own as soon as the next request updates the ring.

Because that disagreement is invisible for a second when two models share a ceiling, and because it ends the moment any request runs, the chip also stays up for about 12 seconds after **any** model switch as a neutral-colored confirmation of the ceiling now in effect. No chip means the ring already matches the selected model.

## Install

The package is a web-profile bundle. These steps describe a local profile installation from a copy of the repository; DSH may provide other plugin installation mechanisms in future versions.

1. Copy the package into the web profile, for example:

   ```text
   ~/.dsh/profiles/web/vendor/dsh-context-guard
   ```

2. Add it to `~/.dsh/profiles/web/package.json`:

   ```jsonc
   {
     "dependencies": {
       "dsh-context-guard": "file:vendor/dsh-context-guard"
     }
   }
   ```

3. Register it in the same file, after the base and web application bundles:

   ```jsonc
   {
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "dsh-context-guard"
         ]
       }
     }
   }
   ```

4. Restart `dsh web`, then refresh the browser page.

`cordis.patch.yml` mounts the empty host half so the loader also serves `dsh/client.js`, which is declared through `dsh.client`.

## Usage

- Switch models normally. The warning appears only when the current context is close to or above the target model's threshold.
- Click **Auto switch** in the composer toolbar to configure failover candidates for the conversation currently displayed.
- The toolbar button is green when failover is enabled for that session and uses its normal appearance when disabled.
- Leave “Window tokens” blank whenever the row already shows a detected value (for example `262144 auto` or `· 262K`). Only type a value when the row says the window is unknown, or when the detected value is wrong for that provider.
- Only the currently displayed conversation is observed. Leaving the page or session cancels an in-flight automatic action.
- Right after a switch, trust the chip next to **Auto switch** rather than the ring: the ring only reloads its ceiling when the next request is sent.

## Limitations

- There is no browser-side API to replay the exact failed provider request. Failover sends a new queued continuation message; the model may repeat some reasoning. Check non-idempotent external actions yourself.
- Failover requires a terminal `turn/end` error. A provider configured to retry forever may never expose such an event.
- Generic authentication, network, cancellation, and unrelated server errors do not trigger failover.
- If the exhausted model cannot run `/compact`, the plugin will not force an oversized prompt into a smaller candidate; it tries safer candidates and then stops.
- Only the open page is protected. No service worker or background process continues after the page closes.
- `localStorage` is per browser/profile and does not synchronize across browsers, machines, or incognito sessions.
- A browser plugin cannot append session records, so it cannot fix the ring's ceiling itself — it can only show the correct value while the two disagree.
- The local model-window table requires maintenance when providers introduce new models.

## Uninstall

1. Remove `dsh-context-guard` from `dsh.profile.bundles`.
2. Remove it from `dependencies`.
3. Delete the package directory from the profile.
4. Restart `dsh web` and refresh the page.

Clearing site data removes stored per-session failover settings.

## License

Copyright (C) 2026 dsh-context-guard contributors

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

See [LICENSE](LICENSE) for the complete text (SPDX: `GPL-3.0-only`).
