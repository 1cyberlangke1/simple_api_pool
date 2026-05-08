package handler

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type AdminHandler struct {
	cfg     *config.Config
	stats   *stats.Manager
	cache   *cache.Store
	limiter *auth.FailureLimiter
}

func NewAdminHandler(cfg *config.Config, sm *stats.Manager, cs *cache.Store) *AdminHandler {
	return &AdminHandler{
		cfg:     cfg,
		stats:   sm,
		cache:   cs,
		limiter: auth.NewFailureLimiter(10, time.Minute, 10*time.Minute),
	}
}

func (ah *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin")
	path = strings.TrimPrefix(path, "/")

	switch {
	case r.Method == http.MethodPost && path == "login":
		ah.handleLogin(w, r)
	case r.Method == http.MethodPost && path == "logout":
		ah.handleLogout(w, r)
	case r.Method == http.MethodGet && path == "overview":
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleOverview(w, r)
	case path == "providers":
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviders(w, r)
	case strings.HasPrefix(path, "providers/") && strings.HasSuffix(path, "/keys/bulk"):
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeyBulkAction(w, r)
	case strings.HasPrefix(path, "providers/") && strings.HasSuffix(path, "/keys"):
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeys(w, r)
	case strings.HasPrefix(path, "providers/") && strings.HasSuffix(path, "/cache"):
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderCache(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "providers/") && strings.Count(path, "/") >= 2:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeys(w, r)
	case strings.HasPrefix(path, "providers/"):
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleSingleProvider(w, r)
	case path == "config":
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleConfig(w, r)
	default:
		writeErrorResponse(w, http.StatusNotFound, "接口不存在")
	}
}

func (ah *AdminHandler) handleOverview(w http.ResponseWriter, r *http.Request) {
	writeOverviewResponse(w, r, newAdminOverviewResponse(ah.cfg, ah.stats))
}

func (ah *AdminHandler) authorizeAdminRequest(w http.ResponseWriter, r *http.Request) bool {
	if ah.limiter != nil && !ah.limiter.Allow(r.RemoteAddr) {
		writeErrorResponse(w, http.StatusTooManyRequests, "鉴权失败次数过多，请稍后再试")
		return false
	}
	if auth.CheckAdminKey(r, ah.cfg) {
		if ah.limiter != nil {
			ah.limiter.RecordSuccess(r.RemoteAddr)
		}
		return true
	}
	if ah.limiter != nil {
		ah.limiter.RecordFailure(r.RemoteAddr)
	}
	writeErrorResponse(w, http.StatusUnauthorized, "未授权")
	return false
}

func (ah *AdminHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	if ah.limiter != nil && !ah.limiter.Allow(r.RemoteAddr) {
		writeErrorResponse(w, http.StatusTooManyRequests, "登录失败次数过多，请稍后再试")
		return
	}

	var body struct {
		AdminKey string `json:"admin_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return
	}
	if body.AdminKey == "" || subtle.ConstantTimeCompare([]byte(body.AdminKey), []byte(ah.cfg.AdminKey())) != 1 {
		if ah.limiter != nil {
			ah.limiter.RecordFailure(r.RemoteAddr)
		}
		writeErrorResponse(w, http.StatusUnauthorized, "管理员密钥错误")
		return
	}
	if err := auth.SetAdminSessionCookie(w, r, ah.cfg); err != nil {
		writeErrorResponse(w, http.StatusInternalServerError, "创建管理员会话失败")
		return
	}
	if ah.limiter != nil {
		ah.limiter.RecordSuccess(r.RemoteAddr)
	}
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ah *AdminHandler) handleLogout(w http.ResponseWriter, r *http.Request) {
	auth.RevokeAdminSession(r, ah.cfg)
	auth.ClearAdminSessionCookie(w, r)
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ah *AdminHandler) handleProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSONResponse(w, http.StatusOK, buildAdminProviderSnapshots(ah.cfg.Providers()))
	case http.MethodPost:
		var p config.Provider
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := ah.cfg.UpdateProviderSettings(p); err != nil {
			if errors.Is(err, os.ErrInvalid) {
				writeErrorResponse(w, http.StatusBadRequest, "提供商名称非法或为保留名称")
				return
			}
			writeErrorResponse(w, http.StatusBadRequest, "保存提供商失败")
			return
		}
		writeJSONResponse(w, http.StatusCreated, buildAdminProviderSnapshot(p))
	default:
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *AdminHandler) handleSingleProvider(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	p, _ := ah.cfg.Provider(name)

	switch r.Method {
	case http.MethodDelete:
		if p == nil {
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		if ah.cache != nil {
			if err := ah.cache.ClearProvider(name); err != nil {
				writeErrorResponse(w, http.StatusInternalServerError, "删除提供商缓存失败")
				return
			}
		}
		if err := ah.cfg.DeleteProvider(name); err != nil {
			writeErrorResponse(w, http.StatusInternalServerError, "删除提供商失败")
			return
		}
		if ah.stats != nil {
			ah.stats.RemoveProvider(name)
		}
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		if p == nil {
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		writeJSONResponse(w, http.StatusOK, buildAdminProviderSnapshot(*p))
	}
}

func (ah *AdminHandler) handleProviderKeys(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) < 1 {
		writeErrorResponse(w, http.StatusBadRequest, "请求路径无效")
		return
	}
	name := parts[0]

	switch r.Method {
	case http.MethodPost:
		var body struct {
			Keys json.RawMessage `json:"keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		keys, err := parseImportedKeysPayload(body.Keys)
		if err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "密钥导入格式无效")
			return
		}
		if err := ah.cfg.AddKeys(name, keys); err != nil {
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		p, _ := ah.cfg.Provider(name)
		writeJSONResponse(w, http.StatusOK, buildAdminProviderSnapshot(*p).Keys)
	case http.MethodDelete:
		if len(parts) < 2 {
			writeErrorResponse(w, http.StatusBadRequest, "缺少要删除的密钥")
			return
		}
		keyValue, err := url.PathUnescape(parts[1])
		if err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "密钥标识无效")
			return
		}
		keyValue = ah.resolveProviderKeyIdentifier(name, keyValue)
		if keyValue == "" {
			writeErrorResponse(w, http.StatusNotFound, "指定密钥不存在")
			return
		}
		if err := ah.cfg.DeleteKey(name, keyValue); err != nil {
			writeErrorResponse(w, http.StatusNotFound, "指定密钥不存在")
			return
		}
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *AdminHandler) handleProviderCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	name := strings.TrimSuffix(rest, "/cache")
	name = strings.TrimSuffix(name, "/")
	if name == "" {
		writeErrorResponse(w, http.StatusBadRequest, "请求路径无效")
		return
	}

	if provider, _ := ah.cfg.Provider(name); provider == nil {
		writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return
	}
	if ah.cache == nil {
		writeErrorResponse(w, http.StatusInternalServerError, "缓存服务不可用")
		return
	}
	if err := ah.cache.ClearProvider(name); err != nil {
		writeErrorResponse(w, http.StatusInternalServerError, "清空缓存失败")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "cleared"})
}

