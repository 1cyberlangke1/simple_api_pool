package tests

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func Test缓存命中路径支持高并发读取(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         "http://127.0.0.1:1",
		CacheEnabled:    true,
		CacheMaxEntries: 100,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"load"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 20)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 64)

	const (
		workers    = 24
		iterations = 20
	)

	var wg sync.WaitGroup
	errCh := make(chan error, workers*iterations)

	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range iterations {
				req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
				req.Header.Set("Authorization", "Bearer client-key")
				req.Header.Set("Content-Type", "application/json")
				rec := httptest.NewRecorder()
				proxy.ServeHTTP(rec, req)

				if rec.Code != http.StatusOK {
					errCh <- &statusError{code: rec.Code, body: rec.Body.String()}
					return
				}
				if !bytes.Contains(rec.Body.Bytes(), []byte(`"id":"cached"`)) {
					errCh <- &statusError{code: rec.Code, body: rec.Body.String()}
					return
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}

	snapshot := statsMgr.Snapshot()
	if snapshot["openai"].CacheHits != workers*iterations {
		t.Fatalf("期望缓存命中次数为 %d，实际是 %d", workers*iterations, snapshot["openai"].CacheHits)
	}
}

type statusError struct {
	code int
	body string
}

func (e *statusError) Error() string {
	return fmt.Sprintf("状态码或响应体不符合预期: code=%d body=%s", e.code, e.body)
}
