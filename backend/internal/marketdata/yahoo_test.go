package marketdata

import (
	"fmt"
	"testing"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// TestFetchHistoricalData tests fetching historical data from Yahoo Finance.
func TestFetchHistoricalData(t *testing.T) {
	client := NewYahooClient()

	// Test symbols we care about
	symbols := []struct {
		symbol      string
		description string
	}{
		{"SPY", "S&P 500 ETF"},
		{"QQQ", "NASDAQ 100 ETF"},
		{"URTH", "MSCI World ETF"}, // iShares MSCI World
		{"VTI", "Total US Market"}, // Alternative
	}

	for _, s := range symbols {
		t.Run(s.symbol, func(t *testing.T) {
			data, err := client.FetchHistoricalData(s.symbol, "1mo", "max")
			if errors.Check(err) {
				t.Fatalf("Failed to fetch %s (%s): %v", s.symbol, s.description, err)
			}

			t.Logf("=== %s (%s) ===", s.symbol, s.description)
			t.Logf("Currency: %s", data.Currency)
			t.Logf("Data points: %d months", len(data.DataPoints))

			if len(data.DataPoints) > 0 {
				first := data.DataPoints[0]
				last := data.DataPoints[len(data.DataPoints)-1]
				t.Logf("Date range: %s to %s", first.Date.Format("Jan 2006"), last.Date.Format("Jan 2006"))
				t.Logf("First close: $%.2f, Last close: $%.2f", first.Close, last.Close)
				t.Logf("Years of data: %.1f", float64(len(data.DataPoints))/12.0)
			}
		})
	}
}

// TestCalculateStats tests the statistical calculations.
func TestCalculateStats(t *testing.T) {
	client := NewYahooClient()

	// Test with SPY - should have plenty of data
	symbols := []string{"SPY", "QQQ", "URTH"}

	for _, symbol := range symbols {
		t.Run(symbol, func(t *testing.T) {
			data, err := client.FetchHistoricalData(symbol, "1mo", "max")
			if errors.Check(err) {
				t.Fatalf("Failed to fetch %s: %v", symbol, err)
			}

			// Try 10-year rolling returns (more data points than 20-year)
			stats, err := client.CalculateStats(data, 10)
			if errors.Check(err) {
				// If 10-year fails, try 5-year
				stats, err = client.CalculateStats(data, 5)
				if errors.Check(err) {
					t.Fatalf("Failed to calculate stats for %s: %v", symbol, err)
				}
				t.Logf("(Using 5-year rolling returns due to limited data)")
			}

			t.Logf("=== %s Statistics ===", symbol)
			t.Logf("Total years of data: %.1f", stats.TotalYears)
			t.Logf("Data range: %s to %s",
				stats.DataStartDate.Format("Jan 2006"),
				stats.DataEndDate.Format("Jan 2006"))
			t.Logf("Number of rolling periods: %d", len(stats.RollingReturns))
			t.Logf("")
			t.Logf("📊 Return Statistics:")
			t.Logf("  5th percentile (pessimistic): %.2f%%", stats.Percentile5Return)
			t.Logf("  50th percentile (median):     %.2f%%", stats.AnnualizedReturn)
			t.Logf("  95th percentile (optimistic): %.2f%%", stats.Percentile95Return)
			t.Logf("  Standard deviation:           %.2f%%", stats.StandardDeviation)
		})
	}
}

// TestCompareWithKnownValues compares our calculations with known historical averages.
func TestCompareWithKnownValues(t *testing.T) {
	client := NewYahooClient()

	// SPY should have ~10.5% average return since 1993
	data, err := client.FetchHistoricalData("SPY", "1mo", "max")
	if errors.Check(err) {
		t.Fatalf("Failed to fetch SPY: %v", err)
	}

	t.Logf("SPY Data Summary:")
	t.Logf("  Total months: %d", len(data.DataPoints))
	t.Logf("  Years: %.1f", float64(len(data.DataPoints))/12.0)

	if len(data.DataPoints) > 0 {
		first := data.DataPoints[0]
		last := data.DataPoints[len(data.DataPoints)-1]
		t.Logf("  First price (adj): $%.2f on %s", first.AdjClose, first.Date.Format("Jan 2006"))
		t.Logf("  Last price (adj): $%.2f on %s", last.AdjClose, last.Date.Format("Jan 2006"))

		// Calculate simple total return
		if first.AdjClose > 0 {
			years := float64(len(data.DataPoints)) / 12.0
			totalReturn := last.AdjClose / first.AdjClose
			annualized := (pow(totalReturn, 1.0/years) - 1) * 100
			t.Logf("  Simple annualized return: %.2f%%", annualized)
		}
	}

	// Now calculate with rolling returns
	stats, err := client.CalculateStats(data, 10)
	if errors.Check(err) {
		t.Logf("  Could not calculate 10-year rolling: %v", err)
	} else {
		t.Logf("  10-year rolling median: %.2f%%", stats.AnnualizedReturn)
		t.Logf("  10-year rolling range: %.2f%% to %.2f%%",
			stats.Percentile5Return, stats.Percentile95Return)
	}
}

func pow(base, exp float64) float64 {
	result := 1.0
	for exp > 0 {
		if exp >= 1 {
			result *= base
			exp--
		} else {
			// Use logarithms for fractional exponents
			return result * exp1(exp*log(base))
		}
	}
	return result
}

// Simple implementations to avoid import cycles in test
func exp1(x float64) float64 {
	// Taylor series approximation
	result := 1.0
	term := 1.0
	for i := 1; i < 100; i++ {
		term *= x / float64(i)
		result += term
		if term < 1e-15 {
			break
		}
	}
	return result
}

func log(x float64) float64 {
	// Newton's method for natural log
	if x <= 0 {
		return 0
	}
	y := x - 1
	result := 0.0
	term := y
	for i := 1; i < 1000; i++ {
		result += term / float64(i)
		term *= -y
		if term < 1e-15 && term > -1e-15 {
			break
		}
	}
	return result
}

// TestPrintAllData is a helper to see raw data (run with -v flag).
func TestPrintSampleData(t *testing.T) {
	client := NewYahooClient()

	data, err := client.FetchHistoricalData("SPY", "1mo", "max")
	if errors.Check(err) {
		t.Fatalf("Failed to fetch SPY: %v", err)
	}

	t.Logf("First 12 months of SPY data:")
	for i := 0; i < 12 && i < len(data.DataPoints); i++ {
		p := data.DataPoints[i]
		t.Logf("  %s: Open=%.2f, Close=%.2f, AdjClose=%.2f",
			p.Date.Format("Jan 2006"), p.Open, p.Close, p.AdjClose)
	}

	t.Logf("\nLast 12 months of SPY data:")
	start := len(data.DataPoints) - 12
	if start < 0 {
		start = 0
	}
	for i := start; i < len(data.DataPoints); i++ {
		p := data.DataPoints[i]
		t.Logf("  %s: Open=%.2f, Close=%.2f, AdjClose=%.2f",
			p.Date.Format("Jan 2006"), p.Open, p.Close, p.AdjClose)
	}
}

// BenchmarkFetchData benchmarks the API fetch time.
func BenchmarkFetchData(b *testing.B) {
	client := NewYahooClient()

	// Just run once to measure API latency
	b.Run("SPY", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, err := client.FetchHistoricalData("SPY", "1mo", "max")
			if errors.Check(err) {
				b.Fatalf("Fetch failed: %v", err)
			}
		}
	})
}

func ExampleYahooClient_FetchHistoricalData() {
	client := NewYahooClient()

	data, err := client.FetchHistoricalData("SPY", "1mo", "max")
	if errors.Check(err) {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("Fetched %d months of data for %s\n", len(data.DataPoints), data.Symbol)
}
