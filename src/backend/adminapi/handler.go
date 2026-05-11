package adminapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
	"github.com/go-playground/validator/v10"

	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/httpapi"
	"simple-api-pool/realtime"
	"simple-api-pool/stats"
)

type Handler struct {
	cfg          *config.Config
	stats        *stats.Manager
	cache        *cache.Store
	keyActionSvc *KeyActionService
	providerSvc  *ProviderService
	groupSvc     *GroupService
	configSvc    *ConfigService
	authSvc      *AuthService
	validate     *validator.Validate
	router       chi.Router
}

type loginInput struct {
	AdminKey string `json:"admin_key" validate:"required"`
}

type importKeysInput struct {
	Keys json.RawMessage `json:"keys" validate:"required"`
}

func NewHandler(cfg *config.Config, sm *stats.Manager, cs *cache.Store) *Handler {
	limiter := auth.NewFailureLimiter(10, time.Minute, 10*time.Minute)
	handler := &Handler{
		cfg:          cfg,
		stats:        sm,
		cache:        cs,
		keyActionSvc: NewKeyActionService(cfg),
		providerSvc:  NewProviderService(cfg, sm, cs),
		groupSvc:     NewGroupService(cfg, sm, cs),
		configSvc:    NewConfigService(cfg),
		authSvc:      NewAuthService(cfg, limiter),
		validate:     validator.New(validator.WithRequiredStructEnabled()),
	}
	handler.router = handler.newRouter()
	return handler
}

func (ah *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ah.router.ServeHTTP(w, r)
}

func (ah *Handler) newRouter() chi.Router {
	router := chi.NewRouter()
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "接口不存在")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	})

	router.Post("/api/admin/login", ah.handleLogin)
	router.Post("/api/admin/logout", ah.handleLogout)

	router.Group(func(r chi.Router) {
		r.Use(ah.requireAdmin)
		r.Get("/api/admin/bootstrap", ah.handleBootstrap)
		r.Get("/api/admin/stream", ah.handleStream)
		r.Get("/api/admin/overview", ah.handleOverview)
		r.Get("/api/admin/logs", ah.handleLogs)
		r.Get("/api/admin/config", ah.handleConfig)
		r.Put("/api/admin/config", ah.handleConfig)

		r.Get("/api/admin/providers", ah.handleProviders)
		r.Post("/api/admin/providers", ah.handleProviders)
		r.Get("/api/admin/providers/{provider}", ah.handleSingleProvider)
		r.Delete("/api/admin/providers/{provider}", ah.handleSingleProvider)
		r.Post("/api/admin/providers/{provider}/keys", ah.handleProviderKeys)
		r.Post("/api/admin/providers/{provider}/keys/bulk", ah.handleProviderKeyBulkAction)
		r.Delete("/api/admin/providers/{provider}/cache", ah.handleProviderCache)
		r.Delete("/api/admin/providers/{provider}/{key}", ah.handleProviderKeys)

		r.Get("/api/admin/groups", ah.handleGroups)
		r.Post("/api/admin/groups", ah.handleGroups)
		r.Get("/api/admin/groups/{group}", ah.handleSingleGroup)
		r.Delete("/api/admin/groups/{group}", ah.handleSingleGroup)
	})

	return router
}

