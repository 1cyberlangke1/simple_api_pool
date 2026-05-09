package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const DefaultDatabaseFileName = "simple-api-pool.db"
const CurrentSchemaVersion = 1

type Store struct {
	baseDir string
	mu      sync.RWMutex
	initErr error
}

func New(baseDir string) *Store {
	store := &Store{baseDir: baseDir}
	if err := os.MkdirAll(baseDir, 0700); err != nil {
		store.initErr = err
		return store
	}

	db, err := openDatabase(baseDir)
	if err != nil {
		store.initErr = err
		return store
	}
	defer db.Close()

	if err := initializeDatabase(db); err != nil {
		_ = db.Close()
		store.initErr = err
		return store
	}

	if err := migrateLegacyDocuments(db, baseDir); err != nil {
		store.initErr = err
		return store
	}
	return store
}

func DatabasePath(baseDir string) string {
	return filepath.Join(baseDir, DefaultDatabaseFileName)
}

func (s *Store) Dir() string { return s.baseDir }

func (s *Store) Err() error {
	if s == nil {
		return nil
	}
	return s.initErr
}

func (s *Store) Close() error {
	return nil
}

func (s *Store) Load(path string, v any) error {
	if err := s.Err(); err != nil {
		return err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	db, err := openDatabase(s.baseDir)
	if err != nil {
		return err
	}
	defer db.Close()

	var payload []byte
	err = db.QueryRow(`SELECT payload FROM documents WHERE path = ?`, normalizePath(path)).Scan(&payload)
	if errors.Is(err, sql.ErrNoRows) {
		return os.ErrNotExist
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, v)
}

func (s *Store) Save(path string, v any) error {
	if err := s.Err(); err != nil {
		return err
	}

	payload, err := json.Marshal(v)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	db, err := openDatabase(s.baseDir)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`
		INSERT INTO documents(path, payload, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			payload = excluded.payload,
			updated_at = excluded.updated_at
	`, normalizePath(path), payload, time.Now().UnixNano())
	return err
}

func (s *Store) Exists(path string) bool {
	if s.Err() != nil {
		return false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	db, err := openDatabase(s.baseDir)
	if err != nil {
		return false
	}
	defer db.Close()

	var exists int
	err = db.QueryRow(`SELECT 1 FROM documents WHERE path = ? LIMIT 1`, normalizePath(path)).Scan(&exists)
	return err == nil
}

func IsNotExist(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}

func initializeDatabase(db *sql.DB) error {
	statements := []string{
		`PRAGMA journal_mode=WAL;`,
		`PRAGMA synchronous=NORMAL;`,
		`PRAGMA busy_timeout=5000;`,
		`CREATE TABLE IF NOT EXISTS schema_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);`,
		fmt.Sprintf(`INSERT INTO schema_meta(key, value) VALUES ('schema_version', '%d')
			ON CONFLICT(key) DO UPDATE SET value = excluded.value;`, CurrentSchemaVersion),
		`CREATE TABLE IF NOT EXISTS documents (
			path TEXT PRIMARY KEY,
			payload BLOB NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

func openDatabase(baseDir string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", DatabasePath(baseDir))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	return db, nil
}

func migrateLegacyDocuments(db *sql.DB, baseDir string) error {
	// Migration-only compatibility path: import legacy JSON state files into the
	// unified state database on startup when they still exist on disk. This is
	// intentionally kept out of the normal read/write path and can be removed
	// after the legacy file-based state format is fully retired.
	legacyPaths := []string{
		"config.json",
		filepath.Join("stats", "all.json"),
	}
	for _, legacyPath := range legacyPaths {
		normalizedPath := normalizePath(legacyPath)
		var exists int
		err := db.QueryRow(`SELECT 1 FROM documents WHERE path = ? LIMIT 1`, normalizedPath).Scan(&exists)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		diskPath := filepath.Join(baseDir, filepath.FromSlash(normalizedPath))
		content, readErr := os.ReadFile(diskPath)
		if errors.Is(readErr, os.ErrNotExist) {
			continue
		}
		if readErr != nil {
			return readErr
		}
		if !json.Valid(content) {
			return errors.New("legacy document is not valid JSON: " + normalizedPath)
		}
		if _, err := db.Exec(`
			INSERT INTO documents(path, payload, updated_at)
			VALUES (?, ?, ?)
			ON CONFLICT(path) DO NOTHING
		`, normalizedPath, content, time.Now().UnixNano()); err != nil {
			return err
		}
	}
	return nil
}

func normalizePath(path string) string {
	return filepath.ToSlash(filepath.Clean(path))
}
