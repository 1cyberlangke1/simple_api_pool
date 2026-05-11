package adminapi

import (
	"os"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type GroupService struct {
	cfg   *config.Config
	stats *stats.Manager
	cache *cache.Store
}

func NewGroupService(cfg *config.Config, statsManager *stats.Manager, cacheStore *cache.Store) *GroupService {
	return &GroupService{
		cfg:   cfg,
		stats: statsManager,
		cache: cacheStore,
	}
}

func (service *GroupService) ListSnapshots() []AdminGroupSnapshot {
	return buildAdminGroupSnapshots(service.cfg.Groups())
}

func (service *GroupService) SaveGroup(group config.Group) (AdminGroupSnapshot, bool, error) {
	existingGroup, _ := service.cfg.Group(group.Name)
	created := existingGroup == nil
	if err := service.cfg.SaveGroup(group); err != nil {
		return AdminGroupSnapshot{}, false, err
	}
	savedGroup, _ := service.cfg.Group(group.Name)
	if savedGroup == nil {
		return AdminGroupSnapshot{}, created, os.ErrNotExist
	}
	logAdminAudit("group_save",
		"group", savedGroup.Name,
		"group_type", savedGroup.Type,
		"created", created,
		"cache_enabled", savedGroup.CacheEnabled,
		"cache_max_entries", savedGroup.CacheMaxEntries,
	)
	return buildAdminGroupSnapshot(*savedGroup), created, nil
}

func (service *GroupService) GetSnapshot(groupName string) (AdminGroupSnapshot, error) {
	group, _ := service.cfg.Group(groupName)
	if group == nil {
		return AdminGroupSnapshot{}, os.ErrNotExist
	}
	return buildAdminGroupSnapshot(*group), nil
}

func (service *GroupService) DeleteGroup(groupName string) error {
	if service.cache != nil {
		if err := service.cache.ClearProvider(groupName); err != nil {
			return err
		}
	}
	if err := service.cfg.DeleteGroup(groupName); err != nil {
		return err
	}
	if service.stats != nil {
		service.stats.RemoveProvider(groupName)
	}
	logAdminAudit("group_delete", "group", groupName)
	return nil
}
