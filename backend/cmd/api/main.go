// Package main is the entry point for the ETFs Simulator API server.
// It wires together all dependencies and starts the HTTP server.
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
// It returns an error if any component fails to initialize or if the server
// encounters an unrecoverable error.
//
// The function follows this initialization order:
//  1. Load configuration from environment
//  2. Initialize structured logger
//  3. Create HTTP handlers
//  4. Start HTTP server with graceful shutdown
func run() error {
	// Load configuration
	cfg, err := config.Load()
	if errors.Check(err) {
		return errors.Wrap(err, "failed to load configuration")
	}

	// Initialize global logger based on environment
	if cfg.IsDevelopment() {
		logger.InitDevelopment()
	} else {
		logger.InitProduction()
	}

	slog.Info("starting application",
		slog.String("env", cfg.Env),
		slog.String("addr", cfg.Server.Addr()),
	)

	// Create HTTP handler with all routes
	h := handler.New()

	// Create and configure the server
	srv := server.New(server.Options{
		Addr:            cfg.Server.Addr(),
		Handler:         h,
		ReadTimeout:     cfg.Server.ReadTimeout,
		WriteTimeout:    cfg.Server.WriteTimeout,
		IdleTimeout:     cfg.Server.IdleTimeout,
		ShutdownTimeout: cfg.Server.ShutdownTimeout,
	})

	// Run the server (blocks until shutdown signal)
	return srv.Run(context.Background())
}
