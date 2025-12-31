// Package errors provides meaningful error handling utilities.
// It replaces verbose "if err != nil" patterns with expressive functions.
package errors

import (
	"errors"
	"fmt"
	"strings"
)

// Check returns true if the error is not nil.
// Use this instead of "if err != nil" for cleaner conditionals.
//
// Example:
//
//	if errors.Check(err) {
//	    return err
//	}
func Check(err error) bool {
	return err != nil
}

// CheckAny returns true if any of the provided errors is not nil.
// Useful for validating multiple operations at once.
//
// Example:
//
//	if errors.CheckAny(err1, err2, err3) {
//	    // at least one error occurred
//	}
func CheckAny(errs ...error) bool {
	for _, err := range errs {
		if err != nil {
			return true
		}
	}
	return false
}

// CheckAll returns true only if all provided errors are not nil.
// Useful when all operations must fail together.
func CheckAll(errs ...error) bool {
	if len(errs) == 0 {
		return false
	}
	for _, err := range errs {
		if err == nil {
			return false
		}
	}
	return true
}

// Collect returns a slice containing only the non-nil errors.
// Useful for gathering all errors from multiple operations.
//
// Example:
//
//	errs := errors.Collect(err1, err2, err3)
//	if len(errs) > 0 {
//	    // handle multiple errors
//	}
func Collect(errs ...error) []error {
	var result []error
	for _, err := range errs {
		if err != nil {
			result = append(result, err)
		}
	}
	return result
}

// Combine combines multiple errors into a single error.
// Returns nil if all errors are nil.
// If only one error is non-nil, returns that error.
// Otherwise, returns a combined error with all messages.
//
// Example:
//
//	if err := errors.Combine(err1, err2, err3); errors.Check(err) {
//	    return err // contains all error messages
//	}
func Combine(errs ...error) error {
	nonNil := Collect(errs...)
	switch len(nonNil) {
	case 0:
		return nil
	case 1:
		return nonNil[0]
	default:
		msgs := make([]string, len(nonNil))
		for i, err := range nonNil {
			msgs[i] = err.Error()
		}
		return fmt.Errorf("multiple errors: [%s]", strings.Join(msgs, "; "))
	}
}

// Wrap wraps an error with additional context.
// Returns nil if the error is nil.
//
// Example:
//
//	return errors.Wrap(err, "failed to load config")
func Wrap(err error, message string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", message, err)
}

// Wrapf wraps an error with a formatted message.
// Returns nil if the error is nil.
//
// Example:
//
//	return errors.Wrapf(err, "failed to process user %s", userID)
func Wrapf(err error, format string, args ...any) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", fmt.Sprintf(format, args...), err)
}

// New creates a new error with the given message.
// This is a convenience re-export of errors.New.
func New(message string) error {
	return errors.New(message)
}

// Errorf creates a new error with a formatted message.
// This is a convenience wrapper around fmt.Errorf.
func Errorf(format string, args ...any) error {
	return fmt.Errorf(format, args...)
}

// Is reports whether any error in err's chain matches target.
// This is a convenience re-export of errors.Is.
func Is(err, target error) bool {
	return errors.Is(err, target)
}

// As finds the first error in err's chain that matches target.
// This is a convenience re-export of errors.As.
func As(err error, target any) bool {
	return errors.As(err, target)
}
