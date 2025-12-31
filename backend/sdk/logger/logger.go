// Package logger provides structured logging configuration for the application.
// It wraps the standard library's slog package with environment-aware defaults.
//
// Usage:
//
//	// In main.go, initialize once:
//	logger.InitDevelopment() // or logger.InitProduction()
//
//	// Anywhere in your code, use slog directly:
//	slog.Info("user logged in", slog.String("user_id", id))
//	slog.Error("failed to process", slog.Any("error", err))
package logger

import (
	"io"
	"log/slog"
	"os"
)

// Options contains configuration for creating a new logger.
type Options struct {
	// Level is the minimum log level to output.
	Level slog.Level

	// Output is the destination for log output (defaults to os.Stdout).
	Output io.Writer
}

// New creates a new structured logger with the provided options.
// It returns a configured slog.Logger ready for use.
func New(opts Options) *slog.Logger {
	output := opts.Output
	if output == nil {
		output = os.Stdout
	}

	handlerOpts := &slog.HandlerOptions{
		Level: opts.Level,
	}

	return slog.New(slog.NewTextHandler(output, handlerOpts))
}

// Init creates a logger with the given options and sets it as the global default.
// After calling Init, you can use slog.Info(), slog.Error(), etc. anywhere.
func Init(opts Options) {
	slog.SetDefault(New(opts))
}

// InitDevelopment sets up a global development logger (debug level).
func InitDevelopment() {
	Init(Options{Level: slog.LevelDebug})
}

// InitProduction sets up a global production logger (info level).
func InitProduction() {
	Init(Options{Level: slog.LevelInfo})
}
