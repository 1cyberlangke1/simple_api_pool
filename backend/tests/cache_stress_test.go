package tests

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	_ "modernc.org/sqlite"

	"simple-api-pool/cache"
	"simple-api-pool/config"
)

func TestSQLiteCacheSupportsConcurrentReadWriteWithinProvider(t *testing.T) {
	baseDir := t.TempDir()
	store := newTestCacheStoreAt(t, baseDir)

	const (
		workers    = 12
		iterations = 60
		maxEntries = 200
	)

	var wg sync.WaitGroup
	errCh := make(chan error, workers*iterations)

	for worker := range workers {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := range iterations {
				body := []byte(fmt.Sprintf(`{"model":"gpt-4.1","messages":[{"role":"user","content":"worker-%d-msg-%d"}]}`, workerID, i))
				response := []byte(fmt.Sprintf(`{"id":"resp-%d-%d"}`, workerID, i))

				store.Set("openai", config.OpenAIChat, "gpt-4.1", body, response, 200, map[string]string{"Content-Type": "application/json"}, 1, 1, maxEntries)

				entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", body)
				if !ok {
					errCh <- fmt.Errorf("worker %d iteration %d 未命中新写入缓存", workerID, i)
					return
				}
				if entry.ResponseBody != string(response) {
					errCh <- fmt.Errorf("worker %d iteration %d 响应体不匹配: %s", workerID, i, entry.ResponseBody)
					return
				}
			}
		}(worker)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}

	count := sqliteEntryCount(t, filepath.Join(baseDir, "openai", "cache.db"))
	if count > maxEntries {
		t.Fatalf("期望并发写入后条目数不超过 %d，实际是 %d", maxEntries, count)
	}
	if count == 0 {
		t.Fatal("期望并发写入后至少保留一个条目")
	}
}

func TestSQLiteCacheSupportsConcurrentIsolationAcrossProviders(t *testing.T) {
	baseDir := t.TempDir()
	store := newTestCacheStoreAt(t, baseDir)

	providers := []struct {
		name  string
		ptype config.ProviderType
		model string
		body  func(i int) []byte
	}{
		{
			name:  "openai",
			ptype: config.OpenAIChat,
			model: "gpt-4.1",
			body: func(i int) []byte {
				return []byte(fmt.Sprintf(`{"model":"gpt-4.1","messages":[{"role":"user","content":"openai-%d"}]}`, i))
			},
		},
		{
			name:  "responses",
			ptype: config.OpenAIResponses,
			model: "gpt-5",
			body: func(i int) []byte {
				return []byte(fmt.Sprintf(`{"model":"gpt-5","input":[{"role":"user","content":[{"type":"input_text","text":"responses-%d"}]}]}`, i))
			},
		},
		{
			name:  "gemini",
			ptype: config.Gemini,
			model: "gemini-2.5-flash",
			body: func(i int) []byte {
				return []byte(fmt.Sprintf(`{"model":"gemini-2.5-flash","contents":[{"role":"user","parts":[{"text":"gemini-%d"}]}]}`, i))
			},
		},
	}

	const iterations = 50
	var wg sync.WaitGroup
	errCh := make(chan error, len(providers)*iterations)

	for _, provider := range providers {
		provider := provider
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range iterations {
				body := provider.body(i)
				response := []byte(fmt.Sprintf(`{"id":"%s-%d"}`, provider.name, i))
				store.Set(provider.name, provider.ptype, provider.model, body, response, 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 200)

				entry, ok := store.Get(provider.name, provider.ptype, provider.model, body)
				if !ok {
					errCh <- fmt.Errorf("%s 第 %d 次写入后未命中缓存", provider.name, i)
					return
				}
				if entry.ResponseBody != string(response) {
					errCh <- fmt.Errorf("%s 第 %d 次命中返回了错误响应体 %s", provider.name, i, entry.ResponseBody)
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

	for _, provider := range providers {
		count := sqliteEntryCount(t, filepath.Join(baseDir, provider.name, "cache.db"))
		if count != iterations {
			t.Fatalf("期望 provider %s 独立缓存条目数为 %d，实际是 %d", provider.name, iterations, count)
		}
	}
}

func TestSQLiteCachePersistsAcrossReopen(t *testing.T) {
	baseDir := t.TempDir()
	store := newTestCacheStoreAt(t, baseDir)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"persist"}]}`)
	response := []byte(`{"id":"persisted"}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", body, response, 200, map[string]string{"Content-Type": "application/json"}, 2, 3, 10)
	if err := store.Close(); err != nil {
		t.Fatalf("关闭缓存失败: %v", err)
	}

	reopened := newTestCacheStoreAt(t, baseDir)
	entry, ok := reopened.Get("openai", config.OpenAIChat, "gpt-4.1", body)
	if !ok {
		t.Fatal("期望重新打开后仍能命中缓存")
	}
	if entry.ResponseBody != string(response) || entry.InputTokens != 2 || entry.OutputTokens != 3 {
		t.Fatalf("期望重新打开后读到原始缓存，实际是 %+v", entry)
	}
}

func sqliteEntryCount(t *testing.T, dbPath string) int {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("打开 SQLite 文件失败: %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM cache_entries`).Scan(&count); err != nil {
		t.Fatalf("统计缓存条目数失败: %v", err)
	}
	return count
}

func newTestCacheStoreAt(t *testing.T, baseDir string) *cache.Store {
	t.Helper()
	cs := cache.NewStore(baseDir)
	t.Cleanup(func() {
		_ = cs.Close()
	})
	return cs
}
