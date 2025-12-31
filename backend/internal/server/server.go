// Package server provides HTTP server initialization and lifecycle management.
// It handles graceful shutdown and signal handling for production deployments.
package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Server wraps an HTTP server with graceful shutdown capabilities.
type Server struct {
	httpServer      *http.Server
	shutdownTimeout time.Duration
}

// Options contains all parameters needed to create a new Server.
type Options struct {
	// Addr is the address to listen on (e.g., ":8080" or "0.0.0.0:8080").
	Addr string

	// Handler is the HTTP handler to use for all requests.
	Handler http.Handler

	// ReadTimeout is the maximum duration for reading the entire request.
	ReadTimeout time.Duration

	// WriteTimeout is the maximum duration before timing out writes of the response.
	WriteTimeout time.Duration

	// IdleTimeout is the maximum duration to wait for the next request.
	IdleTimeout time.Duration

	// ShutdownTimeout is the maximum duration to wait for active connections to close.
	ShutdownTimeout time.Duration
}

// New creates a new Server with the provided options.
// The server is configured but not started until Run is called.
func New(opts Options) *Server {
	httpServer := &http.Server{
		Addr:         opts.Addr,
		Handler:      opts.Handler,
		ReadTimeout:  opts.ReadTimeout,
		WriteTimeout: opts.WriteTimeout,
		IdleTimeout:  opts.IdleTimeout,
	}

	return &Server{
		httpServer:      httpServer,
		shutdownTimeout: opts.ShutdownTimeout,
	}
}

// Run starts the HTTP server and blocks until a shutdown signal is received.
// It handles SIGINT and SIGTERM for graceful shutdown.
// Returns an error if the server fails to start or shutdown gracefully.
func (s *Server) Run(ctx context.Context) error {
	// Channel to capture server errors
	serverErrors := make(chan error, 1)

	// Start the server in a goroutine
	go func() {
		slog.Info("starting HTTP server",
			slog.String("addr", s.httpServer.Addr),
		)
		if err := s.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	// Set up signal handling for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Wait for either a server error, context cancellation, or shutdown signal
	select {
	case err := <-serverErrors:
		return fmt.Errorf("server error: %w", err)

	case <-ctx.Done():
		slog.Info("context cancelled, initiating shutdown")

	case sig := <-quit:
		slog.Info("shutdown signal received",
			slog.String("signal", sig.String()),
		)
	}

	// Initiate graceful shutdown
	return s.shutdown()
}

// shutdown gracefully shuts down the server with a timeout.
func (s *Server) shutdown() error {
	slog.Info("shutting down server",
		slog.Duration("timeout", s.shutdownTimeout),
	)

	ctx, cancel := context.WithTimeout(context.Background(), s.shutdownTimeout)
	defer cancel()

	if err := s.httpServer.Shutdown(ctx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	slog.Info("server stopped gracefully")
	return nil
}
