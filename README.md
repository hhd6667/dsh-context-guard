# dsh-context-guard

A pure **browser-side** plugin for [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh) that protects large-context sessions when switching models, and can automatically fail over to a backup model when the current one runs out of quota.

- 中文说明见下文。
- No build step, no React, no native module. All logic runs in the web client; the host half is an empty bundle mount.
- Tested against DSH web profile `0.2.0-rc.2` (Node 24, Windows). Other versions are not verified.

## What it does

### 1. Context guard on manual model switch

Switching a session that grew on a 1M model to a smaller model (e.g. 256K) does not fail at switch time — it fails on the **next** request, when the oversized prompt is sent.

The plugin watches the active session's `modelSelection` and `contextPressure` projections. When a switch would put the current context past the target model's safe threshold (default 70% of its window), it:

1. reverts the selection to the previous model immediately;
2. shows an opaque, theme-aware dialog offering:
   - **先压缩再切换** — run `/compact`, wait for pressure to drop, then switch;
   - **仍然切换** — switch anyway;
   - **保持原模型** — stay on the previous model.

Every programmatic selection is read back from the projection and retried/verified, so a rejected or raced `selectModel` call cannot silently leave the wrong model active.

### 2. Automatic failover on quota / rate-limit errors

An **自动切换** button in the composer toolbar opens per-session settings where you can:

- enable/disable automatic failover for the current session;
- pick and **order** candidate models from the live model catalog;
- optionally override a candidate's context window in tokens.

When the active turn ends with `QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT`, HTTP 429, or an explicit insufficient-balance/quota message:

1. the plugin waits for the turn to finish;
2. picks the next candidate in priority order, skipping routes that already failed in this chain;
3. checks the candidate's window at 70%; if the context is too large it runs `/compact` first and only proceeds once pressure is actually below the threshold;
4. switches and verifies the new selection;
5. sends exactly one continuation message asking the model to resume the interrupted task from existing progress.

Settings default to **off** and are stored per session in the browser's `localStorage`.

## Why a local window table

The browser model catalog intentionally omits per-model `contextWindow` (it only carries id/name/description/reasoning). The plugin therefore keeps a small provider/model → window table (`DEFAULTS` near the top of [`dsh/client.js`](dsh/client.js)), keyed primarily by model id, with exact `provider/model` overrides and substring patterns.

- A model that cannot be resolved is **not blocked** and **not used for auto-failover** (a false alarm on a 1M model is worse than a miss).
- For an unknown candidate you can fill in its real window in the settings panel; the value overrides the table for that candidate.
- Edit `DEFAULTS` (ratio, routes, models, patterns) and restart to tune built-in values.

## Install

The plugin ships as a DSH web-profile bundle. Using the `web` profile (directory `~/.dsh/profiles/web` on all platforms):

1. Make this package available to the profile, e.g. copy it under `vendor/dsh-context-guard` and add a file dependency, or install it however you install profile plugins:

   ```jsonc
   // ~/.dsh/profiles/web/package.json
   {
     "dependencies": {
       "dsh-context-guard": "file:vendor/dsh-context-guard"
     }
   }
   ```

2. Register the bundle in the same file:

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

3. Restart `dsh web` and refresh the page.

The package's `cordis.patch.yml` mounts the (empty) host half so the loader also serves the browser half declared in `dsh.client`.

## Use

- **Manual guard:** just switch models as usual on a large-context session; the dialog appears only when the target window is too small.
- **Auto failover:** click **自动切换** in the composer toolbar, add and order candidates for the current session, then enable it. The button turns green while enabled for that session.

## Limitations

- Only the conversation **currently open in the page** is watched; leaving the page or session cancels an in-flight automatic action. Nothing runs in a background worker.
- Failover fires on a **terminal** `turn/end` error. If a provider uses an always-retry policy, the turn never terminates and the plugin does not take over.
- Generic network, authentication, cancellation, and server errors do not trigger failover.
- After switching, continuation is a **new queued message**, not a replay or low-level resume of the failed request. A model may repeat some work; verify non-idempotent external actions yourself.
- If the exhausted model cannot run `/compact`, the plugin will not force an oversized prompt onto a smaller model; it tries larger-window candidates, then stops.
- `localStorage` is per browser/profile; settings do not sync across browsers or incognito sessions.

## Uninstall

Remove `dsh-context-guard` from `dsh.profile.bundles` and `dependencies` in the profile `package.json`, remove the package directory, then restart `dsh web`. Clearing site data removes the stored per-session settings.

## License

[GNU General Public License v3.0 only](LICENSE) (SPDX: `GPL-3.0-only`).

This is strong copyleft: anyone who conveys this program, or a modified version, must make the corresponding source code available under GPL-3.0-compatible terms. Private use and modification remain allowed; there is no warranty. This is a client-side browser plugin, so AGPL's network-interaction clause is not needed.

---

## 中文简介

DSH Web 客户端插件：

1. **手动切换保护**：在大上下文会话切换到小窗口模型时，先回退并弹窗，可选择「先压缩再切换」「仍然切换」「保持原模型」；所有程序化切换都会回读投影校验并重试。
2. **额度/限流自动切换**：输入框工具栏的「自动切换」按钮可按会话启用，手动添加并排序候选模型、填写未知模型窗口。出现 `QUOTA` / `ACCOUNT_QUOTA` / `RATE_LIMIT` / 429 / 余额不足等终止错误时，按顺序切换，必要时先 `/compact` 到目标窗口 70% 以下，再发送一次续接消息。

默认关闭，配置按会话保存在浏览器 `localStorage`；未知窗口不会被当作安全模型。具体限制见上方 **Limitations**。
