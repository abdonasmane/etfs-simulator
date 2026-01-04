// Package marketdata provides clients for fetching historical market data.
package marketdata

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/abdonasmane/etfs-simulator/backend/sdk/errors"
)

// YahooClient fetches historical market data from Yahoo Finance.
type YahooClient struct {
	httpClient *http.Client
	baseURL    string
}

// NewYahooClient creates a new Yahoo Finance client.
func NewYahooClient() *YahooClient {
	return &YahooClient{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL: "https://query1.finance.yahoo.com/v8/finance/chart",
	}
}

// YahooResponse represents the Yahoo Finance API response structure.
type YahooResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Symbol             string  `json:"symbol"`
				Currency           string  `json:"currency"`
				RegularMarketPrice float64 `json:"regularMarketPrice"`
			} `json:"meta"`
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Open   []float64 `json:"open"`
					High   []float64 `json:"high"`
					Low    []float64 `json:"low"`
					Close  []float64 `json:"close"`
					Volume []int64   `json:"volume"`
				} `json:"quote"`
				AdjClose []struct {
					AdjClose []float64 `json:"adjclose"`
				} `json:"adjclose"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// PricePoint represents a single historical price data point.
type PricePoint struct {
	Date     time.Time
	Open     float64
	High     float64
	Low      float64
	Close    float64
	AdjClose float64
	Volume   int64
}

// HistoricalData contains the full historical data for a symbol.
type HistoricalData struct {
	Symbol     string
	Currency   string
	Interval   string // Data interval: "1d", "1wk", "1mo", etc.
	DataPoints []PricePoint
	FetchedAt  time.Time
}

// PointsPerYear returns the expected number of data points per year for a given interval.
func PointsPerYear(interval string) int {
	switch interval {
	case "1d":
		return 252 // Trading days per year
	case "1wk":
		return 52
	case "1mo":
		return 12
	case "3mo":
		return 4
	default:
		return 12 // Default to monthly
	}
}

// IndexStats contains statistical analysis of historical returns.
type IndexStats struct {
	Symbol             string
	TotalYears         float64
	AnnualizedReturn   float64 // Median annualized return
	Percentile5Return  float64 // 5th percentile (pessimistic)
	Percentile95Return float64 // 95th percentile (optimistic)
	StandardDeviation  float64
	RollingReturns     []float64 // All calculated rolling returns
	DataStartDate      time.Time
	DataEndDate        time.Time
	CalculatedAt       time.Time
}

// FetchHistoricalData fetches historical monthly data for a symbol.
func (c *YahooClient) FetchHistoricalData(symbol, interval, rangePeriod string) (*HistoricalData, error) {
	url := fmt.Sprintf("%s/%s?interval=%s&range=%s", c.baseURL, symbol, interval, rangePeriod)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if errors.Check(err) {
		return nil, errors.Wrap(err, "creating request")
	}

	// Add headers to mimic browser request
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)") // To avoid yahoo rate limiting
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if errors.Check(err) {
		return nil, errors.Wrap(err, "fetching data")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var yahooResp YahooResponse
	if err := json.NewDecoder(resp.Body).Decode(&yahooResp); errors.Check(err) {
		return nil, errors.Wrap(err, "decoding response")
	}

	if yahooResp.Chart.Error != nil {
		return nil, errors.Errorf("yahoo API error: %s - %s", yahooResp.Chart.Error.Code, yahooResp.Chart.Error.Description)
	}

	if len(yahooResp.Chart.Result) == 0 {
		return nil, errors.Errorf("no data returned for symbol %s", symbol)
	}

	result := yahooResp.Chart.Result[0]
	if len(result.Timestamp) == 0 {
		return nil, errors.Errorf("no timestamps in data for symbol %s", symbol)
	}

	// Parse the data points
	data := &HistoricalData{
		Symbol:     result.Meta.Symbol,
		Currency:   result.Meta.Currency,
		Interval:   interval,
		DataPoints: make([]PricePoint, 0, len(result.Timestamp)),
		FetchedAt:  time.Now(),
	}

	quotes := result.Indicators.Quote
	if len(quotes) == 0 {
		return nil, errors.Errorf("no quote data for symbol %s", symbol)
	}

	// Get adjusted close prices if available
	var adjClose []float64
	if len(result.Indicators.AdjClose) > 0 {
		adjClose = result.Indicators.AdjClose[0].AdjClose
	}

	for i, ts := range result.Timestamp {
		// Skip data points with missing values
		if i >= len(quotes[0].Close) || quotes[0].Close[i] == 0 {
			continue
		}

		point := PricePoint{
			Date:   time.Unix(ts, 0).UTC(),
			Open:   safeFloat(quotes[0].Open, i),
			High:   safeFloat(quotes[0].High, i),
			Low:    safeFloat(quotes[0].Low, i),
			Close:  safeFloat(quotes[0].Close, i),
			Volume: safeInt(quotes[0].Volume, i),
		}

		if adjClose != nil && i < len(adjClose) {
			point.AdjClose = adjClose[i]
		} else {
			point.AdjClose = point.Close
		}

		data.DataPoints = append(data.DataPoints, point)
	}

	return data, nil
}

// CalculateStats computes statistical analysis from historical data.
// rollingYears specifies the rolling period for calculating returns (e.g., 20 for 20-year returns).
func (c *YahooClient) CalculateStats(data *HistoricalData, rollingYears int) (*IndexStats, error) {
	pointsPerYear := PointsPerYear(data.Interval)
	requiredPoints := pointsPerYear * rollingYears

	if len(data.DataPoints) < requiredPoints {
		return nil, errors.Errorf("insufficient data: need at least %d data points (%d years of %s data), got %d",
			requiredPoints, rollingYears, data.Interval, len(data.DataPoints))
	}

	// Calculate rolling annualized returns
	rollingPeriod := rollingYears * pointsPerYear
	var rollingReturns []float64

	for i := rollingPeriod; i < len(data.DataPoints); i++ {
		startPrice := data.DataPoints[i-rollingPeriod].AdjClose
		endPrice := data.DataPoints[i].AdjClose

		if startPrice <= 0 || endPrice <= 0 {
			continue
		}

		// Calculate annualized return: ((endPrice/startPrice)^(1/years) - 1) * 100
		totalReturn := endPrice / startPrice
		annualizedReturn := (math.Pow(totalReturn, 1.0/float64(rollingYears)) - 1) * 100

		// Filter out unrealistic returns (data errors)
		if annualizedReturn > -50 && annualizedReturn < 100 {
			rollingReturns = append(rollingReturns, annualizedReturn)
		}
	}

	if len(rollingReturns) == 0 {
		return nil, errors.Errorf("no valid rolling returns calculated")
	}

	// Sort for percentile calculation
	sorted := make([]float64, len(rollingReturns))
	copy(sorted, rollingReturns)
	sort.Float64s(sorted)

	// Calculate statistics
	stats := &IndexStats{
		Symbol:             data.Symbol,
		TotalYears:         float64(len(data.DataPoints)) / float64(pointsPerYear),
		AnnualizedReturn:   percentile(sorted, 50), // Median
		Percentile5Return:  percentile(sorted, 5),
		Percentile95Return: percentile(sorted, 95),
		StandardDeviation:  standardDeviation(rollingReturns),
		RollingReturns:     rollingReturns,
		DataStartDate:      data.DataPoints[0].Date,
		DataEndDate:        data.DataPoints[len(data.DataPoints)-1].Date,
		CalculatedAt:       time.Now(),
	}

	return stats, nil
}

// percentile calculates the p-th percentile of a sorted slice.
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}

	index := (p / 100.0) * float64(len(sorted)-1)
	lower := int(math.Floor(index))
	upper := int(math.Ceil(index))

	if lower == upper || upper >= len(sorted) {
		return sorted[lower]
	}

	// Linear interpolation
	weight := index - float64(lower)
	return sorted[lower]*(1-weight) + sorted[upper]*weight
}

// standardDeviation calculates the standard deviation of a slice.
func standardDeviation(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}

	// Calculate mean
	var sum float64
	for _, v := range values {
		sum += v
	}
	mean := sum / float64(len(values))

	// Calculate variance
	var variance float64
	for _, v := range values {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(values))

	return math.Sqrt(variance)
}

// safeFloat safely accesses a float slice.
func safeFloat(slice []float64, index int) float64 {
	if index < len(slice) {
		return slice[index]
	}
	return 0
}

// safeInt safely accesses an int64 slice.
func safeInt(slice []int64, index int) int64 {
	if index < len(slice) {
		return slice[index]
	}
	return 0
}
