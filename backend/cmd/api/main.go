// Package main is the entry point for the ETFs Simulator API server.
//
//	@title			ETFs Simulator API
//	@version		1.0
//	@description	Simple investment growth simulator
//	@host			localhost:8080
//	@BasePath		/
//	@schemes		http
//	@produce		json
//	@consumes		json
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/abdonasmane/etfs-simulator/backend/internal/config"
	"github.com/abdonasmane/etfs-simulator/backend/internal/handler"
	"github.com/abdonasmane/etfs-simulator/backend/internal/server"
	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
	"github.com/abdonasmane/etfs-simulator/backend/sdk/logger"
)

func main() {
	if err := run(); errors.Check(err) {
		slog.Error("application error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

// run initializes and runs the application.
func run() error {
	// Load configuration
	cfg, err := config.Load()
	if errors.Check(err) {
		return errors.Wrap(err, "failed to load configuration")
	}

	// Initialize logger
	if cfg.IsDevelopment() {
		logger.InitDevelopment()
	} else {
		logger.InitProduction()
	}

	slog.Info("starting application",
		slog.String("env", cfg.Env),
		slog.String("addr", cfg.Server.Addr()),
	)

	// Create HTTP handler
	h := handler.New()

	// Create and start server
	srv := server.New(server.Options{
		Addr:            cfg.Server.Addr(),
		Handler:         h,
		ReadTimeout:     cfg.Server.ReadTimeout,
		WriteTimeout:    cfg.Server.WriteTimeout,
		IdleTimeout:     cfg.Server.IdleTimeout,
		ShutdownTimeout: cfg.Server.ShutdownTimeout,
	})

	return srv.Run(context.Background())
}
