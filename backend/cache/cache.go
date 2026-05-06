package cache

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"simple-api-pool/config"
)

type Entry struct {
	ResponseBody     string            `json:"response_body"`
	StatusCode       int               `json:"status_code"`
	Headers          map[string]string `json:"headers"`
	CachedBody       []byte            `json:"-"`
	CachedStreamBody []byte            `json:"-"`
	InputTokens      int64             `json:"input_tokens"`
	OutputTokens     int64             `json:"output_tokens"`
}

type Store struct {
	basePath string
	mu       sync.Mutex
	dbs      map[string]*sql.DB
}

func NewStore(basePath string) *Store {
	os.MkdirAll(basePath, 0700)
	return &Store{
		basePath: basePath,
		dbs:      make(map[string]*sql.DB),
	}
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var firstErr error
	for name, db := range s.dbs {
		if err := db.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
		delete(s.dbs, name)
	}
	return firstErr
}

func (s *Store) dir(provider string) string {
	return filepath.Join(s.basePath, provider)
}

func (s *Store) file(provider string) string {
	return filepath.Join(s.dir(provider), "cache.db")
}

func hash(model string, body []byte) string {
	h := sha256.New()
	h.Write([]byte(model + "|"))
	h.Write(body)
	return fmt.Sprintf("%x", h.Sum(nil))
}

func (s *Store) Get(providerName string, providerType config.ProviderType, model string, body []byte) (*Entry, bool) {
	db, err := s.dbFor(providerName)
	if err != nil {
		return nil, false
	}

	cacheKey := hash(model, normalizeBodyForCache(providerType, body))
	row := db.QueryRow(`
		SELECT response_body, status_code, headers_json, cached_body, cached_stream_body, input_tokens, output_tokens
		FROM cache_entries
		WHERE cache_key = ?
	`, cacheKey)

	var (
		responseBody     string
		statusCode       int
		headersJSON      string
		cachedBody       []byte
		cachedStreamBody []byte
		inputTokens      int64
		outputTokens     int64
	)
	if err := row.Scan(&responseBody, &statusCode, &headersJSON, &cachedBody, &cachedStreamBody, &inputTokens, &outputTokens); err != nil {
		return nil, false
	}

	headers := make(map[string]string)
	if err := json.Unmarshal([]byte(headersJSON), &headers); err != nil {
		return nil, false
	}
	if len(cachedBody) == 0 || len(cachedStreamBody) == 0 {
		cachedBody, cachedStreamBody = PrepareCachedBodies(providerType, []byte(responseBody), inputTokens, outputTokens)
	}

	return &Entry{
		ResponseBody:     responseBody,
		StatusCode:       statusCode,
		Headers:          headers,
		CachedBody:       cachedBody,
		CachedStreamBody: cachedStreamBody,
		InputTokens:      inputTokens,
		OutputTokens:     outputTokens,
	}, true
}

func (s *Store) Set(providerName string, providerType config.ProviderType, model string, body, responseBody []byte, statusCode int, headers map[string]string, inputTokens, outputTokens, maxEntries int64) {
	db, err := s.dbFor(providerName)
	if err != nil {
		return
	}

	headersJSON, cachedBody, cachedStreamBody, err := prepareCachedMetadata(headers, providerType, responseBody, inputTokens, outputTokens)
	if err != nil {
		return
	}

	tx, err := db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()

	cacheKey := hash(model, normalizeBodyForCache(providerType, body))
	now := time.Now().UnixNano()

	if _, err := tx.Exec(`
		INSERT INTO cache_entries (
			cache_key, response_body, status_code, headers_json, cached_body, cached_stream_body, input_tokens, output_tokens, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(cache_key) DO UPDATE SET
			response_body = excluded.response_body,
			status_code = excluded.status_code,
			headers_json = excluded.headers_json,
			cached_body = excluded.cached_body,
			cached_stream_body = excluded.cached_stream_body,
			input_tokens = excluded.input_tokens,
			output_tokens = excluded.output_tokens,
			updated_at = excluded.updated_at
	`, cacheKey, string(responseBody), statusCode, string(headersJSON), cachedBody, cachedStreamBody, inputTokens, outputTokens, now); err != nil {
		return
	}

	if maxEntries > 0 {
		var count int64
		if err := tx.QueryRow(`SELECT COUNT(*) FROM cache_entries`).Scan(&count); err != nil {
			return
		}
		if count > maxEntries {
			deleteCount := count - maxEntries
			if _, err := tx.Exec(`
				DELETE FROM cache_entries
				WHERE cache_key IN (
					SELECT cache_key
					FROM cache_entries
					ORDER BY updated_at ASC
					LIMIT ?
				)
			`, deleteCount); err != nil {
				return
			}
		}
	}

	_ = tx.Commit()
}

