package cachekeyjson

import (
	"sort"
	"strconv"

	"github.com/tidwall/gjson"
)

func CanonicalizeField(body []byte, field string) []byte {
	rawValue := gjson.GetBytes(body, field)
	if !rawValue.Exists() {
		return []byte(`{"` + field + `":null}`)
	}

	normalized := make([]byte, 0, len(field)+len(rawValue.Raw)+5)
	normalized = append(normalized, '{')
	normalized = append(normalized, strconv.Quote(field)...)
	normalized = append(normalized, ':')
	normalized = appendCanonicalValue(normalized, rawValue)
	normalized = append(normalized, '}')
	return normalized
}

func CanonicalizeTopLevelWithoutFields(body []byte, ignoredFields map[string]struct{}) []byte {
	parsed := gjson.ParseBytes(body)
	if !parsed.IsObject() {
		return body
	}

	normalized := make([]byte, 0, len(body))
	normalized = append(normalized, '{')
	keys := make([]string, 0)
	values := make(map[string]gjson.Result)
	parsed.ForEach(func(key, value gjson.Result) bool {
		if _, ignored := ignoredFields[key.Str]; ignored {
			return true
		}
		keys = append(keys, key.Str)
		values[key.Str] = value
		return true
	})
	sort.Strings(keys)
	for index, key := range keys {
		if index > 0 {
			normalized = append(normalized, ',')
		}
		normalized = append(normalized, strconv.Quote(key)...)
		normalized = append(normalized, ':')
		normalized = appendCanonicalValue(normalized, values[key])
	}
	normalized = append(normalized, '}')
	return normalized
}

func appendCanonicalValue(dst []byte, value gjson.Result) []byte {
	switch {
	case value.IsObject():
		return appendCanonicalObject(dst, value)
	case value.IsArray():
		return appendCanonicalArray(dst, value)
	default:
		return append(dst, value.Raw...)
	}
}

func appendCanonicalObject(dst []byte, value gjson.Result) []byte {
	keys := make([]string, 0)
	values := make(map[string]gjson.Result)
	value.ForEach(func(key, child gjson.Result) bool {
		keys = append(keys, key.Str)
		values[key.Str] = child
		return true
	})
	sort.Strings(keys)

	dst = append(dst, '{')
	for index, key := range keys {
		if index > 0 {
			dst = append(dst, ',')
		}
		dst = append(dst, strconv.Quote(key)...)
		dst = append(dst, ':')
		dst = appendCanonicalValue(dst, values[key])
	}
	dst = append(dst, '}')
	return dst
}

func appendCanonicalArray(dst []byte, value gjson.Result) []byte {
	dst = append(dst, '[')
	index := 0
	value.ForEach(func(_, child gjson.Result) bool {
		if index > 0 {
			dst = append(dst, ',')
		}
		dst = appendCanonicalValue(dst, child)
		index++
		return true
	})
	dst = append(dst, ']')
	return dst
}
