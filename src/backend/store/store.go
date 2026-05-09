package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type Store struct {
	mu        sync.Mutex
	fileLocks map[string]*sync.RWMutex
	baseDir   string
}

func New(baseDir string) *Store {
	os.MkdirAll(baseDir, 0700)
	return &Store{
		baseDir:   baseDir,
		fileLocks: make(map[string]*sync.RWMutex),
	}
}

func (s *Store) Dir() string { return s.baseDir }

func (s *Store) Load(path string, v any) error {
	fullPath := filepath.Join(s.baseDir, path)
	lock := s.lockForPath(fullPath)
	lock.RLock()
	defer lock.RUnlock()

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
	fullPath := filepath.Join(s.baseDir, path)
	lock := s.lockForPath(fullPath)
	lock.Lock()
	defer lock.Unlock()

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tempFile, err := os.CreateTemp(dir, filepath.Base(fullPath)+".*.tmp")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(data); err != nil {
		tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, fullPath)
}

func (s *Store) Exists(path string) bool {
	fullPath := filepath.Join(s.baseDir, path)
	lock := s.lockForPath(fullPath)
	lock.RLock()
	defer lock.RUnlock()

	_, err := os.Stat(fullPath)
	return err == nil
}

func (s *Store) lockForPath(fullPath string) *sync.RWMutex {
	s.mu.Lock()
	defer s.mu.Unlock()

	lock, exists := s.fileLocks[fullPath]
	if exists {
		return lock
	}
	lock = &sync.RWMutex{}
	s.fileLocks[fullPath] = lock
	return lock
}

func IsNotExist(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}
