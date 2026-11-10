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
	if len(summary.Events) != summary.EventCount || len(summary.Faults) != summary.FaultCount {
		t.Fatal("incident counts do not match parsed details")
	}
}