func (ah *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !ah.authorizeAdminRequest(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
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
	var body loginInput
	if !ah.decodeAndValidateJSON(w, r, &body) {
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
		var provider config.Provider
		if !ah.decodeJSON(w, r, &provider) {
			return
		}
		snapshot, _, err := ah.providerSvc.SaveProvider(provider)
		if err != nil {
			if errors.Is(err, os.ErrInvalid) {
				httpapi.WriteErrorResponse(w, http.StatusBadRequest, "提供商名称非法或为保留名称")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "保存提供商失败")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusCreated, snapshot)
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		httpapi.WriteJSONResponse(w, http.StatusOK, ah.groupSvc.ListSnapshots())
	case http.MethodPost:
		var group config.Group
		if !ah.decodeJSON(w, r, &group) {
			return
		}
		snapshot, _, err := ah.groupSvc.SaveGroup(group)
		if err != nil {
			if errors.Is(err, os.ErrInvalid) {
				httpapi.WriteErrorResponse(w, http.StatusBadRequest, "分组配置无效")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "保存分组失败")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusCreated, snapshot)
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleSingleProvider(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	switch r.Method {
	case http.MethodDelete:
		if err := ah.providerSvc.DeleteProvider(providerName); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
				return
			}
			if errors.Is(err, os.ErrInvalid) {
				httpapi.WriteErrorResponse(w, http.StatusBadRequest, "提供商仍被分组引用")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "删除提供商失败")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		snapshot, err := ah.providerSvc.GetSnapshot(providerName)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, snapshot)
	}
}

func (ah *Handler) handleSingleGroup(w http.ResponseWriter, r *http.Request) {
	groupName := chi.URLParam(r, "group")
	switch r.Method {
	case http.MethodDelete:
		if err := ah.groupSvc.DeleteGroup(groupName); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				httpapi.WriteErrorResponse(w, http.StatusNotFound, "分组不存在")
				return
			}
			httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "删除分组失败")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		snapshot, err := ah.groupSvc.GetSnapshot(groupName)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "分组不存在")
			return
		}
		httpapi.WriteJSONResponse(w, http.StatusOK, snapshot)
	}
}

func (ah *Handler) handleProviderKeys(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	switch r.Method {
	case http.MethodPost:
		var body importKeysInput
		if !ah.decodeAndValidateJSON(w, r, &body) {
			return
		}
		keys, err := parseImportedKeysPayload(body.Keys)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "密钥导入格式无效")
			return
		}
		keySnapshots, err := ah.providerSvc.AddKeys(providerName, keys)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusOK, keySnapshots)
	case http.MethodDelete:
		keyName := chi.URLParam(r, "key")
		if strings.TrimSpace(keyName) == "" {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "缺少要删除的密钥")
			return
		}
		keyValue, err := url.PathUnescape(keyName)
		if err != nil {
			httpapi.WriteErrorResponse(w, http.StatusBadRequest, "密钥标识无效")
			return
		}
		if err := ah.providerSvc.DeleteKey(providerName, keyValue); err != nil {
			httpapi.WriteErrorResponse(w, http.StatusNotFound, "指定密钥不存在")
			return
		}
		realtime.PublishProvidersChanged()
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleProviderCache(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	if r.Method != http.MethodDelete {
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	if err := ah.providerSvc.ClearProviderCache(providerName); err != nil {
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
		if !ah.decodeJSON(w, r, &body) {
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
		realtime.PublishGlobalConfigChanged()
		httpapi.WriteJSONResponse(w, http.StatusOK, map[string]string{"status": "updated"})
	default:
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *Handler) handleProviderKeyBulkAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpapi.WriteErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
		return
	}

	providerName := chi.URLParam(r, "provider")
	var body KeyActionInput
	if !ah.decodeAndValidateJSON(w, r, &body) {
		return
	}
	body.Keys = ah.providerSvc.ResolveKeyIdentifiers(providerName, body.Keys)
	if err := ah.keyActionSvc.Apply(providerName, body); err != nil {
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

	keySnapshots, err := ah.providerSvc.GetKeySnapshots(providerName)
	if err != nil {
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return
	}
	realtime.PublishProvidersChanged()
	httpapi.WriteJSONResponse(w, http.StatusOK, keySnapshots)
}

func (ah *Handler) decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := render.DecodeJSON(r.Body, dst); err != nil {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return false
	}
	return true
}

func (ah *Handler) decodeAndValidateJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if !ah.decodeJSON(w, r, dst) {
		return false
	}
	if err := ah.validate.Struct(dst); err != nil {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return false
	}
	return true
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
