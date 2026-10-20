// Browser half of dsh-context-guard.
//
// Problem: switching a session that grew a large context on a 1M model to a
// smaller model (e.g. ark-code, 256K) does NOT fail at switch time — it fails
// on the NEXT request, when the oversized prompt is sent. This plugin watches
// each bound session's projections and, the moment the selected model changes
// to one whose window the current context already exceeds, offers to run
// `/compact` first.
//
// Why a local window table: the browser model catalog (session/modelCatalog)
// deliberately strips per-model contextWindow — its wire schema keeps only
// id/name/description/reasoning — so only the host LLM registry knows it. We
// therefore keep a local table keyed primarily by MODEL ID (a window is a
// property of the model, not of the provider prefix that exposes it), with
// exact "provider/model" overrides and substring patterns. A model we cannot
// resolve is NOT blocked: a permissive miss beats a false alarm on a 1M model.
//
// Zero-dependency, hand-written lazy-CJS bundle protocol (same stance as
// @liustack/modlens): no React, no build step, plain DOM modal.
window.__ModuleLoader__.load({
  id: 'dsh-context-guard',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // Context window is a property of the MODEL, not of the provider route —
    // the same model (e.g. deepseek-flash) is exposed under many provider
    // prefixes (deepseek-official / deepseek-account / opencode2dsh / ...),
    // all sharing its 1M window. The browser catalog strips contextWindow, so
    // we keep a local table keyed primarily by MODEL ID, with exact full-route
    // overrides and substring patterns. An UNKNOWN model resolves to null and
    // is NOT blocked (a permissive miss beats a false alarm on a 1M model).
    var DEFAULTS = {
      ratio: 0.7,
      // exact "provider/model" overrides win over everything
      routes: {
        'huosandshplan1/ark-code-latest': 262144
      },
      // model id -> window (provider-agnostic)
      models: {
        'ark-code-latest': 262144,
        'deepseek-flash': 1000000,
        'deepseek-v4.1-flash': 1048576,
        'deepseek-v4.1-flash-free': 1048576,
        'mimo-v2.6-flash-free': 1048576,
        'deepseek-v4-pro': 1000000
      },
      // substring match on full route -> window (checked in order; first hit)
      patterns: [
        { match: 'ark-code', window: 262144 },
        { match: 'deepseek-flash', window: 1000000 },
        { match: 'deepseek-v4', window: 1048576 },
        { match: 'mimo', window: 1048576 }
      ]
    }

    // ---- localization (follows the DSH locale service; zh default, en fallback)
    var LOCALE_TEXT = {
      'auto.title': { zh: '自动切换', en: 'Auto switch' },
      'auto.titleWithGroup': { zh: '自动切换（{name}）', en: 'Auto switch ({name})' },
      'auto.settings': { zh: '自动切换设置', en: 'Automatic failover settings' },
      'auto.close': { zh: '关闭', en: 'Close' },
      'auto.introShort': { zh: '仅保存当前会话 · 候选顺序即优先级', en: 'Per-session only · order = priority' },
      'auto.session': { zh: '当前会话：', en: 'Current session: ' },
      'auto.noSession': { zh: '未打开会话', en: 'No session open' },
      'auto.enable': { zh: '启用本会话自动切换', en: 'Enable automatic failover for this session' },
      'auto.perSessionHint': { zh: '关闭或离开页面不会在后台继续切换', en: 'No background failover after closing or leaving this page' },
      'auto.candidates': { zh: '候选模型', en: 'Candidate models' },
      'auto.groups': { zh: '候选组（所有会话共用）', en: 'Candidate groups (shared across sessions)' },
      'auto.groupChoose': { zh: '选择一个组…', en: 'Choose a group…' },
      'auto.groupName': { zh: '组名，用于保存当前顺序', en: 'Group name to save the current order' },
      'auto.groupDefaultName': { zh: '未命名组', en: 'Untitled group' },
      'auto.groupSave': { zh: '保存当前为组', en: 'Save current as group' },
      'auto.groupSaveShort': { zh: '存为组', en: 'Save as' },
      'auto.groupCancel': { zh: '取消', en: 'Cancel' },
      'auto.groupApply': { zh: '应用', en: 'Apply' },
      'auto.groupRename': { zh: '重命名组', en: 'Rename group' },
      'auto.groupNameRequired': { zh: '组名不能为空', en: 'The group name cannot be empty' },
      'auto.groupNameTaken': { zh: '已存在同名的组，请换一个名字', en: 'A group with that name already exists; choose another name' },
      'auto.groupDelete': { zh: '删除', en: 'Delete' },
      'auto.groupStorageUnavailable': { zh: '浏览器存储不可用，无法保存候选组', en: 'Browser storage is unavailable; cannot save candidate groups' },
      'auto.groupSaveFailed': { zh: '候选组保存失败：', en: 'Could not save candidate groups: ' },
      'auto.noCandidates': { zh: '尚未添加候选模型。', en: 'No candidate models yet.' },
      'auto.up': { zh: '上移', en: 'Move up' },
      'auto.down': { zh: '下移', en: 'Move down' },
      'auto.remove': { zh: '移除', en: 'Remove' },
      'auto.windowTokens': { zh: '点击设置窗口 tokens', en: 'Click to set window tokens' },
      'auto.windowTokensShort': { zh: 'tokens', en: 'tokens' },
      'auto.windowSet': { zh: '设窗口', en: 'set window' },
      'auto.windowConfirm': { zh: '确认窗口值', en: 'Confirm window' },
      'auto.windowCustomTip': { zh: '已手动指定窗口（点击修改）：', en: 'Manual window override (click to edit): ' },
      'auto.windowDefault': { zh: '（默认）', en: ' (default)' },
      'auto.windowAuto': { zh: '自动获取', en: 'auto' },
      'auto.windowAutoTip': { zh: '从 DSH 模型设置自动获取；留空即使用它', en: 'Detected from DSH model settings; leave blank to use it' },
      'auto.windowUnknown': { zh: '未知；可填写', en: 'Unknown; optional' },
      'auto.windowInvalid': { zh: '窗口覆盖值必须为正整数 tokens；留空使用已知窗口。', en: 'Window override must be a positive integer of tokens, or blank to use the known window.' },
      'auto.addModels': { zh: '添加模型', en: 'Add models' },
      'auto.reload': { zh: '重新加载目录', en: 'Reload catalog' },
      'auto.search': { zh: '搜索提供商或模型', en: 'Search provider or model' },
      'auto.loading': { zh: '正在加载模型目录…', en: 'Loading model catalog…' },
      'auto.noMatch': { zh: '没有匹配的模型。', en: 'No matching models.' },
      'auto.notLoaded': { zh: '模型目录尚未加载。', en: 'Model catalog not loaded yet.' },
      'auto.add': { zh: '添加', en: 'Add' },
      'auto.added': { zh: '已添加', en: 'Added' },
      'auto.first100': { zh: '仅显示前 100 项，请搜索缩小范围。', en: 'Showing the first 100 matches; search to narrow results.' },
      'auto.saving': { zh: '正在保存设置…', en: 'Saving settings…' },
      'auto.saveFailed': { zh: '保存失败：', en: 'Save failed: ' },
      'auto.statusFailed': { zh: '状态读取失败：', en: 'Could not read status: ' },
      'auto.enabledTip': { zh: '自动切换已启用（当前会话）', en: 'Automatic failover is enabled for this session' },
      'auto.disabledTip': { zh: '自动切换未启用（当前会话）', en: 'Automatic failover is disabled for this session' },
      'auto.catalogFailed': { zh: '模型目录加载失败：', en: 'Could not load the model catalog: ' },
      'auto.catalogBad': { zh: '目录响应不是 groups 数组', en: 'Catalog response is not a groups array' },
      'auto.settingsReadFailed': { zh: '设置读取失败：', en: 'Could not read settings: ' },
      'auto.catalogUnavailable': { zh: '模型目录服务不可用', en: 'The model catalog service is unavailable' },
      'auto.catalogRejected': { zh: '加载模型目录失败', en: 'Failed to load the model catalog' },
      'auto.settingsInitFailed': { zh: '自动切换设置界面初始化失败', en: 'Automatic failover settings failed to initialize' },
      'auto.unknownError': { zh: '未知错误', en: 'Unknown error' },
      'auto.limitChip': { zh: '上限 {window}', en: 'limit {window}' },
      'auto.limitChipStale': { zh: '{percent}% · 上限 {window}', en: '{percent}% · {window}' },
      'auto.limitChipOver': { zh: '{percent}% · 超过 {window}', en: '{percent}% · over {window}' },
      'auto.limitChipTip': {
        zh: 'DSH 上下文圆环的上限（{ring}）来自最近一次真实请求，还没有按当前模型 {model} 的 {window} 重新计算。\n按 {window} 计算，当前占用约 {percent}%。发出下一条消息后圆环会自动更新。',
        en: 'The DSH context ring still shows the ceiling from the last real request ({ring}); it has not been recalculated for the current model {model} ({window}) yet.\nAgainst {window}, usage is about {percent}%. The ring refreshes on your next message.'
      },
      'auto.limitChipAppliedTip': {
        zh: '当前模型 {model} 的上下文上限是 {window}，按它计算当前占用约 {percent}%。\n刚切换过模型，所以这里先确认一次上限；几秒后自动隐藏。',
        en: 'The current model {model} has a {window} context ceiling; usage against it is about {percent}%.\nShown briefly to confirm the ceiling after a model switch; it hides on its own.'
      },
      'warn.title': { zh: '上下文可能超过目标模型', en: 'Context may exceed the target model' },
      'warn.cancel': { zh: '取消', en: 'Cancel' },
      'warn.stay': { zh: '保持原模型', en: 'Keep current model' },
      'warn.switch': { zh: '仍然切换', en: 'Switch anyway' },
      'warn.compact': { zh: '先压缩再切换', en: 'Compact then switch' },
      'warn.detail': {
        zh: '当前会话上下文约 {usage} token，目标模型 {model} 的窗口约 {window}（按 {ratio}% = {threshold} 预警）。直接发送下一条消息可能因超出上下文而报错。\n\n已为你暂时保持在原模型 {prev}，请选择：',
        en: 'This session is using about {usage} tokens. The target model {model} has about a {window} context window (warning at {ratio}% = {threshold}). Sending the next message directly may fail because the context is too large.\n\nThe current model {prev} has been kept for now. Choose an option:'
      },
      'st.waitQuota': { zh: '等待额度或限流错误', en: 'Waiting for quota or rate-limit errors' },
      'st.noSource': { zh: '当前会话没有可用事件源', en: 'No event source is available for this session' },
      'st.eventFailed': { zh: '读取会话事件失败', en: 'Failed to read session events' },
      'st.enabled': { zh: '自动备用模型已启用', en: 'Automatic failover is enabled' },
      'st.disabled': { zh: '自动备用模型未启用', en: 'Automatic failover is disabled' },
      'st.autoFailed': { zh: '自动切换失败', en: 'Automatic failover failed' },
      'st.userChanged': { zh: '会话或模型已由用户切换，停止自动续接', en: 'The session or model was changed manually; stopping automatic continuation' },
      'st.waiting': { zh: '额度或限流失败，等待当前轮次结束', en: 'Quota/rate-limit failure; waiting for the current turn to finish' },
      'st.busy': { zh: '会话仍在运行，未自动修改模型', en: 'The session is still running; the model was not changed automatically' },
      'st.usageUnknown': { zh: '上下文用量未知，无法安全自动切换', en: 'Context usage is unknown; cannot fail over safely' },
      'st.usageUnknownStop': { zh: '上下文用量未知，停止自动切换', en: 'Context usage is unknown; stopping automatic failover' },
      'st.compacting': { zh: '候选模型窗口不足，正在先压缩上下文：', en: 'Candidate window is too small; compacting context first: ' },
      'st.switching': { zh: '正在切换到备用模型：', en: 'Switching to backup model: ' },
      'st.otherModel': { zh: '用户已选择其他模型，停止自动续接', en: 'Another model was selected; stopping automatic continuation' },
      'st.switchFailed': { zh: '备用模型切换失败：', en: 'Backup model switch failed: ' },
      'st.switchSkipping': { zh: '该备用模型不可用，跳过并尝试下一个：', en: 'Backup model unavailable; skipping to the next one: ' },
      'st.allSwitchesFailed': { zh: '所有备用模型都无法确认切换，未发送续接指令', en: 'No backup model could be confirmed; no continuation was sent' },
      'st.leftSession': { zh: '已离开当前会话，停止自动续接', en: 'You left the current session; stopping automatic continuation' },
      'st.notConfirmed': { zh: '未能确认备用模型，未发送续接指令', en: 'Could not confirm the backup model; no continuation was sent' },
      'st.continuing': { zh: '模型已切换，正在发送一次续接指令', en: 'Model switched; sending one continuation request' },
      'st.continueRejected': { zh: '续接指令未被接受：', en: 'The continuation request was not accepted: ' },
      'st.continued': { zh: '已发送续接指令，使用备用模型：', en: 'Continuation sent using backup model: ' },
      'st.noCandidate': { zh: '没有可安全使用的备用模型：候选已失败、窗口未知或压缩未达安全阈值', en: 'No safe backup model: candidates failed, windows are unknown, or compaction did not reach the safe threshold' },
      'st.leftCancel': { zh: '已离开会话，自动续接已取消', en: 'You left the session; automatic continuation was cancelled' },
      'st.configChanged': { zh: '配置已更改，旧自动切换已取消', en: 'Settings changed; the previous automatic action was cancelled' },
      'st.storageUnavailable': { zh: '浏览器本地存储不可用，设置未保存', en: 'Browser local storage is unavailable; settings were not saved' },
      'st.saveFailed': { zh: '保存自动切换配置失败', en: 'Failed to save automatic failover settings' },
      'st.cancelled': { zh: '已取消自动切换', en: 'Automatic failover cancelled' },
      'st.notAccepted': { zh: '操作未被接受', en: 'The operation was not accepted' },
      'cont.text': {
        zh: '请继续上一条因模型额度或限流失败而中断的任务；从已有进度继续，不要重复已完成的操作。',
        en: 'Please continue the task that was interrupted because the previous model hit a quota or rate limit. Resume from the existing progress and do not repeat work that is already done.'
      }
    }
    var localeId = 'zh'
    function resolveLocaleId(id) { return String(id || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en' }
    function detectLocale(locale) {
      try {
        if (locale && typeof locale.getLocale === 'function') return resolveLocaleId(locale.getLocale().active)
        if (locale && typeof locale.getSnapshot === 'function') return resolveLocaleId(locale.getSnapshot().active)
      } catch (_) {}
      try {
        var nav = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages[0]) || (typeof navigator !== 'undefined' && navigator.language) || ''
        return resolveLocaleId(nav)
      } catch (_) { return 'zh' }
    }
    function tr(key) {
      var entry = LOCALE_TEXT[key]
      if (!entry) return key
      return entry[localeId] || entry.en || entry.zh || key
    }
    function fmt(key, vars) {
      return tr(key).replace(/\{(\w+)\}/g, function (_, name) {
        return vars && vars[name] != null ? String(vars[name]) : ''
      })
    }

    function routeKey(sel) {
      if (!sel) return ''
      return (sel.provider || '') + '/' + (sel.model || '')
    }

    // Resolve the target context window for a selection. Returns a number or
    // null (unknown -> caller must not block).
    function resolveWindow(sel, cfg) {
      var full = routeKey(sel)
      var id = sel.model || ''
      if (Object.prototype.hasOwnProperty.call(cfg.routes, full)) return cfg.routes[full]
      if (id && Object.prototype.hasOwnProperty.call(cfg.models, id)) return cfg.models[id]
      for (var i = 0; i < cfg.patterns.length; i++) {
        var p = cfg.patterns[i]
        if (p.match && (full.indexOf(p.match) !== -1 || id.indexOf(p.match) !== -1)) return p.window
      }
      return null
    }

    function fmtK(n) {
      if (localeId === 'en') return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n)
      if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万'
      return String(n)
    }

    // Context windows declared in the Models settings page. The browser model
    // catalog omits this field, but remote.settings.describe() exposes the
    // schema-resolved provider profiles (defaults plus user overrides), often
    // under root `models` (DeepSeek adapters) or `providers.<id>.models`
    // (OpenAI-compatible adapters). We build model-id -> positive windows and
    // never mutate settings. User-specified candidate overrides still win.
    var settingsWindows = new Map()
    function rememberWindow(id, n) {
      id = String(id || '').trim()
      if (!id || typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) return
      if (!settingsWindows.has(id)) settingsWindows.set(id, n)
    }
    function harvestModelNode(node) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return
      var id = node.id != null ? node.id : node.model
      if (id != null && node.contextWindow != null) rememberWindow(id, node.contextWindow)
    }
    function harvestSettingsValue(value, depth) {
      if (!value || typeof value !== 'object' || depth > 8) return
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (item && typeof item === 'object') {
            harvestModelNode(item)
            harvestSettingsValue(item, depth + 1)
          }
        })
        return
      }
      harvestModelNode(value)
      // OpenAI-compatible profiles size undeclared models from their own
      // defaultContextWindow; apply it so those models are usable as candidates
      // even though their rows carry no explicit window.
      if (numberLike(value.defaultContextWindow) && Array.isArray(value.models)) {
        value.models.forEach(function (model) {
          if (model && typeof model === 'object' && model.contextWindow == null) {
            var id = model.id != null ? model.id : model.model
            if (id != null) rememberWindow(id, value.defaultContextWindow)
          }
        })
      }
      Object.keys(value).forEach(function (key) {
        var child = value[key]
        if (child && typeof child === 'object') harvestSettingsValue(child, depth + 1)
      })
    }
    function numberLike(n) { return typeof n === 'number' && isFinite(n) && n > 0 }
    async function refreshSettingsWindows(ns) {
      try {
        if (!ns || typeof ns.describe !== 'function') return
        var response = await ns.describe()
        var value = response && response.ok === false ? null : (response && response.ok === true ? response.value : response)
        var namespaces = value && Array.isArray(value.namespaces) ? value.namespaces : []
        var before = settingsWindows.size
        namespaces.forEach(function (view) {
          if (view && view.value && typeof view.value === 'object') harvestSettingsValue(view.value, 0)
        })
        if (settingsWindows.size !== before) console.info('[context-guard] loaded ' + (settingsWindows.size - before) + ' context window(s) from DSH model settings')
      } catch (e) { console.warn('[context-guard] could not read configured context windows', e) }
    }
    function resolveWindowWithSettings(sel) {
      var id = sel && sel.model
      // A window the user configured in DSH's own Models settings is the most
      // authoritative value available to the browser, so it wins over the
      // shipped table; the table still covers models whose settings are default
      // and whose profile the page does not expose.
      if (id && settingsWindows.has(id)) return settingsWindows.get(id)
      var built = resolveWindow(sel, DEFAULTS)
      if (typeof built === 'number' && built > 0) return built
      return null
    }
    // The settings namespace is an ARGUMENT, not a closure lookup: this helper
    // lives at factory scope, where `remote` does not exist. Reading it here
    // threw "remote is not defined", which aborted getCatalog() and surfaced as
    // "model catalog failed to load".
    function loadSettingsWindows(ns) {
      return refreshSettingsWindows(ns)
    }

    // ---- plain-DOM modal (opaque, theme-aware, accessible) -------------
    var STYLE_ID = 'context-guard-style'
    var modalEl = null

    function injectStyle() {
      if (document.getElementById(STYLE_ID)) return
      var css = '' +
        '.cg-root{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;box-sizing:border-box;background:rgba(15,18,26,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);' +
        'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
        'animation:cg-fade .14s ease-out}' +
        '.cg-card{width:min(480px,calc(100vw - 40px));border-radius:16px;padding:22px 22px 18px;box-sizing:border-box;' +
        'box-shadow:0 24px 64px rgba(0,0,0,.42),0 2px 8px rgba(0,0,0,.2);animation:cg-pop .16s cubic-bezier(.2,.9,.3,1.2)}' +
        '.cg-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}' +
        '.cg-icon{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center}' +
        '.cg-title{font-size:16px;font-weight:650;letter-spacing:.2px}' +
        '.cg-close{margin-left:auto;flex:none;width:30px;height:30px;border-radius:8px;border:none;background:transparent;cursor:pointer;' +
        'font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center}' +
        '.cg-body{font-size:13.5px;margin:0 0 20px;white-space:pre-line}' +
        '.cg-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
        '.cg-spacer{flex:1 1 auto}' +
        '.cg-btn{appearance:none;-webkit-appearance:none;height:38px;padding:0 16px;border-radius:10px;font-size:14px;font-weight:550;' +
        'cursor:pointer;border:1px solid transparent;transition:background .12s,border-color .12s,box-shadow .12s;white-space:nowrap}' +
        '.cg-btn:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}' +
        '.cg-ghost{background:transparent}' +
        '.cg-outline{background:transparent}' +
        // light theme
        '.cg-root[data-theme=light] .cg-card{background:#ffffff;border:1px solid rgba(15,23,42,.12);color:#0f172a}' +
        '.cg-root[data-theme=light] .cg-title{color:#0f172a}' +
        '.cg-root[data-theme=light] .cg-icon{background:#fef3c7;color:#b45309}' +
        '.cg-root[data-theme=light] .cg-close{color:#64748b}.cg-root[data-theme=light] .cg-close:hover{background:rgba(15,23,42,.07);color:#0f172a}' +
        '.cg-root[data-theme=light] .cg-body{color:#475569}' +
        '.cg-root[data-theme=light] .cg-ghost{color:#64748b}.cg-root[data-theme=light] .cg-ghost:hover{background:rgba(15,23,42,.06);color:#0f172a}' +
        '.cg-root[data-theme=light] .cg-outline{border-color:rgba(15,23,42,.18);color:#0f172a}.cg-root[data-theme=light] .cg-outline:hover{background:rgba(15,23,42,.05)}' +
        '.cg-root[data-theme=light] .cg-primary{background:#2563eb;color:#fff}.cg-root[data-theme=light] .cg-primary:hover{background:#1d4ed8}' +
        // dark theme
        '.cg-root[data-theme=dark]{background:rgba(0,0,0,.62)}' +
        '.cg-root[data-theme=dark] .cg-card{background:#1d2027;border:1px solid rgba(255,255,255,.1);color:#f1f5f9}' +
        '.cg-root[data-theme=dark] .cg-title{color:#f8fafc}' +
        '.cg-root[data-theme=dark] .cg-icon{background:rgba(251,191,36,.16);color:#fbbf24}' +
        '.cg-root[data-theme=dark] .cg-close{color:#94a3b8}.cg-root[data-theme=dark] .cg-close:hover{background:rgba(255,255,255,.1);color:#f8fafc}' +
        '.cg-root[data-theme=dark] .cg-body{color:#aeb6c2}' +
        '.cg-root[data-theme=dark] .cg-ghost{color:#94a3b8}.cg-root[data-theme=dark] .cg-ghost:hover{background:rgba(255,255,255,.08);color:#f1f5f9}' +
        '.cg-root[data-theme=dark] .cg-outline{border-color:rgba(255,255,255,.18);color:#e5e7eb}.cg-root[data-theme=dark] .cg-outline:hover{background:rgba(255,255,255,.07)}' +
        '.cg-root[data-theme=dark] .cg-primary{background:#3b82f6;color:#fff}.cg-root[data-theme=dark] .cg-primary:hover{background:#2f6fe0}' +
        '@keyframes cg-fade{from{opacity:0}to{opacity:1}}' +
        '@keyframes cg-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}'
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
      document.head.appendChild(style)
    }

    // Detect light/dark: explicit DSH/html attributes win, else probe the
    // primary-label color's luminance (light text => dark UI).
    function detectTheme() {
      try {
        var de = document.documentElement
        var attrs = [de.getAttribute('data-theme'), de.getAttribute('data-color-mode'), de.getAttribute('data-color-scheme'), de.className || ''].join(' ')
        if (/dark/i.test(attrs)) return 'dark'
        if (/\blight\b/i.test(attrs)) return 'light'
        var cs = getComputedStyle(de)
        if (cs && cs.colorScheme && /dark/i.test(cs.colorScheme)) return 'dark'
        var probe = document.createElement('div')
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;color:var(--dsw-alias-label-primary,#111)'
        document.body.appendChild(probe)
        var m = (getComputedStyle(probe).color || '').match(/rgba?\(([^)]+)\)/)
        probe.remove()
        if (m) {
          var p = m[1].split(',').map(function (x) { return parseFloat(x) })
          var lum = (0.2126 * (p[0] || 0) + 0.7152 * (p[1] || 0) + 0.0722 * (p[2] || 0)) / 255
          return lum > 0.55 ? 'dark' : 'light'
        }
      } catch (_) {}
      return 'light'
    }

    function closeModal() {
      if (onKey) { try { document.removeEventListener('keydown', onKey, true) } catch (_) {} onKey = null }
      if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl)
      modalEl = null
    }
    var onKey = null

    var WARN_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 3l10 18H2L12 3z" fill="currentColor" fill-opacity=".18"/>' +
      '<path d="M12 8v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="17.2" r="1.3" fill="currentColor"/></svg>'

    // Resolves true (compact) / false (proceed anyway) / null (stay / cancel).
    function ask(detail) {
      return new Promise(function (resolve) {
        closeModal()
        injectStyle()

        var root = document.createElement('div')
        root.className = 'cg-root'
        root.setAttribute('data-theme', detectTheme())
        root.setAttribute('role', 'dialog')
        root.setAttribute('aria-modal', 'true')
        root.setAttribute('aria-label', tr('warn.title'))

        var card = document.createElement('div')
        card.className = 'cg-card'

        var head = document.createElement('div')
        head.className = 'cg-head'
        var icon = document.createElement('div')
        icon.className = 'cg-icon'
        icon.innerHTML = WARN_SVG
        var title = document.createElement('div')
        title.className = 'cg-title'
        title.textContent = tr('warn.title')
        var close = document.createElement('button')
        close.className = 'cg-close'
        close.setAttribute('aria-label', tr('warn.cancel'))
        close.textContent = '×'
        head.appendChild(icon); head.appendChild(title); head.appendChild(close)

        var body = document.createElement('p')
        body.className = 'cg-body'
        body.textContent = detail

        var foot = document.createElement('div')
        foot.className = 'cg-foot'
        function btn(label, cls) {
          var b = document.createElement('button')
          b.type = 'button'
          b.className = 'cg-btn ' + cls
          b.textContent = label
          return b
        }
        var stay = btn(tr('warn.stay'), 'cg-ghost')
        var spacer = document.createElement('span')
        spacer.className = 'cg-spacer'
        var skip = btn(tr('warn.switch'), 'cg-outline')
        var go = btn(tr('warn.compact'), 'cg-primary')
        foot.appendChild(stay); foot.appendChild(spacer); foot.appendChild(skip); foot.appendChild(go)

        card.appendChild(head); card.appendChild(body); card.appendChild(foot)
        root.appendChild(card)

        var done = false
        function finish(v) { if (!done) { done = true; closeModal(); resolve(v) } }
        go.addEventListener('click', function () { finish(true) })
        skip.addEventListener('click', function () { finish(false) })
        stay.addEventListener('click', function () { finish(null) })
        close.addEventListener('click', function () { finish(null) })
        root.addEventListener('mousedown', function (e) { if (e.target === root) finish(null) })
        onKey = function (e) {
          if (e.composedPath && !e.composedPath().includes(root)) return
          if (e.key === 'Escape') { e.preventDefault(); finish(null) }
          else if (e.key === 'Enter') { e.preventDefault(); finish(true) }
        }
        document.addEventListener('keydown', onKey, true)

        modalEl = root
        document.body.appendChild(root)
        setTimeout(function () { try { go.focus() } catch (_) {} }, 0)
      })
    }

    function usageOf(sessions, sessionId) {
      try {
        var b = sessions.binding(sessionId)
        var pf = b && b.session && b.session.projections && b.session.projections.faceOf('contextPressure')
        var s = pf ? pf.getSnapshot() : null
        var u = s && (s.projectedTokens != null ? s.projectedTokens : s.pressureTokens)
        return typeof u === 'number' && isFinite(u) ? u : null
      } catch (_) { return null }
    }

    // Run `/compact` for THIS session, then wait for the projected context to
    // actually fall below targetThreshold (best-effort; compaction is a host
    // flow). Resolves with the post-compaction usage, or the last sample on
    // timeout — the caller switches regardless, but waiting avoids sending an
    // oversized first prompt to the small model.
    function runCompactAndWait(sessions, sessionId, targetThreshold) {
      return new Promise(function (resolve) {
        var b
        try { b = sessions.binding(sessionId) } catch (_) { b = undefined }
        if (!b || !b.session || typeof b.session.command !== 'function') { resolve(usageOf(sessions, sessionId)); return }

        var startUsage = usageOf(sessions, sessionId)
        var settled = false
        var deadline = Date.now() + 90000
        function done(u) { if (!settled) { settled = true; resolve(u) } }

        Promise.resolve(b.session.command('/compact')).then(function (r) {
          if (r && r.ok === false) console.warn('[context-guard] /compact rejected:', r.error)
        }).catch(function (e) { console.warn('[context-guard] /compact failed:', e) })

        var timer = setInterval(function () {
          var u = usageOf(sessions, sessionId)
          if (u != null && (u < targetThreshold || (startUsage != null && u < startUsage * 0.985))) {
            clearInterval(timer); done(u); return
          }
          if (Date.now() > deadline) { clearInterval(timer); done(u) }
        }, 1000)
      })
    }

