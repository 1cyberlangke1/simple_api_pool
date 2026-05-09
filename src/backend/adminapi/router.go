package adminapi

import (
	"errors"
	"strings"
)

type RouteOperation string

const (
	RouteOperationLogin            RouteOperation = "login"
	RouteOperationLogout           RouteOperation = "logout"
	RouteOperationOverview         RouteOperation = "overview"
	RouteOperationProviders        RouteOperation = "providers"
	RouteOperationProvider         RouteOperation = "provider"
	RouteOperationProviderKeys     RouteOperation = "provider_keys"
	RouteOperationProviderKey      RouteOperation = "provider_key"
	RouteOperationProviderKeysBulk RouteOperation = "provider_keys_bulk"
	RouteOperationProviderCache    RouteOperation = "provider_cache"
	RouteOperationConfig           RouteOperation = "config"
)

type Route struct {
	Operation    RouteOperation
	ProviderName string
	KeyName      string
}

func ParseRoute(method, requestPath string) (Route, error) {
	_ = method
	path := strings.TrimPrefix(requestPath, "/api/admin")
	path = strings.TrimPrefix(path, "/")

	switch path {
	case "login":
		return Route{Operation: RouteOperationLogin}, nil
	case "logout":
		return Route{Operation: RouteOperationLogout}, nil
	case "overview":
		return Route{Operation: RouteOperationOverview}, nil
	case "providers":
		return Route{Operation: RouteOperationProviders}, nil
	case "config":
		return Route{Operation: RouteOperationConfig}, nil
	}

	if !strings.HasPrefix(path, "providers/") {
		return Route{}, errors.New("unknown admin route")
	}

	rest := strings.TrimPrefix(path, "providers/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return Route{}, errors.New("invalid provider route")
	}

	route := Route{ProviderName: parts[0]}
	switch {
	case len(parts) == 1:
		route.Operation = RouteOperationProvider
	case len(parts) == 2 && parts[1] == "keys":
		route.Operation = RouteOperationProviderKeys
	case len(parts) == 3 && parts[1] == "keys" && parts[2] == "bulk":
		route.Operation = RouteOperationProviderKeysBulk
	case len(parts) == 2 && parts[1] == "cache":
		route.Operation = RouteOperationProviderCache
	case len(parts) == 2:
		route.Operation = RouteOperationProviderKey
		route.KeyName = parts[1]
	default:
		return Route{}, errors.New("unknown provider route")
	}

	return route, nil
}
