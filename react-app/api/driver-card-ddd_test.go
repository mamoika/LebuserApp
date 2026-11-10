package handler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTimestampFromFilenameUsesWarsawTimezone(t *testing.T) {
	winter := timestampFromFilename("Kierowca_20260115120000.DDD")
	summer := timestampFromFilename("Kierowca_20260715120000.DDD")
	if winter != "2026-01-15T12:00:00+01:00" {
		t.Fatalf("winter timestamp = %q", winter)
	}
	if summer != "2026-07-15T12:00:00+02:00" {
		t.Fatalf("summer timestamp = %q", summer)
	}
}

func TestMatchDriverPrefersCardNumber(t *testing.T) {
	summary := &dddSummary{CardNumber: "PL123", FirstName: "Jan", Surname: "Kowalski"}
	drivers := []driverOption{
		{EmployeeID: "by-name", Name: "Jan Kowalski"},
		{EmployeeID: "by-card", Name: "Inny Kierowca", CardNumber: "PL123"},
	}
	matchDriver(summary, drivers)
	if summary.MatchedEmployeeID != "by-card" {
		t.Fatalf("matched employee = %q", summary.MatchedEmployeeID)
	}
}

func TestParseRealDriverCardDDD(t *testing.T) {
	filePath := os.Getenv("DDD_TEST_FILE")
	if filePath == "" {
		t.Skip("set DDD_TEST_FILE to exercise the parser with a private card file")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	summary, err := parseDDD(ctx, filepath.Base(filePath), data)
	if err != nil {
		t.Fatal(err)
	}
	if summary.SignatureStatus != "verified" || summary.SignaturesTotal < 1 || summary.SignaturesVerified != summary.SignaturesTotal {
		t.Fatalf("signature result = %s (%d/%d)", summary.SignatureStatus, summary.SignaturesVerified, summary.SignaturesTotal)
	}
	if strings.TrimSpace(summary.FirstName) == "" || strings.TrimSpace(summary.Surname) == "" || strings.TrimSpace(summary.CardNumber) == "" {
		t.Fatal("driver identification is incomplete")
	}
	if summary.ActivityDays < 1 || summary.ActivityFirstOn == "" || summary.ActivityLastOn == "" {
		t.Fatal("activity history was not parsed")
	}
	if len(summary.DailyActivities) != summary.ActivityDays {
		t.Fatalf("daily details = %d, activity days = %d", len(summary.DailyActivities), summary.ActivityDays)
	}
	if len(summary.VehicleDetails) != summary.VehicleSessions {
		t.Fatalf("vehicle details = %d, vehicle sessions = %d", len(summary.VehicleDetails), summary.VehicleSessions)
	}
	if summary.VehicleSessions < 1 || summary.VehicleDetails[0].FirstUse == "" {
		t.Fatal("valid vehicle-use records were not parsed")
	}
	if len(summary.GnssPoints) < 1 {
		t.Fatal("GNSS history was not parsed")
	}
	if len(summary.VehicleUnits) < 1 {
		t.Fatal("tachograph unit history was not parsed")
	}
	if summary.CardMetadata.BirthDate == "" || summary.CardMetadata.LicenceNumberMasked == "" {
		t.Fatal("card metadata is incomplete")
	}
	if summary.Control == nil {
		t.Fatal("control history record was not detected")
	}
	hasChanges := false
	for _, day := range summary.DailyActivities {
		if len(day.Changes) > 0 {
			hasChanges = true
			break
		}
	}
	if !hasChanges {
		t.Fatal("minute activity timeline was not parsed")
	}
	if len(summary.Events) != summary.EventCount || len(summary.Faults) != summary.FaultCount {
		t.Fatal("incident counts do not match parsed details")
	}
}

func TestAnalyzeComplianceFindsDailyAndContinuousDriving(t *testing.T) {
	days := []dailyActivity{{
		Date:           "2026-11-02",
		DrivingMinutes: 601,
		Changes: []activityChange{
			{StartMinute: 0, EndMinute: 271, Activity: "DRIVING"},
			{StartMinute: 271, EndMinute: 286, Activity: "BREAK_REST"},
			{StartMinute: 286, EndMinute: 617, Activity: "DRIVING"},
		},
	}}
	alerts := analyzeCompliance(days)
	if !hasComplianceAlert(alerts, "DAILY_DRIVING_OVER_10H") {
		t.Fatal("missing daily driving alert")
	}
	if !hasComplianceAlert(alerts, "DRIVING_WITHOUT_45M_BREAK") {
		t.Fatal("missing continuous driving alert")
	}
}

func TestAnalyzeComplianceAcceptsSplitBreak(t *testing.T) {
	days := []dailyActivity{{
		Date: "2026-11-03",
		Changes: []activityChange{
			{StartMinute: 0, EndMinute: 200, Activity: "DRIVING"},
			{StartMinute: 200, EndMinute: 215, Activity: "BREAK_REST"},
			{StartMinute: 215, EndMinute: 285, Activity: "DRIVING"},
			{StartMinute: 285, EndMinute: 315, Activity: "BREAK_REST"},
			{StartMinute: 315, EndMinute: 585, Activity: "DRIVING"},
		},
	}}
	if hasComplianceAlert(analyzeCompliance(days), "DRIVING_WITHOUT_45M_BREAK") {
		t.Fatal("valid 15 + 30 minute split break was flagged")
	}
}

func TestAnalyzeComplianceFindsWeeklyLimits(t *testing.T) {
	days := make([]dailyActivity, 0, 7)
	for day := 2; day <= 8; day++ {
		days = append(days, dailyActivity{Date: time.Date(2026, 11, day, 0, 0, 0, 0, time.UTC).Format("2006-01-02"), DrivingMinutes: 541})
	}
	alerts := analyzeCompliance(days)
	if !hasComplianceAlert(alerts, "WEEKLY_DRIVING_OVER_56H") {
		t.Fatal("missing weekly driving alert")
	}
	if !hasComplianceAlert(alerts, "TOO_MANY_10H_DAYS") {
		t.Fatal("missing extended-day count alert")
	}
}

func hasComplianceAlert(alerts []complianceAlert, alertType string) bool {
	for _, alert := range alerts {
		if alert.Type == alertType {
			return true
		}
	}
	return false
}
