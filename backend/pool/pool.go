package pool

import "sync"

type API struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type Pool struct {
	mu   sync.RWMutex
	apis []API
}

func New() *Pool {
	return &Pool{
		apis: make([]API, 0),
	}
}

func (p *Pool) List() []API {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make([]API, len(p.apis))
	copy(result, p.apis)
	return result
}

func (p *Pool) Add(api API) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.apis = append(p.apis, api)
}