func (ah *AdminHandler) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		globalConfig := ah.cfg.AdminSettings()
		writeJSONResponse(w, http.StatusOK, GlobalConfigSnapshot{
			AdminKeyConfigured:     globalConfig.AdminKey != "",
			TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
			ClientKeyCount:         len(globalConfig.ClientKeys),
		})
	case http.MethodPut:
		var body struct {
			AdminKey               *string   `json:"admin_key"`
			TokenEstimationEnabled *bool     `json:"token_estimation_enabled"`
			ClientKeys             *[]string `json:"client_keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		if body.AdminKey != nil && strings.TrimSpace(*body.AdminKey) == "" {
			writeErrorResponse(w, http.StatusBadRequest, "管理员密钥不能为空")
			return
		}
		if err := ah.cfg.PatchGlobalConfig(body.AdminKey, body.TokenEstimationEnabled, body.ClientKeys); err != nil {
			writeErrorResponse(w, http.StatusInternalServerError, "更新配置失败")
			return
		}
		if body.AdminKey != nil {
			if err := auth.SetAdminSessionCookie(w, r, ah.cfg); err != nil {
				writeErrorResponse(w, http.StatusInternalServerError, "更新管理员会话失败")
				return
			}
		}
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "updated"})
	default:
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *AdminHandler) handleProviderKeyBulkAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	parts := strings.Split(rest, "/")
	if len(parts) < 3 || parts[1] != "keys" || parts[2] != "bulk" {
		writeErrorResponse(w, http.StatusBadRequest, "请求路径无效")
		return
	}

	var body struct {
		Action string   `json:"action"`
		Keys   []string `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return
	}
	if body.Action != "enable" && body.Action != "disable" && body.Action != "delete" {
		writeErrorResponse(w, http.StatusBadRequest, "批量操作类型无效")
		return
	}
	resolvedKeys := ah.resolveProviderKeyIdentifiers(parts[0], body.Keys)
	if err := ah.cfg.ApplyKeyAction(parts[0], body.Action, resolvedKeys); err != nil {
		switch {
		case errors.Is(err, os.ErrNotExist):
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
		case errors.Is(err, os.ErrInvalid):
			writeErrorResponse(w, http.StatusBadRequest, "批量操作参数无效")
		default:
			writeErrorResponse(w, http.StatusBadRequest, "批量操作失败")
		}
		return
	}

	provider, _ := ah.cfg.Provider(parts[0])
	if provider == nil {
		writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return
	}
	writeJSONResponse(w, http.StatusOK, buildAdminProviderSnapshot(*provider).Keys)
}

func (ah *AdminHandler) resolveProviderKeyIdentifiers(providerName string, identifiers []string) []string {
	provider, _ := ah.cfg.Provider(providerName)
	if provider == nil {
		return identifiers
	}

	resolvedValues := make([]string, 0, len(identifiers))
	seenValues := make(map[string]struct{}, len(identifiers))
	for _, identifier := range identifiers {
		resolvedValue := ah.resolveProviderKeyIdentifier(providerName, identifier)
		if resolvedValue == "" {
			continue
		}
		if _, exists := seenValues[resolvedValue]; exists {
			continue
		}
		seenValues[resolvedValue] = struct{}{}
		resolvedValues = append(resolvedValues, resolvedValue)
	}
	return resolvedValues
}

func (ah *AdminHandler) resolveProviderKeyIdentifier(providerName, identifier string) string {
	provider, _ := ah.cfg.Provider(providerName)
	if provider == nil {
		return ""
	}
	for _, key := range provider.Keys {
		if key.Value == identifier || buildSecretRef(key.Value) == identifier {
			return key.Value
		}
	}
	return ""
}

func parseImportedKeys(raw string) []string {
	raw = strings.ReplaceAll(raw, "\n", ",")
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseImportedKeysPayload(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	var rawText string
	if err := json.Unmarshal(raw, &rawText); err == nil {
		return parseImportedKeys(rawText), nil
	}

	var rawKeys []string
	if err := json.Unmarshal(raw, &rawKeys); err == nil {
		keys := make([]string, 0, len(rawKeys))
		for _, rawKey := range rawKeys {
			keys = append(keys, parseImportedKeys(rawKey)...)
		}
		return keys, nil
	}

	return nil, errors.New("unsupported imported key payload")
}
