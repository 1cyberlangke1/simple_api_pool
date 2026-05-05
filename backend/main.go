package main

import (
	"log"
	"net/http"

	"simple-api-pool/handler"
	"simple-api-pool/pool"
)

func main() {
	apiPool := pool.New()

	mux := http.NewServeMux()
	handler.Register(mux, apiPool)

	addr := ":8080"
	log.Printf("simple-api-pool listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
