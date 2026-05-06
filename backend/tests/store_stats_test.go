package tests

import (
	"errors"
	"os"
	"testing"

	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestStore可以保存加载并检查文件存在(t *testing.T) {
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

func TestStore读取不存在文件时返回NotExist(t *testing.T) {
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

func TestStatsManager会在Stop时刷新并在重启后恢复(t *testing.T) {
	st := store.New(t.TempDir())

	first := stats.NewManager(st)
	first.RecordSuccess("openai", 11, 7)
	first.RecordError("openai")
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

	gemini := snapshot["gemini"]
	if gemini.SuccessCount != 1 || gemini.InputTokens != 5 || gemini.OutputTokens != 3 {
		t.Fatalf("期望恢复 gemini 统计，实际是 %+v", gemini)
	}
}
