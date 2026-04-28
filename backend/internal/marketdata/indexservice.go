// Package marketdata provides clients and services for market data.
package marketdata

import (
	"log/slog"
	"sync"
	"time"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// IndexInfo contains metadata and statistics for a market index.
type IndexInfo struct {
	Symbol            string  `json:"symbol"`
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	MedianReturn      float64 `json:"medianReturn"`      // 50th percentile
	PessimisticReturn float64 `json:"pessimisticReturn"` // 5th percentile
	OptimisticReturn  float64 `json:"optimisticReturn"`  // 95th percentile
	StandardDeviation float64 `json:"standardDeviation"`
	DataYears         float64 `json:"dataYears"`
	DataStartDate     string  `json:"dataStartDate"`
	// DataStartYear / DataStartMonth expose the first available month in a
	// machine-readable form so the historical-simulation handler and the
	// frontend year picker can validate user-supplied start dates without
	// re-parsing the formatted DataStartDate string.
	DataStartYear      int `json:"dataStartYear"`
	DataStartMonth     int `json:"dataStartMonth"`
	RollingPeriodYears int `json:"rollingPeriodYears"` // e.g., 10 or 20 years
}

// SupportedIndex defines a supported index with its ETF symbol.
type SupportedIndex struct {
	Symbol      string
	Name        string
	Description string
}

// DefaultSupportedIndexes are the indexes we support out of the box.
// Non-US ETFs use Yahoo Finance exchange suffixes (e.g. .L for LSE, .DE for XETRA).
var DefaultSupportedIndexes = []SupportedIndex{
	// US-listed
	{Symbol: "SPY", Name: "S&P 500", Description: "500 largest US companies"},
	{Symbol: "QQQ", Name: "NASDAQ 100", Description: "100 largest non-financial NASDAQ companies"},
	{Symbol: "EFA", Name: "MSCI EAFE", Description: "Developed markets excluding US & Canada"},
	{Symbol: "VTI", Name: "US Total Market", Description: "Entire US stock market (Vanguard)"},
	{Symbol: "IEMG", Name: "Emerging Markets", Description: "Core MSCI Emerging Markets (iShares)"},
	{Symbol: "GLD", Name: "Gold", Description: "Physical gold bullion (SPDR)"},
	{Symbol: "TLT", Name: "US Bonds 20yr+", Description: "20+ year US Treasury bonds (iShares)"},
	// Europe-listed UCITS
	{Symbol: "CSPX.L", Name: "S&P 500 UCITS", Description: "iShares Core S&P 500 UCITS ETF (LSE)"},
	{Symbol: "VWCE.DE", Name: "FTSE All-World UCITS", Description: "Vanguard FTSE All-World UCITS ETF (XETRA)"},
	// Shariah-compliant
	{Symbol: "ISDU.L", Name: "MSCI USA Islamic", Description: "iShares MSCI USA Islamic UCITS ETF (Shariah)"},
	{Symbol: "IGDA.L", Name: "Global Developed Islamic", Description: "Invesco Dow Jones Islamic Global Developed Markets UCITS ETF (Shariah)"},
}

// IndexService provides cached access to index statistics.
type IndexService struct {
	client     *YahooClient
	cache      map[string]*IndexInfo
	cacheMutex sync.RWMutex
	lastUpdate time.Time
	cacheTTL   time.Duration
}

// NewIndexService creates a new index service.
func NewIndexService() *IndexService {
	return &IndexService{
		client:   NewYahooClient(),
		cache:    make(map[string]*IndexInfo),
		cacheTTL: 24 * time.Hour, // Refresh daily
	}
}

// Initialize loads all supported indexes into cache.
// This should be called on application startup.
func (s *IndexService) Initialize() error {
	slog.Info("initializing index service, fetching historical data...")

	for _, idx := range DefaultSupportedIndexes {
		info, err := s.fetchAndCalculate(idx)
		if errors.Check(err) {
			slog.Error("failed to fetch index data",
				slog.String("symbol", idx.Symbol),
				slog.String("error", err.Error()),
			)
			// Continue with other indexes, don't fail completely
			continue
		}

		s.cacheMutex.Lock()
		s.cache[idx.Symbol] = info
		s.cacheMutex.Unlock()

		slog.Info("loaded index data",
			slog.String("symbol", idx.Symbol),
			slog.String("name", idx.Name),
			slog.Float64("medianReturn", info.MedianReturn),
			slog.Float64("pessimistic", info.PessimisticReturn),
			slog.Float64("optimistic", info.OptimisticReturn),
			slog.Float64("dataYears", info.DataYears),
		)
	}

	s.lastUpdate = time.Now()

	if len(s.cache) == 0 {
		return errors.Errorf("failed to load any index data")
	}

	slog.Info("index service initialized", slog.Int("indexesLoaded", len(s.cache)))
	return nil
}

// fetchAndCalculate fetches data from Yahoo and calculates statistics.
func (s *IndexService) fetchAndCalculate(idx SupportedIndex) (*IndexInfo, error) {
	data, err := s.client.FetchHistoricalData(idx.Symbol, "1mo", "max")
	if errors.Check(err) {
		return nil, errors.Wrap(err, "fetching historical data")
	}

	// Try 20-year rolling first, fall back to 10-year if not enough data
	rollingYears := 20
	stats, err := s.client.CalculateStats(data, rollingYears)
	if errors.Check(err) {
		rollingYears = 10
		stats, err = s.client.CalculateStats(data, rollingYears)
		if errors.Check(err) {
			return nil, errors.Wrap(err, "calculating statistics")
		}
	}

	return &IndexInfo{
		Symbol:             idx.Symbol,
		Name:               idx.Name,
		Description:        idx.Description,
		MedianReturn:       roundTo2Decimals(stats.AnnualizedReturn),
		PessimisticReturn:  roundTo2Decimals(stats.Percentile5Return),
		OptimisticReturn:   roundTo2Decimals(stats.Percentile95Return),
		StandardDeviation:  roundTo2Decimals(stats.StandardDeviation),
		DataYears:          roundTo1Decimal(stats.TotalYears),
		DataStartDate:      stats.DataStartDate.Format("Jan 2006"),
		DataStartYear:      stats.DataStartDate.Year(),
		DataStartMonth:     int(stats.DataStartDate.Month()),
		RollingPeriodYears: rollingYears,
	}, nil
}

// GetIndex returns cached index info for a symbol.
func (s *IndexService) GetIndex(symbol string) (*IndexInfo, bool) {
	s.cacheMutex.RLock()
	defer s.cacheMutex.RUnlock()

	info, ok := s.cache[symbol]
	return info, ok
}

// GetAllIndexes returns all cached index info.
func (s *IndexService) GetAllIndexes() []*IndexInfo {
	s.cacheMutex.RLock()
	defer s.cacheMutex.RUnlock()

	result := make([]*IndexInfo, 0, len(s.cache))
	for _, info := range s.cache {
		result = append(result, info)
	}
	return result
}

// FetchHistoricalPrices fetches actual monthly price data for a symbol over a specific date range.
// This is used for "what if" simulations with real historical data instead of statistical projections.
func (s *IndexService) FetchHistoricalPrices(symbol string, startTime, endTime time.Time) (*HistoricalData, error) {
	return s.client.FetchHistoricalDataByPeriod(symbol, startTime, endTime)
}

// RefreshIfNeeded refreshes the cache if TTL has expired.
func (s *IndexService) RefreshIfNeeded() {
	if time.Since(s.lastUpdate) < s.cacheTTL {
		return
	}

	go func() {
		slog.Info("refreshing index cache...")
		if err := s.Initialize(); errors.Check(err) {
			slog.Error("failed to refresh index cache", slog.String("error", err.Error()))
		}
	}()
}

// roundTo2Decimals rounds a float to 2 decimal places.
func roundTo2Decimals(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// roundTo1Decimal rounds a float to 1 decimal place.
func roundTo1Decimal(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
