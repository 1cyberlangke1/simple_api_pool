package adminapi

import (
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
	"simple-api-pool/httpapi"
	"simple-api-pool/stats"
)

type Handler struct {
	cfg          *config.Config
	stats        *stats.Manager
	cache        *cache.Store
	keyActionSvc *KeyActionService
	providerSvc  *ProviderService
	configSvc    *ConfigService
	authSvc      *AuthService
}

func NewHandler(cfg *config.Config, sm *stats.Manager, cs *cache.Store) *Handler {
	limiter := auth.NewFailureLimiter(10, time.Minute, 10*time.Minute)
	return &Handler{
		cfg:          cfg,
		stats:        sm,
		cache:        cs,
		keyActionSvc: NewKeyActionService(cfg),
		providerSvc:  NewProviderService(cfg, sm, cs),
		configSvc:    NewConfigService(cfg),
		authSvc:      NewAuthService(cfg, limiter),
	}
}

func (ah *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	route, err := ParseRoute(r.Method, r.URL.Path)
	if err != nil {
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "接口不存在")
		return
	}

	switch route.Operation {
	case RouteOperationLogin:
		if r.Method != http.MethodPost {
			httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
			return
		}
		ah.handleLogin(w, r)
	case RouteOperationLogout:
		if r.Method != http.MethodPost {
			httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
			return
		}
		ah.handleLogout(w, r)
	case RouteOperationOverview:
		if r.Method != http.MethodGet {
			httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
			return
		}
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleOverview(w, r)
	case RouteOperationProviders:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviders(w, r)
	case RouteOperationProviderKeysBulk:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeyBulkAction(w, r, route)
	case RouteOperationProviderKeys:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeys(w, r, route)
	case RouteOperationProviderCache:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderCache(w, r, route)
	case RouteOperationProviderKey:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleProviderKeys(w, r, route)
	case RouteOperationProvider:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleSingleProvider(w, r, route)
	case RouteOperationConfig:
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		ah.handleConfig(w, r)
	default:
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "接口不存在")
	}
}

func (ah *Handler) handleOverview(w http.ResponseWriter, r *http.Request) {
	httpapi.WriteOverviewResponse(w, r, newAdminOverviewResponse(ah.cfg, ah.stats))
}

func (ah *Handler) authorizeAdminRequest(w http.ResponseWriter, r *http.Request) bool {
	err := ah.authSvc.Authorize(r)
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrAdminRateLimited):
		httpapi.WriteErrorResponse(w, http.StatusTooManyRequests, "鉴权失败次数过多，请稍后再试")
	case errors.Is(err, ErrAdminOriginInvalid):
		httpapi.WriteErrorResponse(w, http.StatusForbidden, "管理员会话请求来源非法")
	default:
		httpapi.WriteErrorResponse(w, http.StatusUnauthorized, "未授权")
	}
	return false
}

func (ah *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AdminKey string `json:"admin_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return
	}
	if err := ah.authSvc.Login(w, r, body.AdminKey); err != nil {
		switch {
		case errors.Is(err, ErrAdminRateLimited):
			httpapi.WriteErrorResponse(w, http.StatusTooManyRequests, "登录失败次数过多，请稍后再试")
		case errors.Is(err, ErrAdminBadCredential):
			httpapi.WriteErrorResponse(w, http.StatusUnauthorized, "管理员密钥错误")
		default:
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "创建管理员会话失败")
		}
		return
	}
	httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ah *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	ah.authSvc.Logout(w, r)
	httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ah *Handler) handleProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		httpapi.WriteJSONResponse(w, http.StatusOK, ah.providerSvc.ListSnapshots())
	case http.MethodPost:
		var p config.Provider
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		snapshot, _, err := ah.providerSvc.SaveProvider(p)
		if err != nil {
			if errors.Is(err, os.ErrInvalid) {
				httpapi.WriteErrorResponse(w, http.StatusBadRequest, "提供商名称非法或为保留名称")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "保存提供商失败")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusCreated, snapshot)
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleSingleProvider(w http.ResponseWriter, r *http.Request, route Route) {
	switch r.Method {
	case http.MethodDelete:
		if err := ah.providerSvc.DeleteProvider(route.ProviderName); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "删除提供商失败")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		snapshot, err := ah.providerSvc.GetSnapshot(route.ProviderName)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, snapshot)
	}
}

func (ah *Handler) handleProviderKeys(w http.ResponseWriter, r *http.Request, route Route) {
	switch r.Method {
	case http.MethodPost:
		var body struct {
			Keys json.RawMessage `json:"keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		keys, err := parseImportedKeysPayload(body.Keys)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "密钥导入格式无效")
			return
		}
		keySnapshots, err := ah.providerSvc.AddKeys(route.ProviderName, keys)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, keySnapshots)
	case http.MethodDelete:
		if strings.TrimSpace(route.KeyName) == "" {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "缺少要删除的密钥")
			return
		}
		keyValue, err := url.PathUnescape(route.KeyName)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "密钥标识无效")
			return
		}
		if err := ah.providerSvc.DeleteKey(route.ProviderName, keyValue); err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "指定密钥不存在")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleProviderCache(w http.ResponseWriter, r *http.Request, route Route) {
	if r.Method != http.MethodDelete {
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	if err := ah.providerSvc.ClearProviderCache(route.ProviderName); err != nil {
		switch {
		case errors.Is(err, os.ErrNotExist):
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
		case errors.Is(err, ErrCacheServiceUnavailable):
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "缓存服务不可用")
		default:
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "清空缓存失败")
		}
		return
	}

	httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "cleared"})
}

func (ah *Handler) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		httpapi.WriteJSONResponse(w, http.StatusOK, ah.configSvc.Snapshot())
	case http.MethodPut:
		var body GlobalConfigUpdateInput
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		adminKeyChanged, err := ah.configSvc.Update(body)
		if err != nil {
			if errors.Is(err, ErrAdminKeyRequired) {
				httpapi.WriteErrorResponse(w, http.StatusBadRequest, "管理员密钥不能为空")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "更新配置失败")
			return
		}
		if adminKeyChanged {
			if err := ah.authSvc.RefreshSession(w, r); err != nil {
				httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "更新管理员会话失败")
				return
			}
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "updated"})
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleProviderKeyBulkAction(w http.ResponseWriter, r *http.Request, route Route) {
	if r.Method != http.MethodPost {
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	var body KeyActionInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return
	}
	body.Keys = ah.providerSvc.ResolveKeyIdentifiers(route.ProviderName, body.Keys)
	if err := ah.keyActionSvc.Apply(route.ProviderName, body); err != nil {
		switch {
		case errors.Is(err, os.ErrNotExist):
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
		case errors.Is(err, os.ErrInvalid):
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "批量操作参数无效")
		default:
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "批量操作失败")
		}
		return
	}

	keySnapshots, err := ah.providerSvc.GetKeySnapshots(route.ProviderName)
	if err != nil {
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return
	}
	httpapi.WriteJSONResponse(w, http.StatusOK, keySnapshots)
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