// Insert inside the existing client factory. No imports, exports, RPCs, or
// session subscriptions. The containing factory supplies resolveWindow/DEFAULTS/tr.
function createAutoSettings(options) {
  var disposed = false
  var opened = false
  var sessionId = null
  var draft = { enabled: false, candidates: [] }
  var catalog = []
  var catalogLoaded = false
  var fetchEpoch = 0
  var saveEpoch = 0
  var saveQueues = new Map()
  var pendingSaves = new Map()
  var errorText = ''
  var loading = false
  var previousFocus = null
  var host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#172033;font-size:14px;'
  // A shadow root keeps host themes from making the card transparent or changing
  // controls. All user/catalog strings enter through textContent or input.value.
  var root = typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host
  var T = function (k) {
    if (typeof options.t === 'function') return options.t(k)
    if (typeof tr === 'function') return tr(k)
    return k
  }

  var style = document.createElement('style')
  style.textContent = [
    ':host,*{box-sizing:border-box}',
    '.cg2-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);pointer-events:auto;padding:20px}',
    '.cg2-panel{background:#fff;color:#172033;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 80px rgba(2,6,23,.28);width:640px;max-width:100%;max-height:88vh;overflow:auto;padding:0}',
    '.cg2-head{position:sticky;top:0;z-index:2;display:flex;flex-direction:column;gap:6px;padding:16px 20px 12px;background:#fff;border-bottom:1px solid #eef2f7}',
    '.cg2-headrow{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.cg2-title{font-size:17px;font-weight:650;margin:0;display:flex;align-items:center;gap:9px}',
    '.cg2-title .dot{width:9px;height:9px;border-radius:50%;background:#15803d;flex:none}',
    '.cg2-sub{display:flex;align-items:center;gap:8px;min-width:0;font-size:11.5px;color:#94a3b8;line-height:1.4}',
    // Trailing reminder on the status line; pushed right and visually quiet.
    '.cg2-subhint{margin-left:auto;align-self:center;padding-left:10px;border-left:1px solid #e2e8f0;color:#94a3b8;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:none}',
    '.cg2-subsess{flex:0 1 auto;max-width:100%;user-select:all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:1px 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cg2-close{width:30px;height:30px;border-radius:8px;border:1px solid transparent;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer;flex:none}',
    '.cg2-close:hover{background:#f1f5f9;color:#172033}',
    '.cg2-body{padding:14px 20px 20px}',
    '.cg2-enable{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fbfdfe;margin-bottom:10px}',
    '.cg2-enable strong{font-size:14px;font-weight:600}',
    '.cg2-enable small{display:block;color:#94a3b8;font-size:11.5px;margin-top:2px}',
    '.cg2-switch{position:relative;width:42px;height:24px;border-radius:999px;border:1px solid #cbd5e1;background:#cbd5e1;cursor:pointer;flex:none;padding:0;transition:background .18s,border-color .18s}',
    '.cg2-switch .knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .18s}',
    '.cg2-switch[aria-checked="true"]{background:#15803d;border-color:#15803d}',
    '.cg2-switch[aria-checked="true"] .knob{transform:translateX(18px)}',
    '.cg2-switch:disabled{opacity:.5;cursor:not-allowed}',
    '.cg2-switch:focus-visible{outline:2px solid #15803d;outline-offset:2px}',
    '.cg2-status{display:flex;align-items:flex-start;gap:8px;min-height:20px;font-size:12px;color:#64748b;white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0 4px}',
    '.cg2-status .sdot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none;background:#94a3b8}',
    '.cg2-status.s-running .sdot{background:#2563eb}',
    '.cg2-status.s-ok .sdot{background:#15803d}',
    '.cg2-status.s-warn .sdot{background:#d97706}',
    '.cg2-status.s-error .sdot{background:#dc2626}',
    '.cg2-errors{white-space:pre-wrap;overflow-wrap:anywhere;color:#dc2626;font-size:12.5px;margin:6px 0 4px}',
    '.cg2-sec{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 10px}',
    '.cg2-sec h3{font-size:13px;font-weight:650;margin:0;color:#334155;letter-spacing:.02em;text-transform:uppercase}',
    '.cg2-empty{color:#94a3b8;font-size:12.5px;padding:14px;border:1px dashed #dbe2ea;border-radius:10px;text-align:center}',
    '.cg2-list{display:grid;gap:8px}',
    '.cg2-cand{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#fbfdfe}',
    '.cg2-badge{width:24px;height:24px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0}',
    '.cg2-meta{min-width:0;flex:1}',
    '.cg2-provider{font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cg2-model{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cg2-tools{display:flex;align-items:center;gap:4px;flex:none}',
    '.cg2-win{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#64748b}',
    // Compact window chip instead of an always-on 108px text box per row.
    '.cg2-wchip{display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 9px;border:1px solid #dbe2ea;border-radius:999px;background:#f1f5f9;color:#475569;font:600 11.5px/1 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;white-space:nowrap;max-width:150px}',
    '.cg2-wchip:hover{border-color:#94a3b8;background:#e8eef5}',
    '.cg2-wchip.custom{background:#dcfce7;border-color:#86efac;color:#15803d}',
    '.cg2-wchip.unknown{background:transparent;border-style:dashed;color:#94a3b8}',
    '.cg2-wchip .wt{overflow:hidden;text-overflow:ellipsis}',
    '.cg2-win input{width:84px;height:26px;padding:0 7px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172033;font:12px/1 ui-monospace,Menlo,Consolas,monospace}',
    '.cg2-win input[aria-invalid="true"]{border-color:#dc2626;background:#fef2f2}',
    '.cg2-wedit{height:26px;width:26px;padding:0;font-size:12px;border-radius:7px}',
    '.cg2-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;cursor:pointer;font:600 12px/1 system-ui,sans-serif;white-space:nowrap}',
    '.cg2-btn:hover:not(:disabled){background:#f8fafc;border-color:#94a3b8}',
    '.cg2-btn:disabled{opacity:.45;cursor:not-allowed}',
    '.cg2-btn:focus-visible,.cg2-win input:focus-visible,.cg2-search:focus-visible{outline:2px solid #15803d;outline-offset:1px}',
    '.cg2-icon{width:28px;height:28px;padding:0;font-size:14px}',
    '.cg2-danger:hover:not(:disabled){color:#dc2626;border-color:#fca5a5;background:#fef2f2}',
    '.cg2-reload{padding:6px 10px}',
    '.cg2-search{width:100%;margin:0 0 10px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#172033;font:inherit}',
    '.cg2-results{display:grid;gap:4px;max-height:240px;overflow:auto;border:1px solid #eef2f7;border-radius:12px;padding:4px;background:#fbfdfe}',
    '.cg2-groups{margin-top:10px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fbfdfe}',
    '.cg2-grouprow{display:flex;gap:6px;align-items:center}',
    '.cg2-saverow{margin-top:8px;display:none}',
    '.cg2-gselect{flex:1;min-width:0;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172033;font:600 12.5px/1.2 system-ui,sans-serif}',
    '.cg2-gbtn{padding:7px 10px;font-size:12px;flex:none}',
    '.cg2-groups .cg2-search{margin:0;flex:1;min-width:0;padding:7px 10px}',
    ':host([data-theme="dark"]) .cg2-groups{background:#1f2b3e;border-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-gselect{background:#152033;border-color:#334155;color:#e2e8f0}',
    '.cg2-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:8px;min-width:0}',
    '.cg2-row:hover{background:#f1f5f9}',
    '.cg2-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;min-width:0}',
    '.cg2-row .rk{color:#94a3b8;margin-right:4px}',
    '.cg2-add{padding:5px 12px;border-radius:7px;border:1px solid #15803d;background:#fff;color:#15803d;font:600 12px/1 system-ui,sans-serif;cursor:pointer;flex:none}',
    '.cg2-add:hover:not(:disabled){background:#15803d;color:#fff}',
    '.cg2-add:disabled{border-color:#cbd5e1;color:#94a3b8;background:#f8fafc;cursor:default}',
    '.cg2-note{color:#94a3b8;font-size:12px;padding:8px 2px}',
    ':host([data-theme="dark"]) .cg2-panel,:host([data-theme="dark"]) .cg2-head{background:#1b2536;border-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-overlay{background:rgba(2,6,23,.65)}',
    ':host([data-theme="dark"]){color:#e2e8f0}',
    ':host([data-theme="dark"]) .cg2-head{border-bottom-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-title{color:#f1f5f9}',
    ':host([data-theme="dark"]) .cg2-close{color:#94a3b8}',
    ':host([data-theme="dark"]) .cg2-close:hover{background:#2c3a4f;color:#f1f5f9}',
    ':host([data-theme="dark"]) .cg2-sub{color:#64748b}',
    ':host([data-theme="dark"]) .cg2-subhint{color:#64748b;border-left-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-subsess{background:#152033;border-color:#2c3a4f;color:#cbd5e1}',
    ':host([data-theme="dark"]) .cg2-enable,:host([data-theme="dark"]) .cg2-cand{background:#1f2b3e;border-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-provider,:host([data-theme="dark"]) .cg2-note{color:#64748b}',
    ':host([data-theme="dark"]) .cg2-model{color:#e2e8f0}',
    ':host([data-theme="dark"]) .cg2-win{color:#94a3b8}',
    ':host([data-theme="dark"]) .cg2-wchip{background:#22304a;border-color:#334155;color:#cbd5e1}',
    ':host([data-theme="dark"]) .cg2-wchip:hover{background:#2c3a4f;border-color:#475569}',
    ':host([data-theme="dark"]) .cg2-wchip.custom{background:#10351f;border-color:#15803d;color:#86efac}',
    ':host([data-theme="dark"]) .cg2-wchip.unknown{background:transparent;color:#64748b}',
    ':host([data-theme="dark"]) .cg2-win input,:host([data-theme="dark"]) .cg2-search{background:#152033;border-color:#334155;color:#e2e8f0}',
    ':host([data-theme="dark"]) .cg2-btn{background:#22304a;color:#cbd5e1;border-color:#334155}',
    ':host([data-theme="dark"]) .cg2-btn:hover:not(:disabled){background:#2c3a4f;border-color:#475569}',
    ':host([data-theme="dark"]) .cg2-results{background:#152033;border-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-row:hover{background:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-empty{border-color:#334155;color:#64748b}',
    ':host([data-theme="dark"]) .cg2-status{color:#94a3b8}'
  ].join('\n')
  root.appendChild(style)

  function el(tag, text, css) {
    var node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (css) node.style.cssText = css
    return node
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild) }
  // Re-rendering the long catalog/list rebuilds its DOM, which makes the
  // scrollable ancestors snap back to the top. Snapshot and restore scrollTop
  // around those rebuilds so adding a model deep in the list keeps position.
  function scrollOf(node) { try { return node && typeof node.scrollTop === 'number' ? node.scrollTop : 0 } catch (_) { return 0 } }
  function preservingScroll(nodes, fn) {
    var tops = nodes.map(scrollOf)
    try { fn() } finally {
      nodes.forEach(function (node, i) { try { if (node) node.scrollTop = tops[i] } catch (_) {} })
    }
  }
  function mutate(fn) { preservingScroll([panel, results], fn) }
  function button(text, action, cls) {
    var node = el('button', text)
    node.type = 'button'
    node.className = 'cg2-btn' + (cls ? ' ' + cls : '')
    node.addEventListener('click', action)
    return node
  }
  function message(error) { return error && error.message ? String(error.message) : String(error || T('auto.unknownError')) }
  function fill(template, vars) {
    return String(template == null ? '' : template).replace(/\{(\w+)\}/g, function (_, name) {
      return vars && vars[name] != null ? String(vars[name]) : ''
    })
  }
  function clone(cfg) {
    return {
      enabled: !!(cfg && cfg.enabled),
      candidates: cfg && Array.isArray(cfg.candidates) ? cfg.candidates.map(function (c) {
        var out = { provider: String(c.provider || ''), model: String(c.model || '') }
        if (Number.isSafeInteger(c.window) && c.window > 0) out.window = c.window
        return out
      }).filter(function (c) { return c.provider && c.model }) : []
    }
  }
  function knownWindow(sel) {
    try {
      if (typeof options.resolveKnownWindow === 'function') {
        var resolved = options.resolveKnownWindow(sel)
        if (Number.isSafeInteger(resolved) && resolved > 0) return resolved
      }
      var n = resolveWindow(sel, DEFAULTS)
      return Number.isSafeInteger(n) && n > 0 ? n : null
    } catch (_) { return null }
  }
  function key(c) { return JSON.stringify([c.provider, c.model]) }
  function fmtShort(n) {
    // 1048576 must read as "1M", not "1049K": round to one decimal and drop a
    // trailing zero so megabyte windows stay recognizable.
    if (n >= 1000000) {
      var millions = Math.round(n / 100000) / 10
      return (millions % 1 === 0 ? String(millions) : millions.toFixed(1)) + 'M'
    }
    // Round DOWN for kilotokens: a 32768-token window must read "32K", never
    // "33K", or the ceiling understates how soon the context will overflow.
    if (n >= 1000) return String(Math.floor(n / 1000)) + 'K'
    return String(n)
  }

  var launcher = button(T('auto.title'), function () { if (opened) close(); else open() })
  launcher.className = ''
  launcher.style.cssText = 'height:30px;max-width:230px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#475569);font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto;transition:background .15s,color .15s,border-color .15s;'
  var launcherHost = document.createElement('span')
  launcherHost.style.cssText = 'display:inline-flex;align-items:center;flex:none;pointer-events:auto;'
  var launcherRoot = typeof launcherHost.attachShadow === 'function' ? launcherHost.attachShadow({ mode: 'open' }) : launcherHost
  launcherRoot.appendChild(launcher)
  // The DSH context ring takes its ceiling from the session's newest real
  // `request/context` record, so after a model switch it keeps showing the
  // PREVIOUS model's window until the next message is sent — which looks like
  // the switch did not stick. While the ring and the selected model disagree,
  // show the limit that actually applies now; it hides itself as soon as the
  // ring catches up.
  var meterChip = el('span')
  meterChip.style.cssText = 'display:none;align-items:center;gap:5px;height:22px;margin-left:6px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#fbbf24);background:var(--dsw-alias-bg-base,#fffbeb);color:var(--dsw-alias-label-secondary,#b45309);font:600 11px/1 system-ui,sans-serif;white-space:nowrap;cursor:default;pointer-events:auto;font-variant-numeric:tabular-nums;'
  meterChip.setAttribute('role', 'status')
  var meterDot = el('span')
  meterDot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#f59e0b;flex:none;'
  var meterText = el('span')
  meterChip.appendChild(meterDot)
  meterChip.appendChild(meterText)
  launcherRoot.appendChild(meterChip)
  // Use the native composer's file input as an anchor, next to its + control.
  // Keep the dialog in the body so composer overflow cannot clip it.
  function mountLauncher() {
    if (disposed) return
    var sessionRoot = document.querySelector && document.querySelector('[data-conversation-session]')
    var fileInput = sessionRoot && typeof sessionRoot.querySelector === 'function' && sessionRoot.querySelector('input[type="file"]')
    var tools = fileInput && fileInput.parentElement
    if (tools && launcherHost.parentNode !== tools) tools.appendChild(launcherHost)
    else if (!tools && launcherHost.parentNode) launcherHost.remove()
  }
  mountLauncher()

  var overlay = el('div'); overlay.className = 'cg2-overlay'
  var panel = el('section'); panel.className = 'cg2-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', T('auto.settings'))
  panel.tabIndex = -1

  var header = el('div'); header.className = 'cg2-head'
  var titleRow = el('div'); titleRow.className = 'cg2-headrow'
  var titleWrap = el('div'); titleWrap.className = 'cg2-title'
  var titleDot = el('span'); titleDot.className = 'dot'
  var title = el('h2', T('auto.settings'))
  title.style.cssText = 'font-size:17px;font-weight:650;margin:0;'
  titleWrap.appendChild(titleDot); titleWrap.appendChild(title)
  var closeButton = el('button', '×'); closeButton.type = 'button'; closeButton.className = 'cg2-close'
  closeButton.setAttribute('aria-label', T('auto.close'))
  closeButton.addEventListener('click', close)
  titleRow.appendChild(titleWrap); titleRow.appendChild(closeButton)
  // Only the session id stays in the header; the one-line hint is shown beside
  // the status text in the body instead.
  var subtitle = el('div'); subtitle.className = 'cg2-sub'
  var sessionTag = el('code', ''); sessionTag.className = 'cg2-subsess'
  subtitle.appendChild(sessionTag)
  header.appendChild(titleRow); header.appendChild(subtitle)
  panel.appendChild(header)

  var body = el('div'); body.className = 'cg2-body'

  var enableRow = el('div'); enableRow.className = 'cg2-enable'
  var enableTextWrap = el('div')
  var enableStrong = el('strong', T('auto.enable'))
  var enableSub = el('small', T('auto.perSessionHint'))
  enableTextWrap.appendChild(enableStrong); enableTextWrap.appendChild(enableSub)
  var enabled = el('button'); enabled.type = 'button'; enabled.className = 'cg2-switch'
  enabled.setAttribute('role', 'switch')
  enabled.setAttribute('aria-checked', 'false')
  enabled.setAttribute('aria-label', T('auto.enable'))
  var knob = el('span'); knob.className = 'knob'
  enabled.appendChild(knob)
  enabled.addEventListener('click', function () {
    if (!sessionId || enabled.disabled) return
    draft.enabled = !draft.enabled
    enabled.setAttribute('aria-checked', draft.enabled ? 'true' : 'false')
    persist()
  })
  enableRow.appendChild(enableTextWrap); enableRow.appendChild(enabled)

  var status = el('div'); status.className = 'cg2-status'
  var statusDot = el('span'); statusDot.className = 'sdot'
  var statusText = el('span')
  // The one-line "per-session only / order = priority" reminder sits at the end
  // of the status line, right after e.g. "自动备用模型已启用".
  var subHint = el('span', T('auto.introShort')); subHint.className = 'cg2-subhint'
  status.appendChild(statusDot); status.appendChild(statusText); status.appendChild(subHint)
  var errors = el('div', ''); errors.className = 'cg2-errors'
  errors.setAttribute('role', 'alert')

  var candHead = el('div'); candHead.className = 'cg2-sec'
  var candidatesTitle = el('h3', T('auto.candidates'))
  candHead.appendChild(candidatesTitle)
  var candidates = el('div'); candidates.className = 'cg2-list'

  // Reusable ordered candidate lists ("groups"), shared across every session in
  // this browser/profile. Groups are a convenience: applying one writes the
  // ordered routes to the current session config; deletions in DSH's own model
  // list do not edit groups, but the failover engine skips routes that no longer
  // resolve at switch time.
  var GROUPS_KEY = 'dsh.contextGuard.groups.v1'
  var groups = []
  var groupWrap = el('div'); groupWrap.className = 'cg2-groups'
  var groupSelect = el('select'); groupSelect.className = 'cg2-gselect'
  groupSelect.setAttribute('aria-label', T('auto.groups'))
  groupSelect.addEventListener('change', function () { updateGroupButtons() })
  var groupApply = button(T('auto.groupApply'), applySelectedGroup, 'cg2-gbtn')
  groupApply.type = 'button'; groupApply.disabled = true
  var groupDelete = button(T('auto.groupDelete'), deleteSelectedGroup, 'cg2-gbtn cg2-danger')
  groupDelete.type = 'button'; groupDelete.disabled = true
  var groupNew = button('＋ ' + T('auto.groupSaveShort'), toggleGroupSave, 'cg2-gbtn')
  groupNew.type = 'button'
  // Renaming only touches the group's label; its candidate order is untouched.
  var groupRename = button('✎', beginRename, 'cg2-gbtn')
  groupRename.type = 'button'; groupRename.disabled = true
  groupRename.title = T('auto.groupRename'); groupRename.setAttribute('aria-label', T('auto.groupRename'))
  var groupRow = el('div'); groupRow.className = 'cg2-grouprow'
  groupRow.appendChild(groupSelect); groupRow.appendChild(groupNew)
  groupRow.appendChild(groupApply); groupRow.appendChild(groupRename); groupRow.appendChild(groupDelete)
  // The name input only appears after clicking "Save as", so the section stays a
  // single row until the user actually wants to store something.
  var groupSaveRow = el('div'); groupSaveRow.className = 'cg2-grouprow cg2-saverow'
  var groupName = el('input'); groupName.className = 'cg2-search'
  groupName.type = 'text'
  groupName.placeholder = T('auto.groupName')
  groupName.setAttribute('aria-label', T('auto.groupName'))
  var groupSave = button(T('auto.groupSave'), saveCurrentAsGroup, 'cg2-gbtn')
  groupSave.type = 'button'; groupSave.disabled = true
  var groupCancel = button(T('auto.groupCancel'), function () { setGroupSaving(false) }, 'cg2-gbtn')
  groupCancel.type = 'button'
  groupName.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); saveCurrentAsGroup() }
    else if (event.key === 'Escape') { event.preventDefault(); setGroupSaving(false) }
  })
  groupSaveRow.appendChild(groupName); groupSaveRow.appendChild(groupSave); groupSaveRow.appendChild(groupCancel)
  var groupSaving = false
  // Empty while saving a NEW group; the selected group's id while renaming.
  var renameTargetId = ''
  function setGroupSaving(on) {
    groupSaving = !!on
    groupSaveRow.style.display = groupSaving ? 'flex' : 'none'
    groupSave.textContent = groupSaving && renameTargetId ? T('auto.groupRename') : T('auto.groupSave')
    if (groupSaving) {
      Promise.resolve().then(function () { try { groupName.focus(); groupName.select() } catch (_) {} })
    } else {
      renameTargetId = ''
      groupName.value = ''
    }
  }
  function toggleGroupSave() {
    // While renaming, this switches back to "save current list as a new group".
    if (groupSaving && !renameTargetId) { setGroupSaving(false); return }
    renameTargetId = ''
    groupName.value = ''
    setGroupSaving(true)
  }
  function beginRename() {
    var g = groups.find(function (x) { return x.id === selectedGroupId() })
    if (!g) return
    renameTargetId = g.id
    groupName.value = g.name
    setGroupSaving(true)
  }
  setGroupSaving(false)
  groupWrap.appendChild(groupRow); groupWrap.appendChild(groupSaveRow)

  var catalogHeader = el('div'); catalogHeader.className = 'cg2-sec'
  var addTitle = el('h3', T('auto.addModels'))
  var reloadButton = button(T('auto.reload'), function () { loadCatalog(true) }, 'cg2-reload')
  catalogHeader.appendChild(addTitle); catalogHeader.appendChild(reloadButton)
  var search = el('input'); search.className = 'cg2-search'
  search.type = 'search'
  search.placeholder = T('auto.search')
  search.setAttribute('aria-label', T('auto.search'))
  var results = el('div'); results.className = 'cg2-results'

  body.appendChild(enableRow)
  body.appendChild(status); body.appendChild(errors)
  body.appendChild(candHead); body.appendChild(candidates)
  body.appendChild(groupWrap)
  body.appendChild(catalogHeader); body.appendChild(search); body.appendChild(results)
  panel.appendChild(body)
  overlay.appendChild(panel)
  root.appendChild(overlay)
  document.body.appendChild(host)

  var statusKind = ''
  function setStatusKind(kind) {
    statusKind = kind || ''
    status.className = 'cg2-status' + (statusKind ? ' s-' + statusKind : '')
  }
  // The toolbar button names the saved group whose ordered candidates exactly
  // match this session's current list, so you can see which group is in effect
  // without opening the panel.
  function matchGroup() {
    if (!draft || !draft.candidates || !draft.candidates.length) return null
    var wanted = draft.candidates.map(key).join('|')
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].candidates.map(key).join('|') === wanted) return groups[i]
    }
    return null
  }
  function updateLauncher() {
    var active = false
    try { active = !!(sessionId && options.getConfig(sessionId).enabled) } catch (_) {}
    launcher.style.background = active ? '#15803d' : 'var(--dsw-alias-bg-base,#fff)'
    launcher.style.color = active ? '#ffffff' : 'var(--dsw-alias-label-secondary,#475569)'
    launcher.style.borderColor = active ? '#15803d' : 'var(--dsw-alias-border-l2,#cbd5e1)'
    launcher.title = active ? T('auto.enabledTip') : T('auto.disabledTip')
    var label = T('auto.title')
    var group = null
    try { group = matchGroup() } catch (_) { group = null }
    if (group) {
      label = fill(T('auto.titleWithGroup'), { name: group.name })
      launcher.title = label + ' — ' + launcher.title
    }
    launcher.textContent = label
    titleDot.style.background = active ? '#15803d' : '#94a3b8'
  }
  // Render the "limit that applies now" chip from getMeterNotice(). The host
  // returns null when there is nothing to say: the ring already agrees AND no
  // model switch just happened. `info.stale` distinguishes "the ring still shows
  // the previous ceiling" from "this is the ceiling after a switch", so the chip
  // can look like a warning in the first case and like a confirmation in the
  // second.
  function updateMeter() {
    if (disposed) return
    var info = null
    try { info = typeof options.getMeterNotice === 'function' ? options.getMeterNotice() : null } catch (_) { info = null }
    if (!info || !(typeof info.window === 'number' && info.window > 0)) {
      meterChip.style.display = 'none'
      meterChip.removeAttribute('data-state')
      meterChip.title = ''
      return
    }
    var percent = typeof info.percent === 'number' && isFinite(info.percent) ? info.percent : null
    var over = percent != null && percent >= 100
    var stale = info.stale !== false
    meterChip.setAttribute('data-state', over ? 'over' : stale ? 'stale' : 'applied')
    // The launcher lives in DSH's own toolbar, so pick colors per theme instead
    // of trusting one paletted CSS variable: amber while the ring is stale, red
    // once the new ceiling is already exceeded, neutral for a confirmation.
    var dark = false
    try { if (typeof detectTheme === 'function') dark = detectTheme() === 'dark' } catch (_) {}
    if (over) {
      meterChip.style.borderColor = dark ? '#f87171' : '#fca5a5'
      meterChip.style.color = dark ? '#fca5a5' : '#b91c1c'
      meterChip.style.background = dark ? 'rgba(248,113,113,.14)' : '#fef2f2'
      meterDot.style.background = dark ? '#f87171' : '#dc2626'
    } else if (stale) {
      meterChip.style.borderColor = dark ? '#fbbf24' : '#fcd34d'
      meterChip.style.color = dark ? '#fcd34d' : '#b45309'
      meterChip.style.background = dark ? 'rgba(251,191,36,.12)' : '#fffbeb'
      meterDot.style.background = dark ? '#fbbf24' : '#f59e0b'
    } else {
      meterChip.style.borderColor = dark ? '#475569' : '#cbd5e1'
      meterChip.style.color = dark ? '#cbd5e1' : '#475569'
      meterChip.style.background = dark ? 'rgba(148,163,184,.12)' : '#f8fafc'
      meterDot.style.background = dark ? '#94a3b8' : '#64748b'
    }
    meterText.textContent = percent == null
      ? fill(T('auto.limitChip'), { window: fmtShort(info.window) })
      : fill(T(over ? 'auto.limitChipOver' : 'auto.limitChipStale'), {
        percent: String(percent),
        window: fmtShort(info.window)
      })
    meterChip.title = fill(T(stale ? 'auto.limitChipTip' : 'auto.limitChipAppliedTip'), {
      ring: info.ringWindow ? fmtShort(info.ringWindow) : '?',
      model: info.route || '',
      window: fmtShort(info.window),
      percent: percent == null ? '?' : String(percent)
    })
    meterChip.style.display = 'inline-flex'
  }
  function showStatus() {
    if (disposed) return
    updateLauncher()
    errors.textContent = errorText
    try {
      var value = sessionId ? options.getStatus(sessionId) : null
      var text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
      statusText.textContent = text
      var phase = (sessionId && options.getStatusPhase) ? options.getStatusPhase(sessionId) : ''
      var kind = ''
      if (phase === 'error') kind = 'error'
      else if (phase === 'stopped' || phase === 'cancelled') kind = 'warn'
      else if (phase === 'continued' || phase === 'idle') kind = draft.enabled ? 'ok' : ''
      else if (phase === 'waiting' || phase === 'compacting' || phase === 'switching' || phase === 'continuing') kind = 'running'
      setStatusKind(kind)
      if (sessionId && pendingSaves.get(sessionId)) statusText.textContent += (text ? '\n' : '') + T('auto.saving')
    } catch (error) { statusText.textContent = T('auto.statusFailed') + message(error); setStatusKind('error') }
  }
  function persist() {
    if (disposed || !sessionId) return
    var id = sessionId
    var cfg = clone(draft)
    var token = ++saveEpoch
    errorText = ''
    pendingSaves.set(id, (pendingSaves.get(id) || 0) + 1)
    // Serialize edits per Session so a slower old save cannot overwrite a newer edit.
    var previous = saveQueues.get(id) || Promise.resolve()
    var operation = previous.catch(function () {}).then(function () {
      return options.saveConfig(id, cfg)
    }).then(function (result) {
      if (result && result.ok === false) throw new Error(message(result.error))
    }).catch(function (error) {
      if (!disposed && sessionId === id && token === saveEpoch) errorText = T('auto.saveFailed') + message(error)
    }).then(function () {
      pendingSaves.set(id, Math.max(0, (pendingSaves.get(id) || 1) - 1))
      if (saveQueues.get(id) === operation) saveQueues.delete(id)
      if (!disposed && sessionId === id) showStatus()
    })
    saveQueues.set(id, operation)
    // Editing candidates can start/stop matching a saved group; relabel the button.
    try { updateLauncher() } catch (_) {}
    showStatus()
  }

  // ---- reusable candidate groups (browser-global, not per session) ----
  function groupStore() {
    try {
      if (options.groupStorage) return options.groupStorage
      return typeof localStorage !== 'undefined' ? localStorage : null
    } catch (_) { return null }
  }
  function normalizeGroup(entry) {
    if (!entry || typeof entry !== 'object') return null
    var name = String(entry.name || '').trim().slice(0, 80)
    if (!name || !Array.isArray(entry.candidates)) return null
    var seen = new Set(), list = []
    entry.candidates.forEach(function (c) {
      if (!c || typeof c.provider !== 'string' || typeof c.model !== 'string') return
      var item = { provider: c.provider, model: c.model }
      var k = key(item)
      if (!k || seen.has(k)) return
      seen.add(k)
      if (Number.isSafeInteger(c.window) && c.window > 0) item.window = c.window
      if (list.length < 32) list.push(item)
    })
    if (!list.length) return null
    return { id: String(entry.id || '').slice(0, 64) || ('g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), name: name, candidates: list }
  }
  function loadGroups() {
    var store = groupStore()
    if (!store) { groups = []; renderGroups(); return }
    try {
      var parsed = JSON.parse(store.getItem(GROUPS_KEY) || '[]')
      groups = (Array.isArray(parsed) ? parsed : []).map(normalizeGroup).filter(Boolean).slice(0, 50)
    } catch (_) { groups = [] }
    renderGroups()
  }
  function writeGroups() {
    var store = groupStore()
    if (!store) throw new Error(T('auto.groupStorageUnavailable'))
    store.setItem(GROUPS_KEY, JSON.stringify(groups))
  }
  function selectedGroupId() { return groupSelect.value || '' }
  // The Apply/Delete buttons follow the current <select> value. Picking another
  // entry only fires `change`, not a re-render, so they need their own listener
  // or they stay stuck disabled after a delete.
  function updateGroupButtons() {
    var exists = groups.some(function (g) { return g.id === selectedGroupId() })
    groupApply.disabled = !exists
    groupDelete.disabled = !exists
    groupRename.disabled = !exists
    return exists
  }
  function renderGroups() {
    var chosen = selectedGroupId()
    clear(groupSelect)
    var placeholder = el('option', T('auto.groupChoose'))
    placeholder.value = ''
    placeholder.disabled = true
    groupSelect.appendChild(placeholder)
    groups.forEach(function (g) {
      var option = el('option', g.name + ' (' + g.candidates.length + ')')
      option.value = g.id
      groupSelect.appendChild(option)
    })
    // Keep the current choice; if it was just deleted, fall back to the first
    // remaining group so the row stays usable instead of going dead.
    var keep = groups.some(function (g) { return g.id === chosen }) ? chosen : (groups.length ? groups[0].id : '')
    groupSelect.value = keep
    updateGroupButtons()
    groupSave.disabled = draft.candidates.length === 0
    // Saving/applying/deleting a group can change which group is in effect, so
    // keep the toolbar label in step with the list.
    try { updateLauncher() } catch (_) {}
  }
  function renameSelectedGroup(id) {
    var g = groups.find(function (x) { return x.id === id })
    if (!g) { setGroupSaving(false); renderGroups(); return }
    var name = groupName.value.trim()
    if (!name) { errorText = T('auto.groupNameRequired'); showStatus(); return }
    if (groups.some(function (x) { return x.id !== id && x.name === name })) {
      errorText = T('auto.groupNameTaken'); showStatus(); return
    }
    // Only the label changes; the stored candidate order stays as it is.
    g.name = name
    try { writeGroups() } catch (error) { errorText = T('auto.groupSaveFailed') + message(error); showStatus() }
    setGroupSaving(false)
    renderGroups()
    groupSelect.value = id
    updateGroupButtons()
  }
  function saveCurrentAsGroup() {
    try {
      // The pen button reuses this row: in rename mode only the name changes.
      if (renameTargetId) { renameSelectedGroup(renameTargetId); return }
      if (!draft.candidates.length) return
      var name = groupName.value.trim() || T('auto.groupDefaultName')
      var existing = groups.find(function (g) { return g.name === name })
      var normalized = normalizeGroup({ id: existing ? existing.id : '', name: name, candidates: draft.candidates })
      if (!normalized) return
      if (existing) existing.candidates = normalized.candidates
      else groups.unshift(normalized)
      groups = groups.slice(0, 50)
      writeGroups()
      groupName.value = ''
      renderGroups()
      // renderGroups() rebuilt the <select>; re-select the (new or overwritten) group.
      groupSelect.value = normalized.id
      updateGroupButtons()
      setGroupSaving(false)
    } catch (error) { errorText = T('auto.groupSaveFailed') + message(error); showStatus() }
  }
  function applySelectedGroup() {
    if (!sessionId) return
    var g = groups.find(function (x) { return x.id === selectedGroupId() })
    if (!g) return
    // Deep copy so later edits never mutate the stored group; de-duplicate
    // while preserving the group's order.
    var seen = new Set(), list = []
    g.candidates.forEach(function (c) {
      var k = key(c)
      if (!k || seen.has(k)) return
      seen.add(k)
      list.push({ provider: c.provider, model: c.model, ...(c.window ? { window: c.window } : {}) })
    })
    if (!list.length) return
    draft.candidates = list
    // Applying a group changes ONLY the ordered candidates: whether failover is
    // enabled stays exactly as this session already had it.
    mutate(function () {
      persist()
      renderCandidates()
      renderCatalog(true)
    })
  }
  function deleteSelectedGroup() {
    var id = selectedGroupId()
    groups = groups.filter(function (g) { return g.id !== id })
    try { writeGroups() } catch (error) { errorText = T('auto.groupSaveFailed') + message(error); showStatus() }
    renderGroups()
  }

  // Which candidate rows are currently showing the inline window editor. Keyed
  // by route (not a per-row closure local) so it survives the re-render that
  // opening the editor triggers.
  var editingWindows = new Set()
  function renderCandidates() {
    clear(candidates)
    if (!draft.candidates.length) { editingWindows.clear(); candidates.appendChild(el('div', T('auto.noCandidates'), 'cg2-empty')); renderGroups(); return }
    draft.candidates.forEach(function (candidate, index) {
      var row = el('div'); row.className = 'cg2-cand'
      var badge = el('div', String(index + 1), 'cg2-badge')
      var meta = el('div'); meta.className = 'cg2-meta'
      meta.appendChild(el('div', candidate.provider, 'cg2-provider'))
      meta.appendChild(el('div', candidate.model, 'cg2-model'))
      var tools = el('div'); tools.className = 'cg2-tools'
      var up = button('↑', function () {
        if (!index) return
        var list = draft.candidates
        list[index] = list[index - 1]; list[index - 1] = candidate
        mutate(function () { persist(); renderCandidates() })
      }, 'cg2-icon')
      up.disabled = index === 0
      up.title = T('auto.up'); up.setAttribute('aria-label', T('auto.up'))
      var down = button('↓', function () {
        if (index >= draft.candidates.length - 1) return
        var list = draft.candidates
        list[index] = list[index + 1]; list[index + 1] = candidate
        mutate(function () { persist(); renderCandidates() })
      }, 'cg2-icon')
      down.disabled = index === draft.candidates.length - 1
      down.title = T('auto.down'); down.setAttribute('aria-label', T('auto.down'))
      // Compact window display: a pill shows the effective window; click it to
      // type an override inline. This keeps the row from crowding four controls
      // plus a 108px input into one line and stops the placeholder being clipped.
      var winWrap = el('div'); winWrap.className = 'cg2-win'
      var routeKey = key(candidate)
      function commitWindow(input) {
        var text = input.value.trim()
        var n = Number(text)
        if (text && (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n <= 0)) {
          input.setAttribute('aria-invalid', 'true')
          errorText = T('auto.windowInvalid')
          showStatus(); return false
        }
        input.removeAttribute('aria-invalid')
        if (text) candidate.window = n; else delete candidate.window
        persist()
        editingWindows.delete(routeKey)
        mutate(renderCandidates)
        return true
      }
      function buildWin() {
        clear(winWrap)
        if (editingWindows.has(routeKey)) {
          var input = el('input')
          input.type = 'text'
          input.inputMode = 'numeric'
          input.className = 'cg2-wininput'
          input.value = candidate.window ? String(candidate.window) : ''
          var knownEdit = knownWindow(candidate)
          input.placeholder = knownEdit ? String(knownEdit) : T('auto.windowTokensShort')
          input.title = knownEdit ? T('auto.windowAutoTip') : T('auto.windowTokens')
          input.setAttribute('aria-label', candidate.provider + '/' + candidate.model + ' ' + T('auto.windowTokens'))
          var ok = button('✓', function () { commitWindow(input) }, 'cg2-icon cg2-wedit')
          ok.title = T('auto.windowConfirm'); ok.setAttribute('aria-label', T('auto.windowConfirm'))
          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commitWindow(input) }
            else if (e.key === 'Escape') { editingWindows.delete(routeKey); mutate(renderCandidates) }
          })
          winWrap.appendChild(input); winWrap.appendChild(ok)
          // Focus after it is in the DOM.
          Promise.resolve().then(function () { try { input.focus(); input.select() } catch (_) {} })
          return
        }
        var known = knownWindow(candidate)
        var effective = candidate.window || known
        var chip = el('button')
        chip.type = 'button'
        chip.className = 'cg2-wchip' + (candidate.window ? ' custom' : effective ? '' : ' unknown')
        var labelText = effective
          ? fmtShort(effective) + (candidate.window ? ' ✎' : '')
          : '＋ ' + T('auto.windowSet')
        var chipLabel = el('span', labelText, 'wt')
        chip.appendChild(chipLabel)
        chip.title = candidate.window
          ? T('auto.windowCustomTip') + candidate.window
          : known ? T('auto.windowAutoTip') : T('auto.windowTokens')
        chip.setAttribute('aria-label', chip.title)
        chip.addEventListener('click', function () { editingWindows.add(routeKey); mutate(renderCandidates) })
        winWrap.appendChild(chip)
      }
      buildWin()
      var remove = button('×', function () {
        mutate(function () {
          editingWindows.delete(routeKey)
          draft.candidates.splice(index, 1)
          persist(); renderCandidates(); renderCatalog(true)
        })
      }, 'cg2-icon cg2-danger')
      remove.title = T('auto.remove'); remove.setAttribute('aria-label', T('auto.remove'))
      tools.appendChild(up); tools.appendChild(down); tools.appendChild(winWrap); tools.appendChild(remove)
      row.appendChild(badge); row.appendChild(meta); row.appendChild(tools)
      candidates.appendChild(row)
    })
  }
  function flatten(groups) {
    var out = [], seen = new Set()
    groups.forEach(function (group) {
      var p = group.provider
      var provider = typeof p === 'string' ? p : p && (p.id || p.name)
      provider = provider || group.id
      var models = group.models || group.items || []
      if (!provider || !Array.isArray(models)) return
      models.forEach(function (model) {
        var id = typeof model === 'string' ? model : model.id || model.model
        if (!id) return
        var item = { provider: String(provider), model: String(id), name: typeof model === 'string' ? model : String(model.name || id) }
        if (!seen.has(key(item))) { seen.add(key); out.push(item) }
      })
    })
    return out
  }
  function renderCatalog(preserveScroll) {
    var saved = preserveScroll ? scrollOf(results) : null
    clear(results)
    if (loading) { results.appendChild(el('div', T('auto.loading'), 'cg2-note')); return }
    var query = search.value.trim().toLowerCase()
    var matches = catalog.filter(function (c) { return (c.provider + ' ' + c.model + ' ' + c.name).toLowerCase().indexOf(query) !== -1 })
    if (!matches.length) { results.appendChild(el('div', catalogLoaded ? T('auto.noMatch') : T('auto.notLoaded'), 'cg2-note')); return }
    matches.slice(0, 100).forEach(function (item) {
      var row = el('div'); row.className = 'cg2-row'
      var label = el('span')
      label.appendChild(el('span', item.provider + ' / ', 'rk'))
      label.appendChild(document.createTextNode(item.name + (item.name !== item.model ? ' (' + item.model + ')' : '')))
      var autoWin = knownWindow(item)
      if (autoWin) {
        var winTag = el('span', ' · ' + fmtShort(autoWin), 'rk')
        winTag.title = T('auto.windowAutoTip')
        label.appendChild(winTag)
      }
      var exists = draft.candidates.some(function (c) { return key(c) === key(item) })
      var add = el('button', exists ? '✓ ' + T('auto.added') : T('auto.add'))
      add.type = 'button'; add.className = 'cg2-add'
      add.disabled = exists || !sessionId
      add.addEventListener('click', function () {
        if (!sessionId || draft.candidates.some(function (c) { return key(c) === key(item) })) return
        draft.candidates.push({ provider: item.provider, model: item.model })
        mutate(function () { persist(); renderCandidates(); renderCatalog(true) })
      })
      row.appendChild(label); row.appendChild(add); results.appendChild(row)
    })
    if (matches.length > 100) results.appendChild(el('div', T('auto.first100'), 'cg2-note'))
    if (saved !== null) results.scrollTop = saved
  }
  function loadCatalog(force) {
    if (disposed || !opened || (catalogLoaded && !force)) return
    var token = ++fetchEpoch
    loading = true
    renderCatalog()
    Promise.resolve().then(function () { return options.getCatalog() }).then(function (groups) {
      // getCatalog's API has no AbortSignal. Cancel logically on close/dispose/new request.
      if (disposed || !opened || token !== fetchEpoch) return
      if (!Array.isArray(groups)) throw new Error(T('auto.catalogBad'))
      catalog = flatten(groups)
      catalogLoaded = true
      errorText = ''
    }).catch(function (error) {
      if (!disposed && opened && token === fetchEpoch) errorText = T('auto.catalogFailed') + message(error)
    }).then(function () {
      if (disposed || !opened || token !== fetchEpoch) return
      loading = false; renderCatalog(); showStatus()
    })
  }
  function applyTheme() {
    var theme = 'light'
    try { if (typeof detectTheme === 'function') theme = detectTheme() } catch (_) {}
    host.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
  }
  // Re-render static labels when DSH's language changes.
  function localize() {
    title.textContent = T('auto.settings')
    closeButton.setAttribute('aria-label', T('auto.close'))
    subHint.textContent = T('auto.introShort')
    panel.setAttribute('aria-label', T('auto.settings'))
    enableStrong.textContent = T('auto.enable')
    enableSub.textContent = T('auto.perSessionHint')
    enabled.setAttribute('aria-label', T('auto.enable'))
    candidatesTitle.textContent = T('auto.candidates')
    groupSelect.setAttribute('aria-label', T('auto.groups'))
    groupApply.textContent = T('auto.groupApply')
    groupDelete.textContent = T('auto.groupDelete')
    groupNew.textContent = '＋ ' + T('auto.groupSaveShort')
    groupRename.title = T('auto.groupRename')
    groupRename.setAttribute('aria-label', T('auto.groupRename'))
    groupSave.textContent = renameTargetId ? T('auto.groupRename') : T('auto.groupSave')
    groupCancel.textContent = T('auto.groupCancel')
    groupName.placeholder = T('auto.groupName')
    groupName.setAttribute('aria-label', T('auto.groupName'))
    renderGroups()
    addTitle.textContent = T('auto.addModels')
    reloadButton.textContent = T('auto.reload')
    search.placeholder = T('auto.search')
    search.setAttribute('aria-label', T('auto.search'))
    updateLauncher()
    updateMeter()
    if (opened) { renderCandidates(); renderCatalog(); showStatus() }
  }
  function refresh() {
    if (disposed) return
    try {
      var next = options.getSessionId() || null
      var changed = next !== sessionId
      sessionId = next
      if (changed) { ++saveEpoch; errorText = '' }
      // Keep in-flight edits instead of reading a stale persisted configuration.
      if (!sessionId) draft = clone(null)
      else if (changed || !pendingSaves.get(sessionId)) draft = clone(options.getConfig(sessionId))
      enabled.disabled = !sessionId
      enabled.setAttribute('aria-checked', draft.enabled ? 'true' : 'false')
      updateLauncher()
      updateMeter()
      renderGroups() // Save-group availability follows the current draft.
      // Show the full session id (it is what you paste when debugging); the
      // header row has the width for a 36-char UUID.
      sessionTag.textContent = sessionId || T('auto.noSession')
      sessionTag.title = sessionId || ''
      if (opened && changed) { renderCandidates(); renderCatalog() }
      if (opened) showStatus()
    } catch (error) {
      errorText = T('auto.settingsReadFailed') + message(error)
      enabled.disabled = true
      showStatus()
    }
  }
  function open() {
    if (disposed) return
    previousFocus = document.activeElement
    applyTheme()
    opened = true; overlay.style.display = 'flex'
    refresh(); renderCandidates(); renderCatalog(); showStatus(); panel.focus(); loadCatalog(false)
  }
  function close() {
    opened = false; ++fetchEpoch; loading = false
    overlay.style.display = 'none'
    try { if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus() } catch (_) {}
  }
  search.addEventListener('input', renderCatalog)
  overlay.addEventListener('click', function (event) { if (event.target === overlay) close() })
  function keydown(event) {
    if (!opened) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key !== 'Tab') return
    var controls = Array.from(panel.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
    if (!controls.length) { event.preventDefault(); panel.focus(); return }
    var active = root.activeElement || document.activeElement
    var index = controls.indexOf(active)
    if (event.shiftKey && index <= 0) { event.preventDefault(); controls[controls.length - 1].focus() }
    else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus() }
  }
  root.addEventListener('keydown', keydown)
  refresh()
  loadGroups()
  return {
    refresh: refresh,
    mount: mountLauncher,
    localize: localize,
    updateStatus: showStatus,
    updateMeter: updateMeter,
    dispose: function () {
      if (disposed) return
      close(); disposed = true; ++fetchEpoch
      root.removeEventListener('keydown', keydown)
      host.remove()
      launcherHost.remove()
      // Saves already submitted remain scoped to their captured Session IDs.
    }
  }
}

