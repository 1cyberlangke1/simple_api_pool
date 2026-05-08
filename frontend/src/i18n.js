/* ---------- i18n ---------- */

    const messages = {
      "zh-CN": {
        "nav.status": "状态页",
        "nav.admin": "管理页",
        "hero.statusTitle": "运行总览",
        "hero.statusCopy": "实时查看各提供商的请求与 Token 用量。",
        "hero.adminTitle": "管理控制台",
        "hero.adminCopy": "维护全局配置、提供商策略与上游密钥。",
        "meta.version": "版本",
        "metric.health": "服务状态",
        "metric.healthChecking": "检测中",
        "metric.healthCheckingNote": "正在检测后端健康接口",
        "metric.healthOnline": "在线",
        "metric.healthError": "异常",
        "metric.healthUnknown": "未知",
        "metric.healthNote": "健康接口：{status}",
        "metric.healthUnavailable": "健康接口不可用",
        "metric.providers": "提供商",
        "metric.providersNote": "已统计的提供商数量",
        "metric.success": "成功请求",
        "metric.error": "错误请求",
        "metric.cumulative": "所有提供商累计",
        "status.detailsTitle": "提供商明细",
        "status.detailsSub": "公开统计，无需登录。",
        "status.waiting": "等待数据",
        "status.updated": "数据已更新",
        "status.failed": "读取失败",
        "status.empty": "暂无统计数据，发起一次代理请求后再回来查看。",
        "admin.workspaceTitle": "管理工作区",
        "admin.workspaceSub": "登录后维护全局配置、提供商与上游密钥。",
        "admin.loginTitle": "登录",
        "admin.loginSub": "登录状态保存在当前浏览器。",
        "admin.adminKey": "管理员密钥",
        "admin.adminKeyPlaceholder": "请输入管理员密钥",
        "admin.adminKeyPlaceholderHint": "用于管理接口鉴权",
        "admin.loginBtn": "登录",
        "admin.logoutBtn": "退出登录",
        "admin.entryHint": "代理入口 <code>/{provider}/...</code> · 缓存入口 <code>/cache/{provider}/...</code>",
        "admin.globalTitle": "全局配置",
        "admin.tokenEst": "上游缺统计时启用 Token 估算",
        "admin.clientKeys": "客户端访问密钥",
        "admin.keysPlaceholder": "每行一个，或用半角逗号分隔",
        "admin.saveGlobal": "保存全局配置",
        "admin.newProvider": "新增提供商",
        "admin.saveProvider": "保存提供商",
        "admin.providerListTitle": "提供商列表",
        "admin.providerListSub": "一次只聚焦一个提供商，分页处理配置与密钥。",
        "admin.providerWorkspaceTitle": "提供商工作台",
        "admin.providerWorkspaceSub": "先选提供商，再在同一工作区完成搜索、导入、批量操作和配置调整。",
        "admin.providerSearch": "搜索提供商",
        "admin.providerSearchPlaceholder": "按名称筛选左侧提供商",
        "admin.providerSelectorEmpty": "没有匹配的提供商",
        "admin.logTitle": "最近日志",
        "admin.logSub": "终端风格展示最近固定条数日志，用不同颜色区分级别，便于快速排查代理与鉴权问题。",
        "admin.logEmpty": "暂无日志",
        "admin.viewLogs": "查看日志",
        "admin.closeLogs": "关闭",
        "admin.hidePanelLogs": "隐藏面板请求与健康检查",
        "admin.prevProvider": "上一项",
        "admin.nextProvider": "下一项",
        "admin.keySearch": "搜索 Key",
        "admin.keySearchPlaceholder": "输入关键词过滤当前提供商的 Key",
        "admin.importKeys": "导入 Key",
        "admin.hideImportKeys": "收起导入",
        "admin.selectPageKeys": "本页全选",
        "admin.invertPageKeys": "反选",
        "admin.enableSelectedKeys": "启用选中",
        "admin.disableSelectedKeys": "禁用选中",
        "admin.deleteSelectedKeys": "删除选中",
        "admin.keySelectionSummary": "已选 {selected} / 本页 {page} / 结果 {total}",
        "admin.keyPagePrev": "上一页",
        "admin.keyPageNext": "下一页",
        "admin.keyPageIndicator": "第 {current} / {total} 页",
        "admin.bulkActionDone": "已完成 {action}。",
        "admin.bulkActionEnable": "启用",
        "admin.bulkActionDisable": "禁用",
        "admin.bulkActionDelete": "删除",
        "admin.noSelectedKeys": "请先选择至少一个 Key。",
        "admin.loginToLoad": "登录后加载提供商配置",
        "admin.pleaseLogin": "请先登录",
        "admin.localKeyExpired": "本地密钥已失效，请重新登录",
        "admin.invalidKey": "密钥无效，请重新输入。",
        "admin.loginSuccess": "登录成功，已记住本设备。",
        "admin.localKeyLoaded": "已读取本地保存的密钥。",
        "admin.loggedOut": "已退出登录",
        "admin.loggedOutMsg": "已退出登录。",
        "admin.loggedOutLocalOnly": "本地界面已退出，服务器会话注销失败。",
        "admin.savedGlobal": "全局配置已保存。",
        "admin.savedTip": "已保存。",
        "admin.savedProvider": "已保存提供商 {name}。",
        "admin.importDone": "导入完成。",
        "admin.importDoneTip": "已导入 {provider} 的密钥。",
        "admin.deletedProvider": "已删除提供商 {name}。",
        "admin.deletedKey": "已删除 {provider} 的一个密钥。",
        "admin.clearedCache": "已清空 {provider} 的缓存。",
        "admin.sessionExpiredKeepDrafts": "登录已过期，请重新登录，当前草稿已保留。",
        "admin.confirmDeleteProvider": "确定删除提供商 {name}？此操作不可撤销。",
        "admin.confirmDeleteKey": "确定删除 {provider} 的这个 Key？",
        "admin.confirmDeleteSelectedKeys": "确定删除已选中的 {count} 个 Key？此操作不可撤销。",
        "admin.confirmClearCache": "确定清空 {provider} 的缓存？",
        "admin.pleaseInputKey": "请输入管理员密钥。",
        "provider.name": "名称",
        "provider.namePlaceholder": "例如 openai",
        "provider.type": "接口格式",
        "provider.baseUrl": "上游地址",
        "provider.baseUrlPlaceholder": "留空则使用对应类型的默认地址",
        "provider.strategy": "密钥策略",
        "provider.failThreshold": "失败阈值",
        "provider.minDisable": "最小禁用秒数",
        "provider.maxDisable": "最大禁用秒数",
        "provider.cacheEnabled": "启用硬盘缓存",
        "provider.cacheMax": "最大缓存条目",
        "provider.empty": "尚未配置提供商，先在左侧新增一个",
        "provider.noKeys": "当前筛选条件下没有 Key",
        "provider.defaultUpstream": "默认上游",
        "provider.upstreamKeys": "上游密钥",
        "provider.batchImport": "批量导入",
        "provider.configTitle": "提供商配置",
        "provider.connectionSectionTitle": "基础连接",
        "provider.disablePolicyTitle": "禁用策略",
        "provider.disablePolicyNote": "控制失败阈值、禁用窗口和恢复上限。",
        "provider.cacheSectionTitle": "缓存设置",
        "provider.save": "保存",
        "provider.clearCache": "清空缓存",
        "provider.import": "导入",
        "provider.delete": "删除",
        "provider.tagSuccess": "成功 {n}",
        "provider.tagError": "错误 {n}",
        "provider.tagCacheHits": "缓存命中 {n}",
        "provider.tagSuccessRate": "成功率 {n}",
        "provider.tagErrorRate": "错误率 {n}",
        "provider.tagAvailableKeys": "可用 Key {available} / 总 Key {total}",
        "provider.tagKeys": "密钥 {n}",
        "provider.tagAvailable": "可用 {n}",
        "provider.tagDisabled": "禁用 {n}",
        "provider.selected": "当前选中",
        "provider.tagCacheOn": "缓存开",
        "provider.tagCacheOff": "缓存关",
        "provider.statSuccess": "成功",
        "provider.statError": "错误",
        "provider.statInputTokens": "输入 Token",
        "provider.statOutputTokens": "输出 Token",
        "provider.statCacheTokens": "缓存 Token",
        "provider.statCacheHits": "缓存命中",
        "provider.errorTypeTitle": "错误类型",
        "provider.fails": "连续失败 {n} 次",
        "provider.disabledUntil": "禁用至 {time}",
        "provider.usable": "可用",
        "provider.notDisabled": "未禁用",
        "provider.rateNone": "暂无",
        "strategy.roundRobin": "轮询",
        "strategy.fill": "填充",
        "error.healthAbnormal": "健康接口异常",
        "error.readStatus": "读取状态失败",
        "error.login": "登录失败",
        "error.readGlobal": "读取全局配置失败",
        "error.readProviders": "读取提供商失败",
        "error.save": "保存失败",
        "error.import": "导入失败",
        "error.delete": "删除失败",
        "error.action": "操作失败",
        "error.read": "读取失败",
        "error.network": "网络请求失败",
        "error.runtime": "页面运行异常",
        "label.lang": "中"
      },
      "en": {
        "nav.status": "Status",
        "nav.admin": "Admin",
        "hero.statusTitle": "Live Overview",
        "hero.statusCopy": "Real-time request and token usage across providers.",
        "hero.adminTitle": "Admin Console",
        "hero.adminCopy": "Manage global config, provider policies and upstream keys.",
        "meta.version": "Version",
        "metric.health": "Service",
        "metric.healthChecking": "Checking",
        "metric.healthCheckingNote": "Probing backend health endpoint",
        "metric.healthOnline": "Online",
        "metric.healthError": "Down",
        "metric.healthUnknown": "Unknown",
        "metric.healthNote": "Health: {status}",
        "metric.healthUnavailable": "Health endpoint unavailable",
        "metric.providers": "Providers",
        "metric.providersNote": "Tracked provider count",
        "metric.success": "Successes",
        "metric.error": "Errors",
        "metric.cumulative": "All providers, cumulative",
        "status.detailsTitle": "Providers",
        "status.detailsSub": "Public stats, no login required.",
        "status.waiting": "Waiting",
        "status.updated": "Up to date",
        "status.failed": "Load failed",
        "status.empty": "No stats yet. Make a proxy request and come back.",
        "admin.workspaceTitle": "Admin Workspace",
        "admin.workspaceSub": "Sign in to manage global config, providers and upstream keys.",
        "admin.loginTitle": "Sign In",
        "admin.loginSub": "Session is stored in this browser.",
        "admin.adminKey": "Admin Key",
        "admin.adminKeyPlaceholder": "Enter admin key",
        "admin.adminKeyPlaceholderHint": "Used to authenticate admin APIs",
        "admin.loginBtn": "Sign In",
        "admin.logoutBtn": "Sign Out",
        "admin.entryHint": "Proxy: <code>/{provider}/...</code> · Cache: <code>/cache/{provider}/...</code>",
        "admin.globalTitle": "Global Config",
        "admin.tokenEst": "Estimate tokens when upstream omits stats",
        "admin.clientKeys": "Client Access Keys",
        "admin.keysPlaceholder": "One per line, or comma-separated",
        "admin.saveGlobal": "Save Global Config",
        "admin.newProvider": "New Provider",
        "admin.saveProvider": "Save Provider",
        "admin.providerListTitle": "Providers",
        "admin.providerListSub": "Focus on one provider at a time with paged config and key management.",
        "admin.providerWorkspaceTitle": "Provider Workspace",
        "admin.providerWorkspaceSub": "Pick a provider, then complete search, import, bulk actions, and config updates in one place.",
        "admin.providerSearch": "Search Providers",
        "admin.providerSearchPlaceholder": "Filter providers by name",
        "admin.providerSelectorEmpty": "No providers match this filter",
        "admin.logTitle": "Recent Logs",
        "admin.logSub": "Terminal-style recent logs with color-coded levels for quick proxy and auth debugging.",
        "admin.logEmpty": "No logs yet",
        "admin.viewLogs": "View Logs",
        "admin.closeLogs": "Close",
        "admin.hidePanelLogs": "Hide panel and health requests",
        "admin.prevProvider": "Previous",
        "admin.nextProvider": "Next",
        "admin.keySearch": "Search Keys",
        "admin.keySearchPlaceholder": "Filter keys in the current provider",
        "admin.importKeys": "Import Keys",
        "admin.hideImportKeys": "Hide Import",
        "admin.selectPageKeys": "Select Page",
        "admin.invertPageKeys": "Invert",
        "admin.enableSelectedKeys": "Enable Selected",
        "admin.disableSelectedKeys": "Disable Selected",
        "admin.deleteSelectedKeys": "Delete Selected",
        "admin.keySelectionSummary": "Selected {selected} / Page {page} / Results {total}",
        "admin.keyPagePrev": "Prev Page",
        "admin.keyPageNext": "Next Page",
        "admin.keyPageIndicator": "Page {current} / {total}",
        "admin.bulkActionDone": "{action} completed.",
        "admin.bulkActionEnable": "Enable",
        "admin.bulkActionDisable": "Disable",
        "admin.bulkActionDelete": "Delete",
        "admin.noSelectedKeys": "Select at least one key first.",
        "admin.loginToLoad": "Sign in to load provider config",
        "admin.pleaseLogin": "Please sign in",
        "admin.localKeyExpired": "Local key expired, please sign in again",
        "admin.invalidKey": "Invalid key, please re-enter.",
        "admin.loginSuccess": "Signed in. Remembered on this device.",
        "admin.localKeyLoaded": "Loaded saved key from this browser.",
        "admin.loggedOut": "Signed out",
        "admin.loggedOutMsg": "Signed out.",
        "admin.loggedOutLocalOnly": "Local view was cleared, but server sign-out failed.",
        "admin.savedGlobal": "Global config saved.",
        "admin.savedTip": "Saved.",
        "admin.savedProvider": "Provider {name} saved.",
        "admin.importDone": "Import complete.",
        "admin.importDoneTip": "Keys imported for {provider}.",
        "admin.deletedProvider": "Provider {name} deleted.",
        "admin.deletedKey": "A key was deleted from {provider}.",
        "admin.clearedCache": "Cleared cache for {provider}.",
        "admin.sessionExpiredKeepDrafts": "Session expired. Please sign in again. Drafts were kept.",
        "admin.confirmDeleteProvider": "Delete provider {name}? This cannot be undone.",
        "admin.confirmDeleteKey": "Delete this key from {provider}?",
        "admin.confirmDeleteSelectedKeys": "Delete the selected {count} keys? This cannot be undone.",
        "admin.confirmClearCache": "Clear cache for {provider}?",
        "admin.pleaseInputKey": "Please enter the admin key.",
        "provider.name": "Name",
        "provider.namePlaceholder": "e.g. openai",
        "provider.type": "API Format",
        "provider.baseUrl": "Upstream URL",
        "provider.baseUrlPlaceholder": "Leave blank to use the default for the type",
        "provider.strategy": "Key Strategy",
        "provider.failThreshold": "Fail Threshold",
        "provider.minDisable": "Min Disable (s)",
        "provider.maxDisable": "Max Disable (s)",
        "provider.cacheEnabled": "Enable Disk Cache",
        "provider.cacheMax": "Max Cache Entries",
        "provider.empty": "No providers yet — add one on the left",
        "provider.noKeys": "No keys match the current filter",
        "provider.defaultUpstream": "default upstream",
        "provider.upstreamKeys": "Upstream Keys",
        "provider.batchImport": "Batch Import",
        "provider.configTitle": "Provider Config",
        "provider.connectionSectionTitle": "Connection",
        "provider.disablePolicyTitle": "Disable Policy",
        "provider.disablePolicyNote": "Control failure threshold, disable window, and recovery cap.",
        "provider.cacheSectionTitle": "Cache Settings",
        "provider.save": "Save",
        "provider.clearCache": "Clear Cache",
        "provider.import": "Import",
        "provider.delete": "Delete",
        "provider.tagSuccess": "OK {n}",
        "provider.tagError": "Err {n}",
        "provider.tagCacheHits": "Hits {n}",
        "provider.tagSuccessRate": "OK Rate {n}",
        "provider.tagErrorRate": "Err Rate {n}",
        "provider.tagAvailableKeys": "Usable keys {available} / total {total}",
        "provider.tagKeys": "Keys {n}",
        "provider.tagAvailable": "Up {n}",
        "provider.tagDisabled": "Down {n}",
        "provider.selected": "Selected",
        "provider.tagCacheOn": "Cache On",
        "provider.tagCacheOff": "Cache Off",
        "provider.statSuccess": "Success",
        "provider.statError": "Error",
        "provider.statInputTokens": "Input Tokens",
        "provider.statOutputTokens": "Output Tokens",
        "provider.statCacheTokens": "Cache Tokens",
        "provider.statCacheHits": "Cache Hits",
        "provider.errorTypeTitle": "Error Types",
        "provider.fails": "Failed {n} in a row",
        "provider.disabledUntil": "Disabled until {time}",
        "provider.usable": "available",
        "provider.notDisabled": "active",
        "provider.rateNone": "N/A",
        "strategy.roundRobin": "Round Robin",
        "strategy.fill": "Fill",
        "error.healthAbnormal": "Health endpoint error",
        "error.readStatus": "Failed to load status",
        "error.login": "Sign-in failed",
        "error.readGlobal": "Failed to load global config",
        "error.readProviders": "Failed to load providers",
        "error.save": "Save failed",
        "error.import": "Import failed",
        "error.delete": "Delete failed",
        "error.action": "Operation failed",
        "error.read": "Read failed",
        "error.network": "Network request failed",
        "error.runtime": "Page runtime error",
        "label.lang": "EN"
      }
    };

    function t(key, params) {
      const dict = messages[state.lang] || messages["en"];
      let value = dict[key];
      if (value === undefined) {
        value = (messages["en"][key] !== undefined) ? messages["en"][key] : key;
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = replaceEvery(value, `{${k}}`, String(v));
        }
      }
      return value;
    }

    function applyI18nStatic() {
      document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
      document.body.dataset.lang = state.lang === "en" ? "en" : "zh";
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        const text = t(key);
        if (el.tagName === "LABEL") {
          Array.from(el.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim() !== "") {
              el.removeChild(node);
            }
          });
          let labelTextNode = el.querySelector("[data-role='label-text']");
          if (!labelTextNode) {
            labelTextNode = document.createElement("span");
            labelTextNode.dataset.role = "label-text";
            const firstField = el.querySelector("input, textarea, select, span");
            if (firstField) {
              el.insertBefore(labelTextNode, firstField);
            } else {
              el.appendChild(labelTextNode);
            }
          }
          labelTextNode.textContent = text;
        } else if (el.children.length === 0) {
          el.textContent = text;
        }
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
      });
      document.querySelectorAll("[data-i18n-html]").forEach((el) => {
        renderTranslatedInlineMarkup(el, t(el.getAttribute("data-i18n-html")));
      });
      const langLabel = document.getElementById("lang-toggle-label");
      if (langLabel) langLabel.textContent = t("label.lang");
    }

    function renderTranslatedInlineMarkup(element, markupText) {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }

      const templatePattern = /<code>(.*?)<\/code>/g;
      let lastIndex = 0;
      let match = templatePattern.exec(markupText);
      while (match) {
        if (match.index > lastIndex) {
          element.appendChild(document.createTextNode(markupText.slice(lastIndex, match.index)));
        }
        const code = document.createElement("code");
        code.textContent = match[1];
        element.appendChild(code);
        lastIndex = match.index + match[0].length;
        match = templatePattern.exec(markupText);
      }
      if (lastIndex < markupText.length) {
        element.appendChild(document.createTextNode(markupText.slice(lastIndex)));
      }
    }

    function applyTheme() {
      document.documentElement.dataset.theme = state.theme;
    }

    function setTheme(theme) {
      state.theme = theme;
      state.themeManual = true;
      localStorage.setItem(THEME_KEY, theme);
      applyTheme();
    }

    function setLang(lang) {
      state.lang = messages[lang] ? lang : "en";
      localStorage.setItem(LANG_KEY, state.lang);
      applyI18nStatic();
      // Re-render dynamic content
      renderBuildVersion();
      setRouteView();
      renderStatusCards(state.stats);
      applyGlobalConfigDraftToForm();
      applyCreateProviderDraftToForm();
      renderAdminWorkspaceProviders();
      renderRecentLogs(state.recentLogs || []);
    }
