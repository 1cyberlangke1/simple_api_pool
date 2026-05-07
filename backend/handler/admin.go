package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type AdminHandler struct {
	cfg   *config.Config
	stats *stats.Manager
	cache *cache.Store
}

func NewAdminHandler(cfg *config.Config, sm *stats.Manager, cs *cache.Store) *AdminHandler {
	return &AdminHandler{cfg: cfg, stats: sm, cache: cs}
}

func (ah *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin")
	path = strings.TrimPrefix(path, "/")

	switch {
	case r.Method == http.MethodPost && path == "login":
		ah.handleLogin(w, r)
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
	if auth.CheckAdminKey(r, ah.cfg) {
		return true
	}
	writeErrorResponse(w, http.StatusUnauthorized, "未授权")
	return false
}

func (ah *AdminHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AdminKey string `json:"admin_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
		return
	}
	if body.AdminKey == "" || body.AdminKey != ah.cfg.AdminKey() {
		writeErrorResponse(w, http.StatusUnauthorized, "管理员密钥错误")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ah *AdminHandler) handleProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSONResponse(w, http.StatusOK, ah.cfg.Providers())
	case http.MethodPost:
		var p config.Provider
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := ah.cfg.SaveProvider(p); err != nil {
			if errors.Is(err, os.ErrInvalid) {
				writeErrorResponse(w, http.StatusBadRequest, "提供商名称非法或为保留名称")
				return
			}
			writeErrorResponse(w, http.StatusBadRequest, "保存提供商失败")
			return
		}
		writeJSONResponse(w, http.StatusCreated, p)
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
		ah.cfg.DeleteProvider(name)
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		if p == nil {
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		writeJSONResponse(w, http.StatusOK, p)
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
			Keys string `json:"keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		keys := parseImportedKeys(body.Keys)
		if err := ah.cfg.AddKeys(name, keys); err != nil {
			writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
			return
		}
		p, _ := ah.cfg.Provider(name)
		writeJSONResponse(w, http.StatusOK, p.Keys)
	case http.MethodDelete:
		if len(parts) < 2 {
			writeErrorResponse(w, http.StatusBadRequest, "缺少要删除的密钥")
			return
		}
		keyValue := parts[1]
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
		writeJSONResponse(w, http.StatusOK, ah.cfg.GlobalConfig())
	case http.MethodPut:
		var body struct {
			AdminKey               string   `json:"admin_key"`
			TokenEstimationEnabled bool     `json:"token_estimation_enabled"`
			ClientKeys             []string `json:"client_keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErrorResponse(w, http.StatusBadRequest, "请求体无效")
			return
		}
		ah.cfg.UpdateGlobalConfig(body.AdminKey, body.TokenEstimationEnabled, body.ClientKeys)
		writeJSONResponse(w, http.StatusOK, map[string]string{"status": "updated"})
	default:
		writeErrorResponse(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
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
