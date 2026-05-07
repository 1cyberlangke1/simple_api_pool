package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
)

func writeJSONResponse(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if payload == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	writeJSONResponse(w, statusCode, map[string]string{"error": message})
}

func writeOverviewResponse(w http.ResponseWriter, r *http.Request, payload any) {
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		writeErrorResponse(w, http.StatusInternalServerError, "生成总览响应失败")
		return
	}

	entityTag := buildEntityTag(encodedPayload)
	w.Header().Set("ETag", entityTag)
	if matchesEntityTag(r.Header.Get("If-None-Match"), entityTag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(encodedPayload)
}

func buildEntityTag(encodedPayload []byte) string {
	digest := sha256.Sum256(encodedPayload)
	return `"` + hex.EncodeToString(digest[:16]) + `"`
}

func matchesEntityTag(rawHeader string, currentTag string) bool {
	for _, candidate := range strings.Split(rawHeader, ",") {
		trimmed := strings.TrimSpace(candidate)
		if trimmed == "" {
			continue
		}
		if trimmed == "*" || trimmed == currentTag {
			return true
		}
	}
	return false
}
