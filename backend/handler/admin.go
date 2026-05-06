package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type AdminHandler struct {
	cfg   *config.Config
	stats *stats.Manager
}

func NewAdminHandler(cfg *config.Config, sm *stats.Manager) *AdminHandler {
	return &AdminHandler{cfg: cfg, stats: sm}
}

func (ah *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin")
	path = strings.TrimPrefix(path, "/")

	w.Header().Set("Content-Type", "application/json")

	switch {
	case r.Method == http.MethodPost && path == "login":
		ah.handleLogin(w, r)
	case path == "providers":
		if !auth.CheckAdminKey(r, ah.cfg) {
			writeJSONError(w, http.StatusUnauthorized, "未授权")
			return
		}
		ah.handleProviders(w, r)
	case strings.HasPrefix(path, "providers/") && strings.HasSuffix(path, "/keys"):
		if !auth.CheckAdminKey(r, ah.cfg) {
			writeJSONError(w, http.StatusUnauthorized, "未授权")
			return
		}
		ah.handleProviderKeys(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "providers/") && strings.Count(path, "/") >= 2:
		if !auth.CheckAdminKey(r, ah.cfg) {
			writeJSONError(w, http.StatusUnauthorized, "未授权")
			return
		}
		ah.handleProviderKeys(w, r)
	case strings.HasPrefix(path, "providers/"):
		if !auth.CheckAdminKey(r, ah.cfg) {
			writeJSONError(w, http.StatusUnauthorized, "未授权")
			return
		}
		ah.handleSingleProvider(w, r)
	case path == "config":
		if !auth.CheckAdminKey(r, ah.cfg) {
			writeJSONError(w, http.StatusUnauthorized, "未授权")
			return
		}
		ah.handleConfig(w, r)
	default:
		writeJSONError(w, http.StatusNotFound, "接口不存在")
	}
}

func (ah *AdminHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AdminKey string `json:"admin_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "请求体无效")
		return
	}
	if body.AdminKey == "" || body.AdminKey != ah.cfg.AdminKey() {
		writeJSONError(w, http.StatusUnauthorized, "管理员密钥错误")
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (ah *AdminHandler) handleProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(ah.cfg.Providers())
	case http.MethodPost:
		var p config.Provider
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSONError(w, http.StatusBadRequest, "请求体无效")
			return
		}
		if err := ah.cfg.SaveProvider(p); err != nil {
			if errors.Is(err, os.ErrInvalid) {
				writeJSONError(w, http.StatusBadRequest, "提供商名称非法或为保留名称")
				return
			}
			writeJSONError(w, http.StatusBadRequest, "保存提供商失败")
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(p)
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *AdminHandler) handleSingleProvider(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	p, _ := ah.cfg.Provider(name)

	switch r.Method {
	case http.MethodDelete:
		if p == nil {
			writeJSONError(w, http.StatusNotFound, "提供商不存在")
			return
		}
		ah.cfg.DeleteProvider(name)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	default:
		if p == nil {
			writeJSONError(w, http.StatusNotFound, "提供商不存在")
			return
		}
		json.NewEncoder(w).Encode(p)
	}
}

func (ah *AdminHandler) handleProviderKeys(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) < 1 {
		writeJSONError(w, http.StatusBadRequest, "请求路径无效")
		return
	}
	name := parts[0]

	switch r.Method {
	case http.MethodPost:
		var body struct {
			Keys string `json:"keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "请求体无效")
			return
		}
		keys := parseKeyList(body.Keys)
		if err := ah.cfg.AddKeys(name, keys); err != nil {
			writeJSONError(w, http.StatusNotFound, "提供商不存在")
			return
		}
		p, _ := ah.cfg.Provider(name)
		json.NewEncoder(w).Encode(p.Keys)
	case http.MethodDelete:
		if len(parts) < 2 {
			writeJSONError(w, http.StatusBadRequest, "缺少要删除的密钥")
			return
		}
		keyValue := parts[1]
		if err := ah.cfg.DeleteKey(name, keyValue); err != nil {
			writeJSONError(w, http.StatusNotFound, "指定密钥不存在")
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (ah *AdminHandler) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(ah.cfg.GlobalConfig())
	case http.MethodPut:
		var body struct {
			AdminKey               string   `json:"admin_key"`
			TokenEstimationEnabled bool     `json:"token_estimation_enabled"`
			ClientKeys             []string `json:"client_keys"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "请求体无效")
			return
		}
		ah.cfg.UpdateGlobalConfig(body.AdminKey, body.TokenEstimationEnabled, body.ClientKeys)
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func parseKeyList(raw string) []string {
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

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