func (s *Store) dbFor(provider string) (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if db, ok := s.dbs[provider]; ok {
		return db, nil
	}

	dir := s.dir(provider)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", s.file(provider))
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := initializeDB(db); err != nil {
		db.Close()
		return nil, err
	}

	s.dbs[provider] = db
	return db, nil
}

func initializeDB(db *sql.DB) error {
	statements := []string{
		`PRAGMA journal_mode=WAL;`,
		`PRAGMA synchronous=NORMAL;`,
		`PRAGMA busy_timeout=5000;`,
		`PRAGMA mmap_size=0;`,
		`PRAGMA cache_size=-1024;`,
		`CREATE TABLE IF NOT EXISTS cache_entries (
			cache_key TEXT PRIMARY KEY,
			response_body TEXT NOT NULL,
			status_code INTEGER NOT NULL,
			headers_json TEXT NOT NULL,
			stream_headers_json TEXT NOT NULL DEFAULT '{}',
			cached_body BLOB NOT NULL DEFAULT '',
			cached_stream_body BLOB NOT NULL DEFAULT '',
			input_tokens INTEGER NOT NULL,
			output_tokens INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_cache_entries_updated_at ON cache_entries(updated_at);`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	migrations := []struct {
		name string
		sql  string
	}{
		{name: "stream_headers_json", sql: `ALTER TABLE cache_entries ADD COLUMN stream_headers_json TEXT NOT NULL DEFAULT '{}'`},
		{name: "cached_body", sql: `ALTER TABLE cache_entries ADD COLUMN cached_body BLOB NOT NULL DEFAULT ''`},
		{name: "cached_stream_body", sql: `ALTER TABLE cache_entries ADD COLUMN cached_stream_body BLOB NOT NULL DEFAULT ''`},
	}
	for _, migration := range migrations {
		if err := ensureColumn(db, migration.name, migration.sql); err != nil {
			return err
		}
	}
	return nil
}

func ensureColumn(db *sql.DB, columnName, migrationSQL string) error {
	rows, err := db.Query(`PRAGMA table_info(cache_entries)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid        int
			name       string
			ctype      string
			notNull    int
			defaultV   any
			primaryKey int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &defaultV, &primaryKey); err != nil {
			return err
		}
		if name == columnName {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	_, err = db.Exec(migrationSQL)
	return err
}

func normalizeBodyForCache(providerType config.ProviderType, body []byte) []byte {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}

	delete(payload, "stream")
	delete(payload, "stream_options")

	key := cacheFieldForProviderType(providerType)
	if key == "" {
		normalized, err := json.Marshal(payload)
		if err != nil {
			return body
		}
		return normalized
	}

	normalized, err := json.Marshal(map[string]any{
		key: payload[key],
	})
	if err != nil {
		return body
	}
	return normalized
}

func cacheFieldForProviderType(providerType config.ProviderType) string {
	switch providerType {
	case config.OpenAIChat, config.Claude:
		return "messages"
	case config.OpenAIResponses:
		return "input"
	case config.Gemini:
		return "contents"
	default:
		return ""
	}
}
