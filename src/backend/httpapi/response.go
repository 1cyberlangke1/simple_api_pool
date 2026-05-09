package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func WriteJSONResponse(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write json response failed: %v", err)
	}
}

func WriteErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	WriteJSONResponse(w, statusCode, map[string]string{"error": message})
}

func WriteOverviewResponse(w http.ResponseWriter, r *http.Request, payload any) {
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		WriteErrorResponse(w, http.StatusInternalServerError, "生成总览响应失败")
		return
	}

	entityTag := BuildEntityTag(encodedPayload)
	w.Header().Set("ETag", entityTag)
	if MatchesEntityTag(r.Header.Get("If-None-Match"), entityTag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(encodedPayload); err != nil {
		log.Printf("write overview response failed: %v", err)
	}
}

func BuildEntityTag(encodedPayload []byte) string {
	digest := sha256.Sum256(encodedPayload)
	return `"` + hex.EncodeToString(digest[:16]) + `"`
}

func MatchesEntityTag(rawHeader string, currentTag string) bool {
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
