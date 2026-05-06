package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Store struct {
	mu      sync.Mutex
	baseDir string
}

func New(baseDir string) *Store {
	os.MkdirAll(baseDir, 0700)
	return &Store{baseDir: baseDir}
}

func (s *Store) Dir() string { return s.baseDir }

func (s *Store) Load(path string, v any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fullPath := filepath.Join(s.baseDir, path)
	data, err := os.ReadFile(fullPath)
	if os.IsNotExist(err) {
		return err
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func (s *Store) Save(path string, v any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fullPath := filepath.Join(s.baseDir, path)
	dir := filepath.Dir(fullPath)
	os.MkdirAll(dir, 0700)
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := fullPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmpPath, fullPath)
}

func (s *Store) Exists(path string) bool {
	fullPath := filepath.Join(s.baseDir, path)
	_, err := os.Stat(fullPath)
	return err == nil
}
