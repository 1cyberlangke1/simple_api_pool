package tests

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"simple-api-pool/stats"
	"simple-api-pool/store"

	_ "modernc.org/sqlite"
)

func TestStoreCanSaveLoadAndCheckExistence(t *testing.T) {
	st := store.New(t.TempDir())
	payload := map[string]any{
		"name":  "demo",
		"count": 3,
	}

	if err := st.Save("nested/config.json", payload); err != nil {
		t.Fatalf("保存文件失败: %v", err)
	}
	if !st.Exists("nested/config.json") {
		t.Fatal("期望保存后文件存在")
	}

	var loaded map[string]any
	if err := st.Load("nested/config.json", &loaded); err != nil {
		t.Fatalf("加载文件失败: %v", err)
	}
	if loaded["name"] != "demo" || loaded["count"] != float64(3) {
		t.Fatalf("期望加载结果保持一致，实际是 %+v", loaded)
	}
}

func TestStoreReturnsNotExistForMissingFile(t *testing.T) {
	st := store.New(t.TempDir())
	var payload map[string]any

	if st.Dir() == "" {
		t.Fatal("期望 Store 目录不为空")
	}
	if st.Exists("missing.json") {
		t.Fatal("不存在的文件不应返回 Exists=true")
	}

	err := st.Load("missing.json", &payload)
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("期望返回 os.ErrNotExist，实际是 %v", err)
	}
}

func TestStoreUsesUnifiedStateDatabaseFile(t *testing.T) {
	baseDir := t.TempDir()
	st := store.New(baseDir)
	t.Cleanup(func() {
		_ = st.Close()
	})
	if err := st.Save("nested/config.json", map[string]any{"ok": true}); err != nil {
		t.Fatalf("写入统一状态库失败: %v", err)
	}

	if _, err := os.Stat(filepath.Join(baseDir, store.DefaultDatabaseFileName)); err != nil {
		t.Fatalf("期望状态存储创建统一数据库文件，实际错误: %v", err)
	}
	if _, err := os.Stat(filepath.Join(baseDir, "nested", "config.json")); !os.IsNotExist(err) {
		t.Fatalf("期望不再直接写出旧 JSON 文件路径，实际 err=%v", err)
	}
}

func TestStoreInitializesSchemaVersion(t *testing.T) {
	baseDir := t.TempDir()
	st := store.New(baseDir)
	t.Cleanup(func() {
		_ = st.Close()
	})

	db, err := sql.Open("sqlite", filepath.Join(baseDir, store.DefaultDatabaseFileName))
	if err != nil {
		t.Fatalf("打开状态库失败: %v", err)
	}
	defer db.Close()

	var value string
	if err := db.QueryRow(`SELECT value FROM schema_meta WHERE key = 'schema_version'`).Scan(&value); err != nil {
		t.Fatalf("读取状态库 schema version 失败: %v", err)
	}
	if value != "1" {
		t.Fatalf("期望状态库 schema version 为 1，实际是 %q", value)
	}
}

func TestStoreDoesNotImportLegacyJSONFilesOnStartup(t *testing.T) {
	baseDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(baseDir, "config.json"), []byte(`{"admin_key":"legacy"}`), 0600); err != nil {
		t.Fatalf("写入旧版 config.json 失败: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(baseDir, "stats"), 0700); err != nil {
		t.Fatalf("创建旧版 stats 目录失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(baseDir, "stats", "all.json"), []byte(`{"openai":{"success_count":1}}`), 0600); err != nil {
		t.Fatalf("写入旧版 stats/all.json 失败: %v", err)
	}

	st := store.New(baseDir)
	t.Cleanup(func() {
		_ = st.Close()
	})

	if st.Exists("config.json") {
		t.Fatal("期望启动时不再把旧版 config.json 导入统一状态库")
	}
	if st.Exists("stats/all.json") {
		t.Fatal("期望启动时不再把旧版 stats/all.json 导入统一状态库")
	}

	var loaded map[string]any
	err := st.Load("config.json", &loaded)
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("期望旧版 config.json 不会被自动导入，实际错误: %v", err)
	}
}

func TestStatsManagerFlushesOnStopAndRestoresOnRestart(t *testing.T) {
	st := store.New(t.TempDir())

	first := stats.NewManager(st)
	first.RecordSuccess("openai", 11, 7)
	first.RecordError("openai", 401)
	first.RecordCacheHit("openai", 18)
	first.RecordSuccess("gemini", 5, 3)
	first.Stop()

	if !st.Exists("stats/all.json") {
		t.Fatal("期望 Stop 后写出 stats/all.json")
	}

	second := stats.NewManager(st)
	defer second.Stop()

	snapshot := second.Snapshot()
	openai := snapshot["openai"]
	if openai.SuccessCount != 1 || openai.ErrorCount != 1 {
		t.Fatalf("期望恢复 openai 成功和失败计数，实际是 %+v", openai)
	}
	if openai.InputTokens != 11 || openai.OutputTokens != 7 {
		t.Fatalf("期望恢复 openai token 计数，实际是 %+v", openai)
	}
	if openai.CacheHits != 1 || openai.CacheTokens != 18 {
		t.Fatalf("期望恢复 openai 缓存计数，实际是 %+v", openai)
	}
	if openai.ErrorTypes["401"] != 1 {
		t.Fatalf("期望恢复 openai 401 错误计数，实际是 %+v", openai.ErrorTypes)
	}

	gemini := snapshot["gemini"]
	if gemini.SuccessCount != 1 || gemini.InputTokens != 5 || gemini.OutputTokens != 3 {
		t.Fatalf("期望恢复 gemini 统计，实际是 %+v", gemini)
	}
}
