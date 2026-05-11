package proxyapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
)

func isDownstreamDisconnect(ctx context.Context, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, http.ErrAbortHandler) {
		return true
	}
	if errors.Is(err, io.ErrClosedPipe) {
		return true
	}
	if ctx != nil && errors.Is(ctx.Err(), context.Canceled) {
		return true
	}

	message := strings.ToLower(err.Error())
	for _, marker := range []string{
		"client disconnected",
		"broken pipe",
		"connection reset by peer",
		"use of closed network connection",
	} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}
