package config

import "os"

const DefaultListenPort = "18080"

func ListenAddr() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultListenPort
	}
	return ":" + port
}
