package tests

import (
	"testing"

	"simple-api-pool/adminapi"
)

func TestConfigServiceSnapshotReflectsCurrentGlobalConfig(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", true, []string{"client-1", "client-2"}); err != nil {
		t.Fatalf("准备全局配置失败: %v", err)
	}

	service := adminapi.NewConfigService(cfg)
	snapshot := service.Snapshot()
	if !snapshot.AdminKeyConfigured {
		t.Fatal("期望快照显示已配置管理员密钥")
	}
	if !snapshot.TokenEstimationEnabled {
		t.Fatal("期望快照显示已启用 token 估算")
	}
	if snapshot.ClientKeyCount != 2 {
		t.Fatalf("期望客户端密钥数量为 2，实际是 %d", snapshot.ClientKeyCount)
	}
}

func TestConfigServiceUpdateValidatesAdminKeyAndTrimsClientKeys(t *testing.T) {
	cfg := newTestConfig(t)
	service := adminapi.NewConfigService(cfg)

	if _, err := service.Update(adminapi.GlobalConfigUpdateInput{
		AdminKey: stringPointer("   "),
	}); err == nil {
		t.Fatal("期望空白管理员密钥被拒绝")
	}

	changedAdminKey, err := service.Update(adminapi.GlobalConfigUpdateInput{
		AdminKey:               stringPointer(" next-admin "),
		TokenEstimationEnabled: boolPointer(true),
		ClientKeys:             &[]string{" client-1 ", "", "client-2"},
	})
	if err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	if !changedAdminKey {
		t.Fatal("期望本次更新标记管理员密钥已变化")
	}

	snapshot := cfg.GlobalConfig()
	if snapshot.AdminKey != "next-admin" {
		t.Fatalf("期望管理员密钥已去空格保存，实际是 %q", snapshot.AdminKey)
	}
	if !snapshot.TokenEstimationEnabled {
		t.Fatal("期望 token 估算状态已更新")
	}
	if len(snapshot.ClientKeys) != 2 || snapshot.ClientKeys[0] != "client-1" || snapshot.ClientKeys[1] != "client-2" {
		t.Fatalf("期望客户端密钥已去空白保存，实际是 %+v", snapshot.ClientKeys)
	}
}

func stringPointer(value string) *string {
	return &value
}

func boolPointer(value bool) *bool {
	return &value
}
