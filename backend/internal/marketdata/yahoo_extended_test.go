package marketdata

import (
	"testing"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// TestFindBestMSCIWorldProxy tests various ETFs to find the best MSCI World proxy with most data.
func TestFindBestMSCIWorldProxy(t *testing.T) {
	client := NewYahooClient()

	// Various global/world ETFs to check
	candidates := []struct {
		symbol      string
		description string
	}{
		{"URTH", "iShares MSCI World ETF"},
		{"VT", "Vanguard Total World Stock"},
		{"ACWI", "iShares MSCI ACWI (All Country World)"},
		{"VEU", "Vanguard All-World ex-US"},
		{"EFA", "iShares MSCI EAFE (Developed ex-US)"},
		{"VXUS", "Vanguard Total International Stock"},
		{"IXUS", "iShares Core MSCI Total International"},
		{"VTI", "Vanguard Total US Stock (fallback)"},
	}

	t.Logf("Searching for best MSCI World proxy with most historical data...\n")

	for _, c := range candidates {
		data, err := client.FetchHistoricalData(c.symbol, "1mo", "max")
		if errors.Check(err) {
			t.Logf("❌ %s (%s): Error - %v", c.symbol, c.description, err)
			continue
		}

		years := float64(len(data.DataPoints)) / 12.0
		startDate := "N/A"
		if len(data.DataPoints) > 0 {
			startDate = data.DataPoints[0].Date.Format("Jan 2006")
		}

		// Check if we can do 10-year rolling
		canDo10Year := len(data.DataPoints) >= 120
		canDo20Year := len(data.DataPoints) >= 240

		status := "⚠️"
		if canDo20Year {
			status = "✅"
		} else if canDo10Year {
			status = "🔶"
		}

		t.Logf("%s %s (%s): %.1f years from %s (10yr:%v, 20yr:%v)",
			status, c.symbol, c.description, years, startDate, canDo10Year, canDo20Year)
	}
}

// TestAllThreeIndexes tests our final three indexes with proper stats.
func TestAllThreeIndexes(t *testing.T) {
	client := NewYahooClient()

	// Our final three indexes
	indexes := []struct {
		symbol      string
		description string
	}{
		{"SPY", "S&P 500"},
		{"QQQ", "NASDAQ 100"},
		{"EFA", "MSCI EAFE (World ex-US proxy)"}, // Best available world proxy
	}

	for _, idx := range indexes {
		t.Run(idx.symbol, func(t *testing.T) {
			data, err := client.FetchHistoricalData(idx.symbol, "1mo", "max")
			if errors.Check(err) {
				t.Fatalf("Failed to fetch %s: %v", idx.symbol, err)
			}

			// Try different rolling periods
			for _, years := range []int{20, 15, 10, 5} {
				stats, err := client.CalculateStats(data, years)
				if errors.Check(err) {
					continue
				}

				t.Logf("=== %s - %d-Year Rolling Returns ===", idx.description, years)
				t.Logf("  Data range: %s to %s (%.1f years total)",
					stats.DataStartDate.Format("Jan 2006"),
					stats.DataEndDate.Format("Jan 2006"),
					stats.TotalYears)
				t.Logf("  Rolling periods analyzed: %d", len(stats.RollingReturns))
				t.Logf("  📉 Pessimistic (5th):  %.2f%%", stats.Percentile5Return)
				t.Logf("  📊 Median (50th):      %.2f%%", stats.AnnualizedReturn)
				t.Logf("  📈 Optimistic (95th):  %.2f%%", stats.Percentile95Return)
				t.Logf("  📏 Std Deviation:      %.2f%%", stats.StandardDeviation)
				break // Only show the longest period we can calculate
			}
		})
	}
}

// TestPrintRollingReturnsDistribution shows the distribution of rolling returns.
func TestPrintRollingReturnsDistribution(t *testing.T) {
	client := NewYahooClient()

	data, err := client.FetchHistoricalData("SPY", "1mo", "max")
	if errors.Check(err) {
		t.Fatalf("Failed to fetch SPY: %v", err)
	}

	stats, err := client.CalculateStats(data, 10)
	if errors.Check(err) {
		t.Fatalf("Failed to calculate stats: %v", err)
	}

	t.Logf("SPY 10-Year Rolling Return Distribution:")
	t.Logf("  Count: %d rolling periods", len(stats.RollingReturns))

	// Count returns in buckets
	buckets := make(map[string]int)
	for _, r := range stats.RollingReturns {
		var bucket string
		switch {
		case r < 0:
			bucket = "< 0%"
		case r < 5:
			bucket = "0-5%"
		case r < 10:
			bucket = "5-10%"
		case r < 15:
			bucket = "10-15%"
		default:
			bucket = "> 15%"
		}
		buckets[bucket]++
	}

	t.Logf("\n  Distribution:")
	for _, b := range []string{"< 0%", "0-5%", "5-10%", "10-15%", "> 15%"} {
		count := buckets[b]
		pct := float64(count) / float64(len(stats.RollingReturns)) * 100
		bar := ""
		for i := 0; i < int(pct/2); i++ {
			bar += "█"
		}
		t.Logf("  %8s: %3d (%5.1f%%) %s", b, count, pct, bar)
	}
}