// Insert inside the client factory. No module dependencies and no DOM access.
// Optional o.storage, o.waitMs, o.pollMs support isolated tests.
// o.t translates status keys; when omitted keys are returned verbatim.
// o.continuationText() is read at failover time so language switches apply.
function createAutoEngine(o) {
  var states = new Map(), disposed = false
  var prefix = 'dsh.contextGuard.auto.v1:'
  var continuation = '请继续上一条因模型额度或限流失败而中断的任务；从已有进度继续，不要重复已完成的操作。'
  var T = o.t || function (key) { return key }
  var storage
  try { storage = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null) } catch (_) {}
  function continuationText() { return typeof o.continuationText === 'function' ? o.continuationText() : continuation }
  function key(s) { return s && s.provider && s.model ? s.provider + '/' + s.model : '' }
  function number(n) { return typeof n === 'number' && isFinite(n) && n >= 0 }
  function normalize(c) {
    var seen = new Set()
    return { enabled: !!(c && c.enabled), candidates: (c && Array.isArray(c.candidates) ? c.candidates : []).filter(function (x) {
      var k = key(x)
      if (!k || seen.has(k)) return false
      seen.add(k); return true
    }).slice(0, 32).map(function (x) {
      var t = { provider: x.provider, model: x.model }
      if (number(x.window) && x.window > 0) t.window = x.window
      return t
    }) }
  }
  function load(id) {
    try { return normalize(JSON.parse(storage && storage.getItem(prefix + id) || 'null')) } catch (_) { return normalize(null) }
  }
  function state(id) {
    if (!states.has(id)) states.set(id, { cfg: load(id), failed: new Set(), generation: 0, flight: false, status: { phase: 'idle', message: T('st.waitQuota') } })
    return states.get(id)
  }
  function status(s, phase, message, error) {
    s.status = { phase: phase, message: message }
    if (error) s.status.error = String(error.message || error)
    if (o.onStatus) { try { o.onStatus() } catch (_) {} }
  }
  function quota(error) {
    if (error && ['QUOTA', 'ACCOUNT_QUOTA', 'RATE_LIMIT'].includes(error.code)) return true
    if (error && error.status === 429) return true
    var text = String(error && error.code || '') + ' ' + String(error && error.message || '')
    if (/unauthori[sz]ed|authentication|invalid.?api.?key|\b40[13]\b|network|fetch failed|ECONN|ENOTFOUND|timeout|abort|cancel|认证|鉴权|网络|取消/i.test(text)) return false
    return /ACCOUNT[_ -]?QUOTA|RATE[_ -]?LIMIT|\b429\b|insufficient[ _-]*(balance|quota|credit)|quota[ _-]*(exceeded|exhausted)|\bquota\b|余额不足|额度不足|配额|限流/i.test(text)
  }
  function cancel(s, message) { s.generation++; status(s, 'cancelled', message || T('st.cancelled')) }
  function snapshot(s) {
    try { return s.binding.session.getSnapshot() } catch (_) { return null }
  }
  function selection(id) { try { return o.currentSelection(id) } catch (_) { return null } }
  function windowOf(t) {
    if (number(t.window) && t.window > 0) return t.window
    try { var n = o.resolveWindow(t); return number(n) && n > 0 ? n : null } catch (_) { return null }
  }
  function safeUsage(id) { try { var n = o.usage(id); return number(n) ? n : null } catch (_) { return null } }
  function errorText(r) { return r && r.error && (r.error.message || r.error.code) || T('st.notAccepted') }
  async function run(id, s) {
    if (s.flight || !s.binding || !s.cfg.enabled || disposed) return
    s.flight = true
    var token = s.generation, expected = key(selection(id))
    // The route WE are currently trying out: between selectModel() and its
    // confirmation the projection already reads the new route, while `expected`
    // still names the failed source model. valid() must accept either.
    var attemptRoute = null
    function valid() {
      if (disposed || token !== s.generation || !s.binding || !s.cfg.enabled) return false
      var current = key(selection(id))
      if (!o.isCurrent(id) || (current !== expected && current !== attemptRoute)) { cancel(s, T('st.userChanged')); return false }
      return true
    }
    try {
      if (!expected || !valid()) return
      s.failed.add(expected)
      status(s, 'waiting', T('st.waiting'))
      var deadline = Date.now() + (o.waitMs == null ? 4000 : o.waitMs)
      while (valid()) {
        var snap = snapshot(s)
        if (snap && snap.running === false) break
        if (Date.now() >= deadline) { status(s, 'stopped', T('st.busy')); return }
        await new Promise(function (r) { setTimeout(r, o.pollMs == null ? 100 : o.pollMs) })
      }
      if (!valid()) return
      var pressure = safeUsage(id)
      if (pressure == null) { status(s, 'stopped', T('st.usageUnknownStop')); return }
      var candidates = s.cfg.candidates.slice()
      var at = candidates.findIndex(function (x) { return key(x) === expected })
      var ordered = at < 0 ? candidates : candidates.slice(at + 1).concat(candidates.slice(0, at + 1))
      try { o.begin(id) } catch (_) {}
      var candidate = null, candidateWindow = null, target = null, picked = null, confirmed = false, result = null
      var oldRoute = expected
      var succeeded = false
      var triedRoutes = []
      // One pass over the ordered routes. A route may be unusable not just for
      // the upfront checks (unknown window, already failed, compact failure),
      // but also at switch time when the model was deleted or is unavailable:
      // mark that route failed for this chain and fall through to the next
      // candidate instead of terminating the whole failover.
      outer:
      for (var i = 0; i < ordered.length; i++) {
        if (!valid()) return
        var item = ordered[i], route = key(item), win = windowOf(item)
        if (!route || s.failed.has(route) || win == null) continue
        var threshold = Math.floor(win * 0.7)
        var currentPressure = safeUsage(id)
        if (currentPressure == null) { status(s, 'stopped', T('st.usageUnknownStop')); return }
        if (currentPressure >= threshold) {
          status(s, 'compacting', T('st.compacting') + route)
          try {
            var after = await o.compact(id, threshold)
            if (!valid()) return
            if (!number(after) || after >= threshold) continue
          } catch (error) {
            // The quota-exhausted model may also be unable to compact. Try a
            // larger-window candidate rather than forcing an unsafe prompt.
            if (!valid()) return
            continue
          }
        }
        candidate = item; candidateWindow = win
        target = { provider: candidate.provider, model: candidate.model }
        triedRoutes.push(route)
        attemptRoute = route
        status(s, 'switching', T('st.switching') + key(target))

        try { picked = await o.selectModel(id, target) } catch (error) {
          if (!valid()) return
          // Model removed/unavailable on the provider: remember it for this
          // chain and try the next configured candidate.
          s.failed.add(route)
          attemptRoute = null
          status(s, 'waiting', T('st.switchSkipping') + String((error && error.message) || error))
          continue
        }
        if (!valid()) return
        var nowRoute = key(selection(id))
        if (nowRoute !== oldRoute && nowRoute !== key(target)) { cancel(s, T('st.otherModel')); return }
        if (picked && picked.ok === false) {
          s.failed.add(route)
          attemptRoute = null
          status(s, 'waiting', T('st.switchSkipping') + errorText(picked))
          continue
        }
        if (!o.isCurrent(id)) { cancel(s, T('st.leftSession')); return }
        try { confirmed = await o.assertSelection(id, target, 'auto-failover') } catch (error) { confirmed = false }
        if (!valid()) return
        if (confirmed !== true) {
          s.failed.add(route)
          attemptRoute = null
          status(s, 'waiting', T('st.switchSkipping') + T('st.notConfirmed'))
          continue
        }
        attemptRoute = null
        // Only a CONFIRMED selection becomes the new baseline for valid(): this
        // stops a failed candidate from making the next loop iteration look like
        // a manual model change by the user.
        expected = key(target)
        try { o.end(id) } catch (_) {}
        try { o.commit(id, target) } catch (_) {}
        status(s, 'continuing', T('st.continuing'))
        try {
          result = await s.binding.session.prompt([{ type: 'text', text: continuationText() }], 'queue')
        } catch (error) {
          if (!valid()) return
          status(s, 'error', T('st.continueRejected') + String(error.message || error), error); return
        }
        if (!valid()) return
        if (!result || result.ok !== true || !result.value || result.value.accepted !== true) {
          status(s, 'error', T('st.continueRejected') + errorText(result)); return
        }
        succeeded = true
        break outer
      }
      if (!succeeded) {
        try { o.end(id) } catch (_) {}
        status(s, 'stopped', triedRoutes.length ? T('st.allSwitchesFailed') : T('st.noCandidate'))
        return
      }
      if (!valid()) return
      var afterPrompt = snapshot(s)
      if (afterPrompt && afterPrompt.promptError) status(s, 'error', T('st.continueRejected') + errorText({ error: afterPrompt.promptError.error }))
      else status(s, 'continued', T('st.continued') + key(target))
    } catch (error) {
      if (token === s.generation && !disposed) status(s, 'error', T('st.autoFailed'), error)
    } finally {
      s.flight = false
      try { o.end(id) } catch (_) {}
    }
  }
  function bind(id, binding) {
    var s = state(id)
    try { if (s.stop) s.stop() } catch (_) {}
    s.binding = binding
    s.generation++
    var feed = binding && (binding.eventSource || binding.session && binding.session.eventSource)
    if (!feed || typeof feed.subscribe !== 'function' || typeof feed.getSnapshot !== 'function') {
      status(s, 'error', T('st.noSource'))
      return
    }
    // Baseline includes ALL existing entries, even if the last change was append.
    function baseline(entries) {
      ;(entries || []).forEach(function (entry) {
        var seq = entry && entry.event && entry.event.seq
        if (number(seq)) s.seen.add(String(seq))
      })
    }
    var initial = feed.getSnapshot()
    s.seen = new Set()
    try { baseline(initial && initial.entries); baseline(initial && initial.change && initial.change.entries) } catch (_) {}
    s.stop = feed.subscribe(function () {
      if (disposed || s.binding !== binding || !s.cfg.enabled) return
      var change
      try { change = feed.getSnapshot().change } catch (error) { status(s, 'error', T('st.eventFailed'), error); return }
      if (!change || change.kind !== 'append') return
      change.entries.forEach(function (entry) {
        var event = entry && entry.event
        if (!event || event.seq == null || s.seen.has(String(event.seq))) return
        s.seen.add(String(event.seq))
        if (event.type !== 'turn/end' || !event.data || !event.data.reason) return
        if (event.data.reason.kind === 'completed') {
          s.failed.clear()
          status(s, 'idle', T('st.enabled'))
          return
        }
        if (event.data.reason.kind !== 'error') return
        var failure = event.data.reason.error || {}
        if (!quota(failure)) return
        run(id, s)
      })
    })
    status(s, 'idle', s.cfg.enabled ? T('st.enabled') : T('st.disabled'))
  }
  function unbind(id) {
    var s = states.get(id)
    if (!s) return
    cancel(s, T('st.leftCancel'))
    try { if (s.stop) s.stop() } catch (_) {}
    s.stop = null; s.binding = null
  }
  return {
    bind: bind, unbind: unbind,
    getConfig: function (id) { return normalize(state(id).cfg) },
    saveConfig: function (id, cfg) {
      var s = state(id), next = normalize(cfg)
      if (!storage) throw new Error(T('st.storageUnavailable'))
      try { storage.setItem(prefix + id, JSON.stringify(next)) } catch (e) { status(s, 'error', T('st.saveFailed'), e); throw e }
      cancel(s, T('st.configChanged')); s.cfg = next
      s.failed.clear()
      status(s, 'idle', next.enabled ? T('st.enabled') : T('st.disabled'))
      return normalize(s.cfg)
    },
    getStatus: function (id) { return Object.assign({}, state(id).status) },
    dispose: function () { disposed = true; states.forEach(function (_, id) { unbind(id) }) }
  }
}

    function start(ctx) {
      var sessions = ctx.sessions
      if (!sessions || typeof sessions.binding !== 'function') return function () {}
      // remote.session drives the revert/re-apply RPCs. apply() formally
      // injects both 'sessions' and 'remote', so this scope allows reading it
      // (Cordis throws on uninjected property access). It may still be absent
      // on an unusual host, in which case the guard still warns but cannot
      // auto-revert.
      var remote = ctx.remote || null
      var stopLocale = null

      localeId = detectLocale(ctx.locale)
      try {
        if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
          stopLocale = ctx.locale.subscribe(function () {
            var next = detectLocale(ctx.locale)
            if (next === localeId) return
            localeId = next
            try { if (autoSettings && typeof autoSettings.localize === 'function') autoSettings.localize() } catch (_) {}
          })
        }
      } catch (e) { console.warn('[context-guard] locale subscription unavailable', e) }

      // Tunables are constants (DEFAULTS): reading an uninjected service such
      // as `ctx.config` would itself throw under the Cordis scope proxy.
      var config = DEFAULTS

      var stops = new Map()          // sessionId -> unsubscribe
      var committed = new Map()      // sessionId -> routeKey of last confirmed model
      var committedSel = new Map()   // sessionId -> full selection object of committed model
      var pending = new Map()        // sessionId -> { fromSel, toSel, toKey } while modal open
      var suppress = new Map()       // sessionId -> routeKey user explicitly chose to allow
      var holding = new Set()        // sessionId -> an assertSelection() loop owns the selection
      var epoch = new Map()          // monotonic decision counter; never reset on unbind
      var changedAt = new Map()      // sessionId -> Date.now() of the last observed model change
      var disposed = false
      var autoEngine = null
      var autoSettings = null

      // Programmatically re-select a model. Mirrors dsh-client-ui-model-selection,
      // which calls remote.session.selectModel with the same payload.
      function remoteNS() {
        // `remote` comes from the formally-injected scope. Access nothing else
        // off ctx (uninjected property reads throw under Cordis).
        return remote && remote.session && typeof remote.session.selectModel === 'function'
          ? remote.session
          : null
      }

      // The Models settings namespace, also read only through the injected scope.
      // `remote.settings` needs its own dotted inject() entry just like
      // `remote.session`, so access is guarded instead of assumed.
      function remoteSettingsNS() {
        return remote && remote.settings && typeof remote.settings.describe === 'function'
          ? remote.settings
          : null
      }

      function selectModel(sessionId, sel) {
        try {
          var ns = remoteNS()
          if (!ns) {
            console.warn('[context-guard] remote.session.selectModel unavailable')
            return Promise.resolve({ ok: false, unavailable: true })
          }
          var payload = { sessionId: sessionId, provider: sel.provider, model: sel.model }
          if (sel.reasoningEffort !== undefined && sel.reasoningEffort !== null) {
            payload.reasoningEffort = sel.reasoningEffort
          }
          return Promise.resolve(ns.selectModel(payload)).then(function (r) {
            // Be tolerant of differing remote envelopes.
            if (r && r.ok === false) return r
            return { ok: true, raw: r }
          }).catch(function (e) {
            console.warn('[context-guard] selectModel failed:', e)
            return { ok: false, error: e }
          })
        } catch (e) {
          console.warn('[context-guard] selectModel threw:', e)
          return Promise.resolve({ ok: false, error: e })
        }
      }

      // Read the session's CURRENT selection straight from the projection
      // (`next` is what the next request will use, falling back to lastUsed).
      function currentSelection(sessionId) {
        try {
          var b = sessions.binding(sessionId)
          var f = b && b.session && b.session.projections && b.session.projections.faceOf('modelSelection')
          var s = f ? f.getSnapshot() : null
          return (s && (s.next || s.lastUsed)) || null
        } catch (_) { return null }
      }

      // DSH's context ring divides measured pressure by `contextPressure.contextWindow`,
      // and THAT value only comes from the newest real `request/context` record. A
      // model switch writes `model/selection` immediately but not `request/context`,
      // so the ring keeps the previous model's ceiling until the next message is
      // sent. Report the disagreement so the toolbar can show the limit that
      // actually applies to the model selected now.
      //
      // The disagreement itself is invisible for a second or so when the new
      // model happens to share the ceiling, and it ends the moment any request
      // runs (including the next assistant turn). Either way a ceiling the user
      // never got to read is useless, so a fresh switch also keeps the chip up
      // for NOTICE_MS, labelled as already applied.
      var NOTICE_MS = 12000
      function meterNotice(sessionId) {
        try {
          var b = sessions.binding(sessionId)
          var pf = face(b, 'contextPressure')
          var ps = pf ? pf.getSnapshot() : null
          var ringWindow = ps && typeof ps.contextWindow === 'number' && ps.contextWindow > 0
            ? ps.contextWindow
            : null
          if (ringWindow === null) return null
          var sel = currentSelection(sessionId)
          if (!sel || !sel.provider || !sel.model) return null
          var window = resolveWindowWithSettings(sel)
          if (typeof window !== 'number' || !(window > 0)) return null
          var stale = window !== ringWindow
          if (!stale && !(Date.now() - (changedAt.get(sessionId) || 0) < NOTICE_MS)) return null
          var used = ps.projectedTokens != null ? ps.projectedTokens : ps.pressureTokens
          var percent = typeof used === 'number' && isFinite(used) && used >= 0
            ? Math.min(999, Math.round(used / window * 100))
            : null
          return {
            provider: sel.provider,
            model: sel.model,
            route: routeKey(sel),
            window: window,
            ringWindow: ringWindow,
            percent: percent,
            stale: stale
          }
        } catch (_) { return null }
      }

      // Make a selection STICK. A single fire-and-forget selectModel can lose a
      // race against the UI's own selection write (and the host may reject it
      // while the session is busy), which is exactly how a "stay on the old
      // model" click could still end up on the new model. So: re-assert, then
      // verify against the projection, retrying a few times, and report the
      // real outcome instead of assuming success.
      //
      // Each call carries an epoch: a newer decision for the same session
      // (e.g. the user clicking a button while the auto-revert is still
      // retrying) bumps the epoch and makes the older loop abandon, so two
      // assertion loops can never fight over one selection.
      function assertSelection(sessionId, targetSel, label) {
        if (!targetSel || !targetSel.provider || !targetSel.model) {
          holding.delete(sessionId)
          console.warn('[context-guard] ' + label + ': no known previous selection; nothing to restore')
          return Promise.resolve(false)
        }
        var want = routeKey(targetSel)
        var myEpoch = epoch.get(sessionId) || 0
        var attempt = 0
        // A busy session rejects with session/writer-held; that clears on its
        // own, so back off and keep trying rather than giving up instantly.
        var MAX = 6
        holding.add(sessionId)
        return new Promise(function (resolve) {
          function finish(ok) {
            if ((epoch.get(sessionId) || 0) === myEpoch) holding.delete(sessionId)
            resolve(ok)
          }
          function step() {
            if (disposed || !stops.has(sessionId) || (epoch.get(sessionId) || 0) !== myEpoch) { resolve(false); return } // superseded/unmounted
            var cur = currentSelection(sessionId)
            if (cur && routeKey(cur) === want) {
              console.info('[context-guard] ' + label + ': confirmed on ' + want +
                (attempt ? ' after ' + attempt + ' retry(ies)' : ''))
              finish(true)
              return
            }
            if (attempt >= MAX) {
              console.error('[context-guard] ' + label + ' FAILED: still on ' +
                (cur ? routeKey(cur) : '?') + ', wanted ' + want +
                ' (host rejected the selection or another writer overwrote it)')
              finish(false)
              return
            }
            attempt++
            selectModel(sessionId, targetSel).then(function (r) {
              // A missing service will never come good by retrying: stop now
              // and say once, instead of spamming six identical failures.
              if (r && r.unavailable) {
                console.error('[context-guard] ' + label + ' FAILED: remote.session.selectModel is not available on this host' +
                  ' (the model cannot be restored programmatically)')
                finish(false)
                return
              }
              if (r && r.ok === false) {
                console.warn('[context-guard] ' + label + ': selectModel rejected (' +
                  ((r.error && (r.error.code || r.error.message)) || 'unknown') + '), retrying')
              }
              // Give the host round-trip + projection frame time to land;
              // back off a little so a busy session has time to free up.
              setTimeout(step, 250 + attempt * 120)
            })
          }
          step()
        })
      }

      function applyTarget(sessionId, p) {
        // Whitelist the programmatic re-switch so evaluate() won't re-block it.
        suppress.set(sessionId, p.toKey)
        return selectModel(sessionId, p.toSel).then(function (r) {
          if (r && r.ok) { committed.set(sessionId, p.toKey); committedSel.set(sessionId, p.toSel) }
          return r
        })
      }

      function settle(sessionId, answer) {
        var p = pending.get(sessionId)
        if (!p) return
        pending.delete(sessionId)
        // A new decision supersedes any in-flight assertion (e.g. the
        // auto-revert that started when the modal opened).
        epoch.set(sessionId, (epoch.get(sessionId) || 0) + 1)
        // From here until the assertion loop finishes, this plugin owns the
        // selection: gate evaluate() so it cannot re-open the modal and fight
        // the very write we are making.
        holding.add(sessionId)
        var decision = epoch.get(sessionId)

        if (answer === 'compact') {
          // Still on the BIG (old) model: compact first, then move to the small
          // one once the context has actually shrunk.
          // Target window is known here: the modal only opens for a resolvable
          // target. Fall back to the current sample if it somehow vanished.
          var win = resolveWindow(p.toSel, config)
          if (typeof win !== 'number') win = usageOf(sessions, sessionId) || 0
          runCompactAndWait(sessions, sessionId, Math.floor(win * config.ratio)).then(function (u) {
            if (disposed || !stops.has(sessionId) || epoch.get(sessionId) !== decision) return
            console.info('[context-guard] post-compact usage ' + (u == null ? '?' : Math.round(u)) + ' -> switching to ' + p.toKey)
            applyTarget(sessionId, p).then(function () {
              assertSelection(sessionId, p.toSel, 'compact-then-switch')
            })
          })
        } else if (answer === 'switch') {
          // User accepts the risk: apply the small model, then confirm it stuck.
          applyTarget(sessionId, p).then(function () {
            assertSelection(sessionId, p.toSel, 'switch-anyway')
          })
        } else {
          // 保持原模型 / dismissed: the model MUST end up back on the old one.
          // Verify and retry rather than trusting a single fire-and-forget call.
          assertSelection(sessionId, p.fromSel, 'stay-on-old-model')
        }
      }

      function evaluate(sessionId, binding) {
        try {
          // While our modal is open, or while an assertion loop is writing the
          // selection, the projection moves because of US. Ignore those changes
          // so we never treat our own write as a user switch.
          if (pending.has(sessionId) || holding.has(sessionId)) return

          var modelFace = face(binding, 'modelSelection')
          var pressureFace = face(binding, 'contextPressure')
          var selSnap = modelFace ? modelFace.getSnapshot() : null
          var pressure = pressureFace ? pressureFace.getSnapshot() : null

          // `next` is what the next request will use; fall back to lastUsed.
          var target = (selSnap && (selSnap.next || selSnap.lastUsed)) || null
          var key = routeKey(target)
          if (!key || !target.provider || !target.model) return

          var prevKey = committed.get(sessionId)
          // First sighting: this is the session's current model — adopt, no prompt.
          if (prevKey === undefined) {
            committed.set(sessionId, key)
            committedSel.set(sessionId, { provider: target.provider, model: target.model, reasoningEffort: target.reasoningEffort })
            return
          }
          // No change from what the user last confirmed: nothing to do.
          if (prevKey === key) return
          // A real model change: remember when, so the toolbar chip can confirm
          // the new ceiling even when both models share one.
          changedAt.set(sessionId, Date.now())

          var fromSel = committedSel.get(sessionId)
          var usage = pressure && (pressure.projectedTokens != null ? pressure.projectedTokens : pressure.pressureTokens)
          if (typeof usage !== 'number' || !isFinite(usage) || usage <= 0) {
            // No pressure sample yet; wait for the contextPressure frame to judge.
            return
          }

          // Resolve the TARGET model's window. Unknown models are NOT blocked:
          // a false alarm on a 1M model is worse than a missed warning.
          var window = resolveWindow(target, config)
          if (typeof window !== 'number' || !(window > 0)) {
            committed.set(sessionId, key)
            committedSel.set(sessionId, { provider: target.provider, model: target.model, reasoningEffort: target.reasoningEffort })
            console.info('[context-guard] allow ' + prevKey + ' -> ' + key +
              ' | usage ' + Math.round(usage) + ' | window unknown -> not guarded')
            return
          }
          var threshold = Math.floor(window * config.ratio)
          var over = usage >= threshold

          // Under the threshold (or user already allowed this exact route): accept.
          if (!over || suppress.get(sessionId) === key) {
            if (suppress.get(sessionId) === key) suppress.delete(sessionId)
            committed.set(sessionId, key)
            committedSel.set(sessionId, { provider: target.provider, model: target.model, reasoningEffort: target.reasoningEffort })
            console.info('[context-guard] allow ' + prevKey + ' -> ' + key +
              ' | usage ' + Math.round(usage) + ' | warn@' + threshold)
            return
          }

          // OVER the safe threshold. Hold the pending intent and ASK FIRST;
          // kick off the revert to the old model in parallel. The modal never
          // depends on the revert RPC succeeding, so a remote hiccup can't make
          // the guard silently disappear.
          var toSel = { provider: target.provider, model: target.model, reasoningEffort: target.reasoningEffort }
          pending.set(sessionId, { fromSel: fromSel, toSel: toSel, toKey: key })
          console.info('[context-guard] BLOCKED switch ' + prevKey + ' -> ' + key +
            ' | usage ' + Math.round(usage) + ' | target window ' + window +
            ' | warn@' + threshold)

          // Revert to the old model NOW, verified, so an abandoned modal / a
          // refresh cannot leave the oversized selection live. The modal itself
          // does not wait on this: it must appear regardless of the RPC result.
          assertSelection(sessionId, fromSel, 'auto-revert')

          var detail = fmt('warn.detail', {
            usage: fmtK(Math.round(usage)),
            model: key,
            window: fmtK(window),
            ratio: Math.round(config.ratio * 100),
            threshold: fmtK(threshold),
            prev: prevKey
          })

          ask(detail).then(function (answer) {
            settle(sessionId, answer === true ? 'compact' : answer === false ? 'switch' : 'dismiss')
          })
        } catch (e) {
          console.warn('[context-guard] evaluate failed:', e)
        }
      }


      // A store subscriber MUST never throw: the host notifies UI subscribers
      // on the same dispatch, and a throw here can abort that notification
      // pass (the model label then only refreshes on a full reload). Harden
      // every callback so this plugin can never disturb the host's UI loop.
      function guard(fn) {
        return function () {
          try { return fn.apply(null, arguments) } catch (e) { console.warn('[context-guard]', e) }
        }
      }

      function face(binding, key) {
        try {
          var p = binding && binding.session && binding.session.projections
          var f = p && typeof p.faceOf === 'function' ? p.faceOf(key) : null
          return f && typeof f.subscribe === 'function' && typeof f.getSnapshot === 'function' ? f : null
        } catch (_) { return null }
      }

      function bindSession(sessionId) {
        if (stops.has(sessionId)) return
        var binding
        try { binding = sessions.binding(sessionId) } catch (_) { binding = undefined }
        if (!binding || !binding.session || !binding.session.projections) return

        var tick = guard(function () {
          evaluate(sessionId, binding)
          // Keep the toolbar's "limit that applies now" chip in step with the
          // projections: it appears on the switch and clears once the ring's own
          // `request/context` window catches up.
          if (autoSettings) autoSettings.updateMeter()
        })
        var unsubs = []
        var mf = face(binding, 'modelSelection')
        var pf = face(binding, 'contextPressure')
        if (mf) { try { unsubs.push(mf.subscribe(tick)) } catch (e) { console.warn('[context-guard] modelSelection subscribe failed', e) } }
        if (pf) { try { unsubs.push(pf.subscribe(tick)) } catch (e) { console.warn('[context-guard] contextPressure subscribe failed', e) } }
        if (unsubs.length === 0) return
        stops.set(sessionId, function () { for (var i = 0; i < unsubs.length; i++) { try { unsubs[i]() } catch (_) {} } })
        tick()
        if (autoEngine) autoEngine.bind(sessionId, binding)
      }

      function unbindSession(sessionId) {
        if (autoEngine) autoEngine.unbind(sessionId)
        if (pending.has(sessionId)) closeModal()
        var stop = stops.get(sessionId)
        if (stop) { try { stop() } catch (_) {} stops.delete(sessionId) }
        committed.delete(sessionId)
        committedSel.delete(sessionId)
        pending.delete(sessionId)
        suppress.delete(sessionId)
        holding.delete(sessionId)
        changedAt.delete(sessionId)
        epoch.set(sessionId, (epoch.get(sessionId) || 0) + 1)
      }

      // Bind ONLY the conversation currently mounted in the DOM. The old
      // implementation subscribed every historical Session in sessions.list,
      // which made startup cost grow with the user's archive. Conversation UI
      // marks the active root with data-conversation-session="<id>"; observing
      // that root gives us precise enter/leave lifecycle without loading all
      // historical projection faces.
      function activeDomSessionId() {
        try {
          if (!document || typeof document.querySelector !== 'function') return null
          var node = document.querySelector('[data-conversation-session]')
          return node ? node.getAttribute('data-conversation-session') : null
        } catch (_) { return null }
      }

      var settingsSessionId
      var reconcileCurrent = guard(function () {
        if (disposed) return
        var current = activeDomSessionId()
        if (autoSettings) autoSettings.mount()
        if (autoSettings && settingsSessionId !== current) { settingsSessionId = current; autoSettings.refresh() }
        var bound = Array.from(stops.keys())
        for (var i = 0; i < bound.length; i++) if (bound[i] !== current) unbindSession(bound[i])
        if (!current) return
        var isSub = false
        try { isSub = typeof sessions.subagentAddress === 'function' && !!sessions.subagentAddress(current) } catch (_) { isSub = false }
        if (!isSub) bindSession(current)
      })

      autoEngine = createAutoEngine({
        sessions: sessions,
        onStatus: function () { if (autoSettings) autoSettings.updateStatus() },
        t: tr,
        continuationText: function () { return tr('cont.text') },
        currentSelection: currentSelection,
        selectModel: selectModel,
        assertSelection: assertSelection,
        begin: function (id) { epoch.set(id, (epoch.get(id) || 0) + 1); holding.add(id) },
        end: function (id) { holding.delete(id); if (autoSettings) autoSettings.refresh() },
        commit: function (id, target) { committed.set(id, routeKey(target)); committedSel.set(id, target) },
        compact: function (id, threshold) { return runCompactAndWait(sessions, id, threshold) },
        usage: function (id) { return usageOf(sessions, id) },
        // Configured windows from the Models settings page take precedence over
        // unknown, and are used before the built-in table so a user-configured
        // value always wins.
        resolveWindow: function (target) { return resolveWindowWithSettings(target) },
        isCurrent: function (id) { return !disposed && stops.has(id) && activeDomSessionId() === id }
      })
      // Discover models lazily when settings opens, never during host startup.
      try {
        autoSettings = createAutoSettings({
          getSessionId: activeDomSessionId,
          getConfig: autoEngine.getConfig,
          saveConfig: autoEngine.saveConfig,
          getStatus: function (id) { var s = autoEngine.getStatus(id); return s.message + (s.error ? (localeId === 'zh' ? '：' : ': ') + s.error : '') },
          getStatusPhase: function (id) { return autoEngine.getStatus(id).phase },
          t: tr,
          resolveKnownWindow: resolveWindowWithSettings,
          getMeterNotice: function () {
            var id = activeDomSessionId()
            return id ? meterNotice(id) : null
          },
          getCatalog: function () {
            // Refresh configured windows first: opening the panel is exactly
            // when the user expects the window column to show real values.
            return loadSettingsWindows(remoteSettingsNS()).then(function () {
              var ns = remoteNS()
              if (!ns || typeof ns.modelCatalog !== 'function') throw new Error(tr('auto.catalogUnavailable'))
              return ns.modelCatalog()
            }).then(function (r) {
              if (r && r.ok === false) throw new Error(r.error && r.error.message || tr('auto.catalogRejected'))
              var v = r && r.ok === true ? r.value : r
              return v && v.groups || []
            })
          }
        })
      } catch (e) { console.warn('[context-guard] ' + tr('auto.settingsInitFailed'), e) }
      // Warm the configured-window map once, in the background: automatic
      // failover must be able to size candidates even when the settings panel
      // was never opened. Failure just leaves the built-in table in charge.
      Promise.resolve().then(function () {
        return loadSettingsWindows(remoteSettingsNS())
      }).then(function () {
        // The chip needs a resolved window for the selected model, and settings
        // may land after the first paint: refresh it once they are in.
        if (autoSettings) autoSettings.updateMeter()
      }).catch(function () {})
      reconcileCurrent()
      // The client plugin can start a few frames before Conversation mounts its
      // root. Retry briefly so the first opened session is captured even when
      // no mutation reaches us during initial hydration.
      var initialTimers = [100, 300, 800].map(function (delay) {
        return setTimeout(reconcileCurrent, delay)
      })
      var domObserver
      var reconcileTimer = null
      function scheduleReconcile() {
        if (reconcileTimer !== null) return
        reconcileTimer = setTimeout(function () {
          reconcileTimer = null
          reconcileCurrent()
        }, 50)
      }
      try {
        if (typeof MutationObserver === 'function' && document && document.body) {
          domObserver = new MutationObserver(scheduleReconcile)
          domObserver.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['data-conversation-session']
          })
        }
      } catch (e) { console.warn('[context-guard] active-session observer unavailable', e) }

      return function () {
        disposed = true
        if (stopLocale) { try { stopLocale() } catch (_) {} stopLocale = null }
        if (autoEngine) autoEngine.dispose()
        if (autoSettings) autoSettings.dispose()
        for (var t of initialTimers) try { clearTimeout(t) } catch (_) {}
        try { if (reconcileTimer !== null) clearTimeout(reconcileTimer) } catch (_) {}
        try { if (domObserver) domObserver.disconnect() } catch (_) {}
        for (var s of Array.from(stops.values())) try { s() } catch (_) {}
        stops.clear(); committed.clear(); committedSel.clear(); pending.clear(); suppress.clear()
        holding.clear(); epoch.clear(); changedAt.clear()
        closeModal()
      }
    }

    function apply(ctx) {
      // Cordis authorizes services by DOT PATH, one level at a time: injecting
      // 'remote' lets us read ctx.remote but NOT ctx.remote.session — that
      // needs 'remote.session' declared explicitly (which is exactly what the
      // built-in model-selection plugin does before calling
      // ctx.remote.session.selectModel). Declaring only 'remote' made every
      // programmatic revert throw "cannot get property remote.session without
      // inject", which is why "保持原模型" never actually switched back.
      try {
        if (!ctx || typeof ctx.inject !== 'function') return
        // Cordis requires both the root namespace and the dotted child to be
        // declared when code reads ctx.remote.session.
        ctx.inject(['sessions', 'remote', 'remote.session', 'remote.settings', 'locale'], function (scope) {
          try {
            var stop = start(scope)
            if (stop) console.info('[context-guard] active: risky model switches will be held until you confirm')
            if (stop && typeof scope.effect === 'function') {
              scope.effect(function () { return stop }, 'context-guard watchers')
            }
          } catch (e) { console.warn('[context-guard] start failed', e) }
        })
      } catch (e) { console.warn('[context-guard] apply failed', e) }
    }

    exports.apply = apply
    exports.inject = ['sessions', 'remote', 'remote.session', 'remote.settings', 'locale']
    return module.exports
  }
})
