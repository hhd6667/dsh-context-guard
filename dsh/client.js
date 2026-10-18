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
      'auto.settings': { zh: '自动切换设置', en: 'Automatic failover settings' },
      'auto.close': { zh: '关闭', en: 'Close' },
      'auto.intro': { zh: '仅保存当前会话设置。编辑候选模型不会立即切换模型。候选顺序表示优先级。', en: 'Saved for the current session only. Editing candidates does not switch the model. Order is failover priority.' },
      'auto.session': { zh: '当前会话：', en: 'Current session: ' },
      'auto.noSession': { zh: '未打开会话', en: 'No session open' },
      'auto.enable': { zh: '启用本会话自动切换', en: 'Enable automatic failover for this session' },
      'auto.perSessionHint': { zh: '关闭或离开页面不会在后台继续切换', en: 'No background failover after closing or leaving this page' },
      'auto.candidates': { zh: '候选模型', en: 'Candidate models' },
      'auto.noCandidates': { zh: '尚未添加候选模型。', en: 'No candidate models yet.' },
      'auto.up': { zh: '上移', en: 'Move up' },
      'auto.down': { zh: '下移', en: 'Move down' },
      'auto.remove': { zh: '移除', en: 'Remove' },
      'auto.windowTokens': { zh: '窗口 tokens：', en: 'Window tokens: ' },
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
    function loadSettingsWindows() {
      return refreshSettingsWindows(remote && remote.settings)
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
    '.cg2-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;background:#fff;border-bottom:1px solid #eef2f7}',
    '.cg2-title{font-size:17px;font-weight:650;margin:0;display:flex;align-items:center;gap:9px}',
    '.cg2-title .dot{width:9px;height:9px;border-radius:50%;background:#15803d;flex:none}',
    '.cg2-close{width:30px;height:30px;border-radius:8px;border:1px solid transparent;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer;flex:none}',
    '.cg2-close:hover{background:#f1f5f9;color:#172033}',
    '.cg2-body{padding:16px 20px 20px}',
    '.cg2-hint{margin:0 0 12px;padding:9px 12px;border-radius:10px;background:#f8fafc;border:1px solid #eef2f7;color:#64748b;font-size:12.5px;line-height:1.6}',
    '.cg2-session{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px;color:#64748b}',
    '.cg2-session code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:2px 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
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
    '.cg2-tools{display:flex;align-items:center;gap:5px;flex:none}',
    '.cg2-win{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#64748b}',
    '.cg2-win input{width:108px;padding:5px 7px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172033;font:12px/1.2 ui-monospace,Menlo,Consolas,monospace}',
    '.cg2-win input[aria-invalid="true"]{border-color:#dc2626;background:#fef2f2}',
    '.cg2-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;cursor:pointer;font:600 12px/1 system-ui,sans-serif;white-space:nowrap}',
    '.cg2-btn:hover:not(:disabled){background:#f8fafc;border-color:#94a3b8}',
    '.cg2-btn:disabled{opacity:.45;cursor:not-allowed}',
    '.cg2-btn:focus-visible,.cg2-win input:focus-visible,.cg2-search:focus-visible{outline:2px solid #15803d;outline-offset:1px}',
    '.cg2-icon{width:28px;height:28px;padding:0;font-size:14px}',
    '.cg2-danger:hover:not(:disabled){color:#dc2626;border-color:#fca5a5;background:#fef2f2}',
    '.cg2-reload{padding:6px 10px}',
    '.cg2-search{width:100%;margin:0 0 10px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#172033;font:inherit}',
    '.cg2-results{display:grid;gap:4px;max-height:240px;overflow:auto;border:1px solid #eef2f7;border-radius:12px;padding:4px;background:#fbfdfe}',
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
    ':host([data-theme="dark"]) .cg2-hint{background:#152033;border-color:#2c3a4f;color:#94a3b8}',
    ':host([data-theme="dark"]) .cg2-session{color:#94a3b8}',
    ':host([data-theme="dark"]) .cg2-session code{background:#152033;border-color:#2c3a4f;color:#cbd5e1}',
    ':host([data-theme="dark"]) .cg2-enable,:host([data-theme="dark"]) .cg2-cand{background:#1f2b3e;border-color:#2c3a4f}',
    ':host([data-theme="dark"]) .cg2-provider,:host([data-theme="dark"]) .cg2-note{color:#64748b}',
    ':host([data-theme="dark"]) .cg2-model{color:#e2e8f0}',
    ':host([data-theme="dark"]) .cg2-win{color:#94a3b8}',
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
  function button(text, action, cls) {
    var node = el('button', text)
    node.type = 'button'
    node.className = 'cg2-btn' + (cls ? ' ' + cls : '')
    node.addEventListener('click', action)
    return node
  }
  function message(error) { return error && error.message ? String(error.message) : String(error || T('auto.unknownError')) }
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
    if (n >= 1000000 && n % 100000 === 0) return String(n / 1000000) + 'M'
    if (n >= 1000) return String(Math.round(n / 1000)) + 'K'
    return String(n)
  }

  var launcher = button(T('auto.title'), function () { if (opened) close(); else open() })
  launcher.className = ''
  launcher.style.cssText = 'height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2,#cbd5e1);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#475569);font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;cursor:pointer;pointer-events:auto;transition:background .15s,color .15s,border-color .15s;'
  var launcherHost = document.createElement('span')
  launcherHost.style.cssText = 'display:inline-flex;align-items:center;flex:none;pointer-events:auto;'
  var launcherRoot = typeof launcherHost.attachShadow === 'function' ? launcherHost.attachShadow({ mode: 'open' }) : launcherHost
  launcherRoot.appendChild(launcher)
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
  var titleWrap = el('div'); titleWrap.className = 'cg2-title'
  var titleDot = el('span'); titleDot.className = 'dot'
  var title = el('h2', T('auto.settings'))
  title.style.cssText = 'font-size:17px;font-weight:650;margin:0;'
  titleWrap.appendChild(titleDot); titleWrap.appendChild(title)
  var closeButton = el('button', '×'); closeButton.type = 'button'; closeButton.className = 'cg2-close'
  closeButton.setAttribute('aria-label', T('auto.close'))
  closeButton.addEventListener('click', close)
  header.appendChild(titleWrap); header.appendChild(closeButton)
  panel.appendChild(header)

  var body = el('div'); body.className = 'cg2-body'
  var intro = el('p', T('auto.intro'), ''); intro.className = 'cg2-hint'
  var sessionLabel = el('div'); sessionLabel.className = 'cg2-session'
  var sessionTag = el('code', ''); sessionTag.style.cssText = 'flex:1;'
  sessionLabel.appendChild(el('span', T('auto.session'))); sessionLabel.appendChild(sessionTag)

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
  status.appendChild(statusDot); status.appendChild(statusText)
  var errors = el('div', ''); errors.className = 'cg2-errors'
  errors.setAttribute('role', 'alert')

  var candHead = el('div'); candHead.className = 'cg2-sec'
  var candidatesTitle = el('h3', T('auto.candidates'))
  candHead.appendChild(candidatesTitle)
  var candidates = el('div'); candidates.className = 'cg2-list'

  var catalogHeader = el('div'); catalogHeader.className = 'cg2-sec'
  var addTitle = el('h3', T('auto.addModels'))
  var reloadButton = button(T('auto.reload'), function () { loadCatalog(true) }, 'cg2-reload')
  catalogHeader.appendChild(addTitle); catalogHeader.appendChild(reloadButton)
  var search = el('input'); search.className = 'cg2-search'
  search.type = 'search'
  search.placeholder = T('auto.search')
  search.setAttribute('aria-label', T('auto.search'))
  var results = el('div'); results.className = 'cg2-results'

  body.appendChild(intro)
  body.appendChild(sessionLabel)
  body.appendChild(enableRow)
  body.appendChild(status); body.appendChild(errors)
  body.appendChild(candHead); body.appendChild(candidates)
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
  function updateLauncher() {
    var active = false
    try { active = !!(sessionId && options.getConfig(sessionId).enabled) } catch (_) {}
    launcher.style.background = active ? '#15803d' : 'var(--dsw-alias-bg-base,#fff)'
    launcher.style.color = active ? '#ffffff' : 'var(--dsw-alias-label-secondary,#475569)'
    launcher.style.borderColor = active ? '#15803d' : 'var(--dsw-alias-border-l2,#cbd5e1)'
    launcher.title = active ? T('auto.enabledTip') : T('auto.disabledTip')
    titleDot.style.background = active ? '#15803d' : '#94a3b8'
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
    showStatus()
  }
  function renderCandidates() {
    clear(candidates)
    if (!draft.candidates.length) { candidates.appendChild(el('div', T('auto.noCandidates'), 'cg2-empty')); return }
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
        persist(); renderCandidates()
      }, 'cg2-icon')
      up.disabled = index === 0
      up.title = T('auto.up'); up.setAttribute('aria-label', T('auto.up'))
      var down = button('↓', function () {
        if (index >= draft.candidates.length - 1) return
        var list = draft.candidates
        list[index] = list[index + 1]; list[index + 1] = candidate
        persist(); renderCandidates()
      }, 'cg2-icon')
      down.disabled = index === draft.candidates.length - 1
      down.title = T('auto.down'); down.setAttribute('aria-label', T('auto.down'))
      var winWrap = el('label'); winWrap.className = 'cg2-win'
      var input = el('input')
      input.type = 'text'
      input.inputMode = 'numeric'
      input.value = candidate.window ? String(candidate.window) : ''
      var known = knownWindow(candidate)
      input.placeholder = known ? String(known) + ' ' + T('auto.windowAuto') : T('auto.windowUnknown')
      input.title = known ? T('auto.windowAutoTip') : T('auto.windowTokens')
      input.setAttribute('aria-label', candidate.provider + '/' + candidate.model + ' ' + T('auto.windowTokens'))
      input.addEventListener('change', function () {
        var text = input.value.trim()
        var n = Number(text)
        if (text && (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n <= 0)) {
          input.setAttribute('aria-invalid', 'true')
          errorText = T('auto.windowInvalid')
          showStatus(); return
        }
        input.removeAttribute('aria-invalid')
        if (text) candidate.window = n; else delete candidate.window
        persist()
      })
      winWrap.appendChild(input)
      var remove = button('×', function () { draft.candidates.splice(index, 1); persist(); renderCandidates(); renderCatalog() }, 'cg2-icon cg2-danger')
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
  function renderCatalog() {
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
        persist(); renderCandidates(); renderCatalog()
      })
      row.appendChild(label); row.appendChild(add); results.appendChild(row)
    })
    if (matches.length > 100) results.appendChild(el('div', T('auto.first100'), 'cg2-note'))
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
    launcher.textContent = T('auto.title')
    title.textContent = T('auto.settings')
    closeButton.setAttribute('aria-label', T('auto.close'))
    intro.textContent = T('auto.intro')
    panel.setAttribute('aria-label', T('auto.settings'))
    enableStrong.textContent = T('auto.enable')
    enableSub.textContent = T('auto.perSessionHint')
    enabled.setAttribute('aria-label', T('auto.enable'))
    candidatesTitle.textContent = T('auto.candidates')
    addTitle.textContent = T('auto.addModels')
    reloadButton.textContent = T('auto.reload')
    search.placeholder = T('auto.search')
    search.setAttribute('aria-label', T('auto.search'))
    updateLauncher()
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
  return {
    refresh: refresh,
    mount: mountLauncher,
    localize: localize,
    updateStatus: showStatus,
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
    function valid() {
      if (disposed || token !== s.generation || !s.binding || !s.cfg.enabled) return false
      if (!o.isCurrent(id) || key(selection(id)) !== expected) { cancel(s, T('st.userChanged')); return false }
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
      var candidate = null, candidateWindow = null
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
        candidate = item; candidateWindow = win; break
      }
      if (!candidate) { status(s, 'stopped', T('st.noCandidate')); return }
      var target = { provider: candidate.provider, model: candidate.model }
      var oldRoute = expected
      status(s, 'switching', T('st.switching') + key(target))

      var picked
      try { picked = await o.selectModel(id, target) } catch (error) {
        if (token !== s.generation || disposed || !s.binding || !s.cfg.enabled) return
        try { o.end(id) } catch (_) {}
        status(s, 'error', T('st.switchFailed') + String(error.message || error), error); return
      }
      if (token !== s.generation || disposed || !s.binding || !s.cfg.enabled) return
      var nowRoute = key(selection(id))
      if (nowRoute !== oldRoute && nowRoute !== key(target)) { cancel(s, T('st.otherModel')); return }
      expected = key(target)
      if (picked && picked.ok === false) {
        try { o.end(id) } catch (_) {}
        status(s, 'error', T('st.switchFailed') + errorText(picked)); return
      }
      if (!o.isCurrent(id)) { cancel(s, T('st.leftSession')); return }
      var confirmed = false
      try { confirmed = await o.assertSelection(id, target, 'auto-failover') } catch (error) { confirmed = false }
      if (!valid()) return
      try { o.end(id) } catch (_) {}
      if (confirmed !== true) { status(s, 'error', T('st.notConfirmed')); return }
      try { o.commit(id, target) } catch (_) {}
      status(s, 'continuing', T('st.continuing'))
      var result
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

        var tick = guard(function () { evaluate(sessionId, binding) })
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
          getCatalog: function () {
            // Refresh configured windows first: opening the panel is exactly
            // when the user expects the window column to show real values.
            return loadSettingsWindows().then(function () {
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
      Promise.resolve().then(loadSettingsWindows).catch(function () {})
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
        holding.clear(); epoch.clear()
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
