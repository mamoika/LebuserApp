package handler

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	tachograph "github.com/way-platform/tachograph-go"
	cardv1 "github.com/way-platform/tachograph-go/proto/gen/go/wayplatform/connect/tachograph/card/v1"
	ddv1 "github.com/way-platform/tachograph-go/proto/gen/go/wayplatform/connect/tachograph/dd/v1"
	securityv1 "github.com/way-platform/tachograph-go/proto/gen/go/wayplatform/connect/tachograph/security/v1"
	tachographv1 "github.com/way-platform/tachograph-go/proto/gen/go/wayplatform/connect/tachograph/v1"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const maxDDDSize = 2 << 20

var fileTimestampPattern = regexp.MustCompile(`(?i)(\d{14})(?:_[A-Z])?\.DDD$`)

type driverOption struct {
	EmployeeID string `json:"employee_id"`
	Name       string `json:"name"`
	CardNumber string `json:"card_number,omitempty"`
}

type importRow struct {
	ID                 string      `json:"id"`
	EmployeeID         string      `json:"employee_id"`
	EmployeeName       string      `json:"employee_name"`
	FileName           string      `json:"file_name"`
	DownloadedAt       string      `json:"downloaded_at"`
	ImportedAt         string      `json:"imported_at"`
	Generation         string      `json:"generation"`
	SignatureStatus    string      `json:"signature_status"`
	ActivityFirstOn    string      `json:"activity_first_on"`
	ActivityLastOn     string      `json:"activity_last_on"`
	ActivityDays       int         `json:"activity_days"`
	SignaturesVerified int         `json:"signatures_verified"`
	SignaturesTotal    int         `json:"signatures_total"`
	Summary            *dddSummary `json:"summary,omitempty"`
}

type dispatchContext struct {
	OK      bool           `json:"ok"`
	Drivers []driverOption `json:"drivers"`
	Imports []importRow    `json:"imports"`
	Error   string         `json:"error"`
}

type activityTotals struct {
	DrivingMinutes      int `json:"driving_minutes"`
	WorkMinutes         int `json:"work_minutes"`
	AvailabilityMinutes int `json:"availability_minutes"`
	RestMinutes         int `json:"rest_minutes"`
}

type dailyActivity struct {
	Date                string           `json:"date"`
	DrivingMinutes      int              `json:"driving_minutes"`
	WorkMinutes         int              `json:"work_minutes"`
	AvailabilityMinutes int              `json:"availability_minutes"`
	RestMinutes         int              `json:"rest_minutes"`
	DistanceKm          int32            `json:"distance_km"`
	Changes             []activityChange `json:"changes,omitempty"`
}

type activityChange struct {
	StartMinute int    `json:"start_minute"`
	EndMinute   int    `json:"end_minute"`
	Activity    string `json:"activity"`
	Slot        string `json:"slot"`
	Crew        bool   `json:"crew"`
	Inserted    bool   `json:"inserted"`
}

type vehicleSession struct {
	Registration string `json:"registration"`
	Nation       string `json:"nation,omitempty"`
	VIN          string `json:"vin,omitempty"`
	FirstUse     string `json:"first_use,omitempty"`
	LastUse      string `json:"last_use,omitempty"`
	OdometerFrom int32  `json:"odometer_from_km"`
	OdometerTo   int32  `json:"odometer_to_km"`
}

type cardIncident struct {
	Type         string `json:"type"`
	BeginAt      string `json:"begin_at,omitempty"`
	EndAt        string `json:"end_at,omitempty"`
	Registration string `json:"registration,omitempty"`
}

type gnssPoint struct {
	Timestamp  string  `json:"timestamp"`
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
	Accuracy   int32   `json:"accuracy,omitempty"`
	OdometerKm int32   `json:"odometer_km,omitempty"`
}

type vehicleUnit struct {
	Timestamp        string `json:"timestamp"`
	ManufacturerCode int32  `json:"manufacturer_code"`
	DeviceID         string `json:"device_id"`
	SoftwareVersion  string `json:"software_version"`
}

type controlRecord struct {
	Valid       bool     `json:"valid"`
	ControlAt   string   `json:"control_at,omitempty"`
	Vehicle     string   `json:"vehicle,omitempty"`
	PeriodBegin string   `json:"period_begin,omitempty"`
	PeriodEnd   string   `json:"period_end,omitempty"`
	Actions     []string `json:"actions,omitempty"`
}

type cardMetadata struct {
	BirthDate            string `json:"birth_date,omitempty"`
	PreferredLanguage    string `json:"preferred_language,omitempty"`
	IssuingState         string `json:"issuing_state,omitempty"`
	IssuingAuthority     string `json:"issuing_authority,omitempty"`
	IssueDate            string `json:"issue_date,omitempty"`
	ValidityBegin        string `json:"validity_begin,omitempty"`
	LicenceNumberMasked  string `json:"licence_number_masked,omitempty"`
	LicenceNation        string `json:"licence_nation,omitempty"`
	LicenceAuthority     string `json:"licence_authority,omitempty"`
	PreviousDownloadAt   string `json:"previous_download_at,omitempty"`
	CurrentSessionOpened string `json:"current_session_opened,omitempty"`
	CurrentVehicle       string `json:"current_vehicle,omitempty"`
}

type complianceAlert struct {
	Type     string `json:"type"`
	Severity string `json:"severity"`
	DateFrom string `json:"date_from"`
	DateTo   string `json:"date_to,omitempty"`
	Actual   int    `json:"actual"`
	Limit    int    `json:"limit"`
	Unit     string `json:"unit"`
}

type dddSummary struct {
	FileName            string            `json:"file_name"`
	FileSize            int               `json:"file_size"`
	SHA256              string            `json:"sha256"`
	Generation          string            `json:"generation"`
	CardNumber          string            `json:"card_number"`
	MaskedCardNumber    string            `json:"masked_card_number"`
	FirstName           string            `json:"first_name"`
	Surname             string            `json:"surname"`
	CardExpiryOn        string            `json:"card_expiry_on,omitempty"`
	DownloadedAt        string            `json:"downloaded_at,omitempty"`
	ActivityFirstOn     string            `json:"activity_first_on,omitempty"`
	ActivityLastOn      string            `json:"activity_last_on,omitempty"`
	ActivityDays        int               `json:"activity_days"`
	VehicleSessions     int               `json:"vehicle_sessions"`
	EventCount          int               `json:"event_count"`
	FaultCount          int               `json:"fault_count"`
	SignaturesVerified  int               `json:"signatures_verified"`
	SignaturesTotal     int               `json:"signatures_total"`
	SignatureStatus     string            `json:"signature_status"`
	Totals              activityTotals    `json:"totals"`
	DailyActivities     []dailyActivity   `json:"daily_activities,omitempty"`
	VehicleDetails      []vehicleSession  `json:"vehicle_details,omitempty"`
	Events              []cardIncident    `json:"events,omitempty"`
	Faults              []cardIncident    `json:"faults,omitempty"`
	GnssPoints          []gnssPoint       `json:"gnss_points,omitempty"`
	VehicleUnits        []vehicleUnit     `json:"vehicle_units,omitempty"`
	Control             *controlRecord    `json:"control,omitempty"`
	CardMetadata        cardMetadata      `json:"card_metadata"`
	ComplianceAlerts    []complianceAlert `json:"compliance_alerts,omitempty"`
	MatchedEmployeeID   string            `json:"matched_employee_id,omitempty"`
	MatchedEmployeeName string            `json:"matched_employee_name,omitempty"`
}

type apiResponse struct {
	OK        bool           `json:"ok"`
	Summary   *dddSummary    `json:"summary,omitempty"`
	Drivers   []driverOption `json:"drivers,omitempty"`
	Imports   []importRow    `json:"imports,omitempty"`
	Duplicate bool           `json:"duplicate,omitempty"`
	ImportID  string         `json:"import_id,omitempty"`
	Error     string         `json:"error,omitempty"`
}

type saveResponse struct {
	OK        bool   `json:"ok"`
	Duplicate bool   `json:"duplicate"`
	ImportID  string `json:"import_id"`
	Error     string `json:"error"`
}

type detailResponse struct {
	OK      bool        `json:"ok"`
	Summary *dddSummary `json:"summary,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, apiResponse{Error: "Dozwolone jest tylko żądanie POST"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	sessionToken := strings.TrimSpace(r.Header.Get("X-Session-Token"))
	if sessionToken == "" {
		writeJSON(w, http.StatusUnauthorized, apiResponse{Error: "Brak aktywnej sesji"})
		return
	}

	access, err := loadDispatchContext(ctx, sessionToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, apiResponse{Error: err.Error()})
		return
	}
	queryAction := strings.TrimSpace(r.URL.Query().Get("action"))
	if strings.EqualFold(queryAction, "context") {
		writeJSON(w, http.StatusOK, apiResponse{OK: true, Drivers: publicDrivers(access.Drivers), Imports: access.Imports})
		return
	}
	if strings.EqualFold(queryAction, "details") {
		importID := strings.TrimSpace(r.URL.Query().Get("id"))
		if importID == "" {
			writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Brak identyfikatora odczytu DDD"})
			return
		}
		detail, detailErr := loadImportDetail(ctx, sessionToken, importID)
		if detailErr != nil {
			writeJSON(w, http.StatusBadRequest, apiResponse{Error: detailErr.Error()})
			return
		}
		writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: detail.Summary})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxDDDSize+256*1024)
	if err := r.ParseMultipartForm(maxDDDSize + 64*1024); err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, apiResponse{Error: "Plik jest za duży. Maksymalny rozmiar to 2 MB."})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Wybierz plik DDD z karty kierowcy"})
		return
	}
	defer file.Close()

	fileName := filepath.Base(strings.TrimSpace(header.Filename))
	if !strings.EqualFold(filepath.Ext(fileName), ".ddd") {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Obsługiwane są wyłącznie pliki .DDD"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxDDDSize+1))
	if err != nil || len(data) == 0 {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Nie udało się odczytać pliku"})
		return
	}
	if len(data) > maxDDDSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, apiResponse{Error: "Plik jest za duży. Maksymalny rozmiar to 2 MB."})
		return
	}

	summary, err := parseDDD(ctx, fileName, data)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, apiResponse{Error: err.Error()})
		return
	}
	matchDriver(summary, access.Drivers)

	action := strings.TrimSpace(r.FormValue("action"))
	if action == "" || action == "parse" {
		writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: summary, Drivers: publicDrivers(access.Drivers), Imports: access.Imports})
		return
	}
	if action != "import" {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Nieznana operacja"})
		return
	}
	if summary.SignatureStatus != "verified" {
		writeJSON(w, http.StatusUnprocessableEntity, apiResponse{Error: "Plik nie ma kompletu poprawnych podpisów i nie może zostać zapisany"})
		return
	}

	employeeID := strings.TrimSpace(r.FormValue("employee_id"))
	if !containsDriver(access.Drivers, employeeID) {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Wybierz aktywnego kierowcę"})
		return
	}
	downloadedAt := strings.TrimSpace(r.FormValue("downloaded_at"))
	if downloadedAt == "" {
		downloadedAt = summary.DownloadedAt
	}
	if _, err := time.Parse(time.RFC3339, downloadedAt); err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: "Podaj prawidłową datę i godzinę odczytu"})
		return
	}

	result, err := saveImport(ctx, sessionToken, employeeID, downloadedAt, data, summary)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: summary, Duplicate: result.Duplicate, ImportID: result.ImportID})
}

func parseDDD(ctx context.Context, fileName string, data []byte) (*dddSummary, error) {
	rawFile, err := tachograph.Unmarshal(data)
	if err != nil {
		return nil, fmt.Errorf("to nie jest prawidłowy plik DDD: %w", err)
	}
	if rawFile.GetType() != tachographv1.RawFile_CARD {
		return nil, errors.New("ten plik pochodzi z tachografu pojazdu; obecnie obsługiwane są pliki z karty kierowcy")
	}
	authenticated, err := tachograph.Authenticate(ctx, rawFile)
	if err != nil {
		return nil, fmt.Errorf("nie udało się sprawdzić podpisu pliku: %w", err)
	}
	parsed, err := tachograph.Parse(authenticated)
	if err != nil {
		return nil, fmt.Errorf("nie udało się odczytać danych karty: %w", err)
	}
	card := parsed.GetDriverCard()
	if card == nil {
		return nil, errors.New("plik nie zawiera danych karty kierowcy")
	}

	sum := sha256.Sum256(data)
	result := &dddSummary{
		FileName:        fileName,
		FileSize:        len(data),
		SHA256:          hex.EncodeToString(sum[:]),
		SignatureStatus: "unverified",
	}

	var identification *cardv1.DriverCardIdentification
	var activities *cardv1.DriverActivityData
	var licence *cardv1.DrivingLicenceInfo
	var cardDownload *cardv1.CardDownloadDriver
	var currentUsage *cardv1.CurrentUsage
	var control *cardv1.ControlActivityData
	if g2 := card.GetTachographG2(); g2 != nil {
		identification = g2.GetIdentification()
		activities = g2.GetDriverActivityData()
		licence = g2.GetDrivingLicenceInfo()
		cardDownload = g2.GetCardDownload()
		currentUsage = g2.GetCurrentUsage()
		control = g2.GetControlActivityData()
		result.Generation = "G2"
		if g2.GetApplicationIdentificationV2() != nil {
			result.Generation = "G2.2 (Smart V2)"
		}
		if vehicles := g2.GetVehiclesUsed(); vehicles != nil {
			for _, record := range vehicles.GetRecords() {
				if detail, ok := vehicleDetail(record); ok {
					result.VehicleDetails = append(result.VehicleDetails, detail)
				}
			}
			result.VehicleSessions = len(result.VehicleDetails)
		}
		if events := g2.GetEventsData(); events != nil {
			result.Events = eventDetails(events.GetEvents())
			result.EventCount = len(result.Events)
		}
		if faults := g2.GetFaultsData(); faults != nil {
			result.Faults = faultDetails(faults.GetFaults())
			result.FaultCount = len(result.Faults)
		}
		result.GnssPoints = gnssDetails(g2.GetGnssPlaces())
		result.VehicleUnits = vehicleUnitDetails(g2.GetVehicleUnitsUsed())
	} else if g1 := card.GetTachograph(); g1 != nil {
		identification = g1.GetIdentification()
		activities = g1.GetDriverActivityData()
		licence = g1.GetDrivingLicenceInfo()
		cardDownload = g1.GetCardDownload()
		currentUsage = g1.GetCurrentUsage()
		control = g1.GetControlActivityData()
		result.Generation = "G1"
		if vehicles := g1.GetVehiclesUsed(); vehicles != nil {
			for _, record := range vehicles.GetRecords() {
				if detail, ok := vehicleDetail(record); ok {
					result.VehicleDetails = append(result.VehicleDetails, detail)
				}
			}
			result.VehicleSessions = len(result.VehicleDetails)
		}
		if events := g1.GetEventsData(); events != nil {
			result.Events = eventDetails(events.GetEvents())
			result.EventCount = len(result.Events)
		}
		if faults := g1.GetFaultsData(); faults != nil {
			result.Faults = faultDetails(faults.GetFaults())
			result.FaultCount = len(result.Faults)
		}
	}
	if identification == nil {
		return nil, errors.New("brak identyfikacji kierowcy w pliku")
	}

	driverID := identification.GetDriverIdentification()
	if driverID != nil {
		result.CardNumber = strings.TrimSpace(driverID.GetDriverIdentificationNumber().GetValue() + driverID.GetCardReplacementIndex().GetValue() + driverID.GetCardRenewalIndex().GetValue())
	}
	result.MaskedCardNumber = maskCardNumber(result.CardNumber)
	result.FirstName = strings.TrimSpace(identification.GetCardHolderFirstNames().GetValue())
	result.Surname = strings.TrimSpace(identification.GetCardHolderSurname().GetValue())
	if expiry := identification.GetCardExpiryDate(); expiry != nil && expiry.IsValid() {
		result.CardExpiryOn = expiry.AsTime().UTC().Format("2006-01-02")
	}
	populateCardMetadata(result, identification, licence, cardDownload, currentUsage)
	result.Control = controlDetail(control)
	result.DownloadedAt = timestampFromFilename(fileName)
	if result.DownloadedAt == "" {
		result.DownloadedAt = time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	}

	populateActivities(result, activities)
	result.ComplianceAlerts = analyzeCompliance(result.DailyActivities)
	result.SignaturesVerified, result.SignaturesTotal = countAuthentications(parsed.ProtoReflect())
	if result.SignaturesTotal > 0 && result.SignaturesVerified == result.SignaturesTotal {
		result.SignatureStatus = "verified"
	} else if result.SignaturesTotal > 0 {
		result.SignatureStatus = "invalid"
	}
	return result, nil
}

func populateActivities(result *dddSummary, activities *cardv1.DriverActivityData) {
	if activities == nil {
		return
	}
	type dayData struct {
		changes  []*ddv1.ActivityChangeInfo
		distance int32
	}
	days := map[string]dayData{}
	for _, record := range activities.GetDailyRecords() {
		if record == nil || !record.GetValid() || record.GetActivityRecordDate() == nil || !record.GetActivityRecordDate().IsValid() {
			continue
		}
		date := record.GetActivityRecordDate().AsTime().UTC()
		key := date.Format("2006-01-02")
		days[key] = dayData{changes: record.GetActivityChangeInfo(), distance: record.GetActivityDayDistance()}
	}
	if len(days) == 0 {
		return
	}
	keys := make([]string, 0, len(days))
	for key := range days {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result.ActivityFirstOn = keys[0]
	result.ActivityLastOn = keys[len(keys)-1]
	result.ActivityDays = len(keys)
	for _, key := range keys {
		detail := dailyActivity{Date: key, DistanceKm: days[key].distance}
		changes := append([]*ddv1.ActivityChangeInfo(nil), days[key].changes...)
		sort.SliceStable(changes, func(i, j int) bool { return changes[i].GetTimeOfChangeMinutes() < changes[j].GetTimeOfChangeMinutes() })
		for index, change := range changes {
			if change == nil {
				continue
			}
			start := int(change.GetTimeOfChangeMinutes())
			end := 1440
			if index+1 < len(changes) && changes[index+1] != nil {
				end = int(changes[index+1].GetTimeOfChangeMinutes())
			}
			if end < start || start < 0 || end > 1440 {
				continue
			}
			duration := end - start
			detail.Changes = append(detail.Changes, activityChange{
				StartMinute: start,
				EndMinute:   end,
				Activity:    strings.TrimPrefix(change.GetActivity().String(), "DRIVER_ACTIVITY_VALUE_"),
				Slot:        strings.TrimPrefix(change.GetSlot().String(), "CARD_SLOT_NUMBER_"),
				Crew:        change.GetCrew(),
				Inserted:    change.GetInserted(),
			})
			switch change.GetActivity() {
			case ddv1.DriverActivityValue_DRIVING:
				result.Totals.DrivingMinutes += duration
				detail.DrivingMinutes += duration
			case ddv1.DriverActivityValue_WORK:
				result.Totals.WorkMinutes += duration
				detail.WorkMinutes += duration
			case ddv1.DriverActivityValue_AVAILABILITY:
				result.Totals.AvailabilityMinutes += duration
				detail.AvailabilityMinutes += duration
			case ddv1.DriverActivityValue_BREAK_REST:
				result.Totals.RestMinutes += duration
				detail.RestMinutes += duration
			}
		}
		result.DailyActivities = append(result.DailyActivities, detail)
	}
}

func analyzeCompliance(days []dailyActivity) []complianceAlert {
	if len(days) == 0 {
		return nil
	}
	type weekData struct {
		start    string
		end      string
		driving  int
		extended int
	}
	weeks := map[string]*weekData{}
	alerts := make([]complianceAlert, 0)
	for _, day := range days {
		date, err := time.Parse("2006-01-02", day.Date)
		if err != nil {
			continue
		}
		monday := date.AddDate(0, 0, -((int(date.Weekday()) + 6) % 7))
		key := monday.Format("2006-01-02")
		week := weeks[key]
		if week == nil {
			week = &weekData{start: key, end: monday.AddDate(0, 0, 6).Format("2006-01-02")}
			weeks[key] = week
		}
		week.driving += day.DrivingMinutes
		if day.DrivingMinutes > 540 {
			week.extended++
		}
		if day.DrivingMinutes > 600 {
			alerts = append(alerts, complianceAlert{Type: "DAILY_DRIVING_OVER_10H", Severity: "high", DateFrom: day.Date, Actual: day.DrivingMinutes, Limit: 600, Unit: "minutes"})
		}
		continuous, partialBreak, flagged := 0, false, false
		for _, change := range day.Changes {
			duration := change.EndMinute - change.StartMinute
			if duration <= 0 {
				continue
			}
			switch change.Activity {
			case "DRIVING":
				continuous += duration
				if continuous > 270 && !flagged {
					alerts = append(alerts, complianceAlert{Type: "DRIVING_WITHOUT_45M_BREAK", Severity: "high", DateFrom: day.Date, Actual: continuous, Limit: 270, Unit: "minutes"})
					flagged = true
				}
			case "BREAK_REST":
				if duration >= 45 || (partialBreak && duration >= 30) {
					continuous, partialBreak, flagged = 0, false, false
				} else if duration >= 15 {
					partialBreak = true
				}
			}
		}
	}
	keys := make([]string, 0, len(weeks))
	for key := range weeks {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for index, key := range keys {
		week := weeks[key]
		if week.driving > 3360 {
			alerts = append(alerts, complianceAlert{Type: "WEEKLY_DRIVING_OVER_56H", Severity: "high", DateFrom: week.start, DateTo: week.end, Actual: week.driving, Limit: 3360, Unit: "minutes"})
		}
		if week.extended > 2 {
			alerts = append(alerts, complianceAlert{Type: "TOO_MANY_10H_DAYS", Severity: "medium", DateFrom: week.start, DateTo: week.end, Actual: week.extended, Limit: 2, Unit: "days"})
		}
		if index > 0 {
			previous := weeks[keys[index-1]]
			currentStart, _ := time.Parse("2006-01-02", week.start)
			previousStart, _ := time.Parse("2006-01-02", previous.start)
			if currentStart.Sub(previousStart) == 7*24*time.Hour && previous.driving+week.driving > 5400 {
				alerts = append(alerts, complianceAlert{Type: "FORTNIGHT_DRIVING_OVER_90H", Severity: "high", DateFrom: previous.start, DateTo: week.end, Actual: previous.driving + week.driving, Limit: 5400, Unit: "minutes"})
			}
		}
	}
	return alerts
}

type vehicleRecord interface {
	GetVehicleOdometerBeginKm() int32
	GetVehicleOdometerEndKm() int32
	GetVehicleFirstUse() *timestamppb.Timestamp
	GetVehicleLastUse() *timestamppb.Timestamp
	GetVehicleRegistration() *ddv1.VehicleRegistrationIdentification
}

func vehicleDetail(record vehicleRecord) (vehicleSession, bool) {
	if record == nil || record.GetVehicleFirstUse() == nil || !record.GetVehicleFirstUse().IsValid() {
		return vehicleSession{}, false
	}
	registration := record.GetVehicleRegistration()
	detail := vehicleSession{
		FirstUse:     timestampValue(record.GetVehicleFirstUse()),
		LastUse:      timestampValue(record.GetVehicleLastUse()),
		OdometerFrom: record.GetVehicleOdometerBeginKm(),
		OdometerTo:   record.GetVehicleOdometerEndKm(),
	}
	if registration != nil {
		detail.Registration = strings.TrimSpace(registration.GetNumber().GetValue())
		detail.Nation = registration.GetNation().String()
	}
	if withVIN, ok := record.(interface{ GetVehicleIdentificationNumber() string }); ok {
		detail.VIN = strings.TrimSpace(withVIN.GetVehicleIdentificationNumber())
	}
	return detail, true
}

func gnssDetails(data *cardv1.GnssPlaces) []gnssPoint {
	if data == nil {
		return nil
	}
	result := make([]gnssPoint, 0, len(data.GetRecords()))
	for _, record := range data.GetRecords() {
		if record == nil || record.GetTimestamp() == nil || !record.GetTimestamp().IsValid() {
			continue
		}
		place := record.GetGnssPlaceRecord()
		if place == nil || place.GetGeoCoordinates() == nil {
			continue
		}
		lat, latOK := coordinateDegrees(place.GetGeoCoordinates().GetLatitude())
		lng, lngOK := coordinateDegrees(place.GetGeoCoordinates().GetLongitude())
		if !latOK || !lngOK {
			continue
		}
		result = append(result, gnssPoint{
			Timestamp: timestampValue(record.GetTimestamp()), Latitude: lat, Longitude: lng,
			Accuracy: place.GetGnssAccuracy(), OdometerKm: record.GetVehicleOdometerKm(),
		})
	}
	return result
}

func coordinateDegrees(raw int32) (float64, bool) {
	if raw == 8388607 || raw == -8388607 {
		return 0, false
	}
	sign := 1.0
	value := int64(raw)
	if value < 0 {
		sign = -1
		value = -value
	}
	degrees := value / 1000
	minutesTenths := value % 1000
	decimal := float64(degrees) + float64(minutesTenths)/10.0/60.0
	if decimal > 180 {
		return 0, false
	}
	return sign * decimal, true
}

func vehicleUnitDetails(data *cardv1.VehicleUnitsUsed) []vehicleUnit {
	if data == nil {
		return nil
	}
	result := make([]vehicleUnit, 0, len(data.GetRecords()))
	for _, record := range data.GetRecords() {
		if record == nil || record.GetTimestamp() == nil || !record.GetTimestamp().IsValid() {
			continue
		}
		result = append(result, vehicleUnit{
			Timestamp:        timestampValue(record.GetTimestamp()),
			ManufacturerCode: record.GetManufacturerCode(),
			DeviceID:         maskHex(record.GetDeviceId()),
			SoftwareVersion:  strings.Trim(string(record.GetVuSoftwareVersion()), "\x00\xff "),
		})
	}
	return result
}

func controlDetail(data *cardv1.ControlActivityData) *controlRecord {
	if data == nil {
		return nil
	}
	if !data.GetValid() {
		return &controlRecord{Valid: false}
	}
	result := &controlRecord{
		Valid: true, ControlAt: timestampValue(data.GetControlTime()),
		Vehicle:     registrationValue(data.GetControlVehicleRegistration()),
		PeriodBegin: timestampValue(data.GetControlDownloadPeriodBegin()),
		PeriodEnd:   timestampValue(data.GetControlDownloadPeriodEnd()),
	}
	if kind := data.GetControlType(); kind != nil {
		if kind.GetCardDownloading() {
			result.Actions = append(result.Actions, "CARD_DOWNLOADING")
		}
		if kind.GetVuDownloading() {
			result.Actions = append(result.Actions, "VU_DOWNLOADING")
		}
		if kind.GetPrinting() {
			result.Actions = append(result.Actions, "PRINTING")
		}
		if kind.GetDisplay() {
			result.Actions = append(result.Actions, "DISPLAY")
		}
		if kind.GetCalibrationChecking() {
			result.Actions = append(result.Actions, "CALIBRATION_CHECKING")
		}
	}
	return result
}

func populateCardMetadata(result *dddSummary, identification *cardv1.DriverCardIdentification, licence *cardv1.DrivingLicenceInfo, download *cardv1.CardDownloadDriver, usage *cardv1.CurrentUsage) {
	metadata := cardMetadata{
		PreferredLanguage: strings.TrimSpace(identification.GetCardHolderPreferredLanguage().GetValue()),
		IssuingState:      strings.TrimPrefix(identification.GetCardIssuingMemberState().String(), "NATION_NUMERIC_"),
		IssuingAuthority:  strings.TrimSpace(identification.GetCardIssuingAuthorityName().GetValue()),
		IssueDate:         timestampValue(identification.GetCardIssueDate()),
		ValidityBegin:     timestampValue(identification.GetCardValidityBegin()),
	}
	if birth := identification.GetCardHolderBirthDate(); birth != nil && birth.GetYear() > 0 {
		metadata.BirthDate = fmt.Sprintf("%04d-%02d-%02d", birth.GetYear(), birth.GetMonth(), birth.GetDay())
	}
	if licence != nil {
		metadata.LicenceNumberMasked = maskIdentifier(strings.TrimSpace(licence.GetDrivingLicenceNumber().GetValue()))
		metadata.LicenceNation = strings.TrimPrefix(licence.GetDrivingLicenceIssuingNation().String(), "NATION_NUMERIC_")
		metadata.LicenceAuthority = strings.TrimSpace(licence.GetDrivingLicenceIssuingAuthority().GetValue())
	}
	if download != nil {
		metadata.PreviousDownloadAt = timestampValue(download.GetTimestamp())
	}
	if usage != nil {
		metadata.CurrentSessionOpened = timestampValue(usage.GetSessionOpenTime())
		metadata.CurrentVehicle = registrationValue(usage.GetSessionOpenVehicle())
	}
	result.CardMetadata = metadata
}

func maskIdentifier(value string) string {
	if len(value) <= 4 {
		return value
	}
	return strings.Repeat("•", len(value)-4) + value[len(value)-4:]
}

func maskHex(value []byte) string {
	encoded := hex.EncodeToString(value)
	if len(encoded) <= 8 {
		return encoded
	}
	return encoded[:4] + "••••" + encoded[len(encoded)-4:]
}

func eventDetails(records []*cardv1.EventsData_Record) []cardIncident {
	result := make([]cardIncident, 0, len(records))
	for _, record := range records {
		if record == nil {
			continue
		}
		detail := cardIncident{
			Type:         strings.TrimPrefix(record.GetEventType().String(), "EVENT_FAULT_TYPE_"),
			BeginAt:      timestampValue(record.GetEventBeginTime()),
			EndAt:        timestampValue(record.GetEventEndTime()),
			Registration: registrationValue(record.GetEventVehicleRegistration()),
		}
		if detail.Type == "UNSPECIFIED" && detail.BeginAt == "" && detail.EndAt == "" && detail.Registration == "" {
			continue
		}
		result = append(result, detail)
	}
	return result
}

func faultDetails(records []*cardv1.FaultsData_Record) []cardIncident {
	result := make([]cardIncident, 0, len(records))
	for _, record := range records {
		if record == nil {
			continue
		}
		detail := cardIncident{
			Type:         strings.TrimPrefix(record.GetFaultType().String(), "EVENT_FAULT_TYPE_"),
			BeginAt:      timestampValue(record.GetFaultBeginTime()),
			EndAt:        timestampValue(record.GetFaultEndTime()),
			Registration: registrationValue(record.GetFaultVehicleRegistration()),
		}
		if detail.Type == "UNSPECIFIED" && detail.BeginAt == "" && detail.EndAt == "" && detail.Registration == "" {
			continue
		}
		result = append(result, detail)
	}
	return result
}

func timestampValue(value *timestamppb.Timestamp) string {
	if value == nil || !value.IsValid() {
		return ""
	}
	return value.AsTime().UTC().Format(time.RFC3339)
}

func registrationValue(value *ddv1.VehicleRegistrationIdentification) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(value.GetNumber().GetValue())
}

func countAuthentications(message protoreflect.Message) (verified int, total int) {
	if !message.IsValid() {
		return 0, 0
	}
	if string(message.Descriptor().FullName()) == "wayplatform.connect.tachograph.security.v1.Authentication" {
		if authentication, ok := message.Interface().(*securityv1.Authentication); ok {
			total++
			if authentication.GetStatus() == securityv1.Authentication_VERIFIED {
				verified++
			}
		}
		return verified, total
	}
	message.Range(func(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		if field.IsList() && field.Kind() == protoreflect.MessageKind {
			list := value.List()
			for index := 0; index < list.Len(); index++ {
				v, t := countAuthentications(list.Get(index).Message())
				verified += v
				total += t
			}
		} else if field.IsMap() && field.MapValue().Kind() == protoreflect.MessageKind {
			value.Map().Range(func(_ protoreflect.MapKey, item protoreflect.Value) bool {
				v, t := countAuthentications(item.Message())
				verified += v
				total += t
				return true
			})
		} else if field.Kind() == protoreflect.MessageKind {
			v, t := countAuthentications(value.Message())
			verified += v
			total += t
		}
		return true
	})
	return verified, total
}

func loadDispatchContext(ctx context.Context, sessionToken string) (*dispatchContext, error) {
	var result dispatchContext
	if err := callRPC(ctx, "get_dispatch_ddd_context", map[string]any{"p_session_token": sessionToken}, &result); err != nil {
		return nil, err
	}
	if !result.OK || result.Error != "" {
		if result.Error == "" {
			result.Error = "Brak dostępu do importu DDD"
		}
		return nil, errors.New(result.Error)
	}
	return &result, nil
}

func loadImportDetail(ctx context.Context, sessionToken, importID string) (*detailResponse, error) {
	var result detailResponse
	if err := callRPC(ctx, "get_dispatch_ddd_import_detail", map[string]any{
		"p_session_token": sessionToken,
		"p_import_id":     importID,
	}, &result); err != nil {
		return nil, err
	}
	if !result.OK || result.Error != "" || result.Summary == nil {
		if result.Error == "" {
			result.Error = "Nie znaleziono szczegółów odczytu DDD"
		}
		return nil, errors.New(result.Error)
	}
	return &result, nil
}

func saveImport(ctx context.Context, sessionToken, employeeID, downloadedAt string, data []byte, summary *dddSummary) (*saveResponse, error) {
	payload := map[string]any{
		"p_session_token":       sessionToken,
		"p_employee_id":         employeeID,
		"p_file_name":           summary.FileName,
		"p_file_sha256":         summary.SHA256,
		"p_file_base64":         base64.StdEncoding.EncodeToString(data),
		"p_card_number":         summary.CardNumber,
		"p_generation":          summary.Generation,
		"p_downloaded_at":       downloadedAt,
		"p_activity_first_on":   nullable(summary.ActivityFirstOn),
		"p_activity_last_on":    nullable(summary.ActivityLastOn),
		"p_activity_days":       summary.ActivityDays,
		"p_vehicle_sessions":    summary.VehicleSessions,
		"p_event_count":         summary.EventCount,
		"p_fault_count":         summary.FaultCount,
		"p_signature_status":    summary.SignatureStatus,
		"p_signatures_verified": summary.SignaturesVerified,
		"p_signatures_total":    summary.SignaturesTotal,
		"p_summary":             summary,
	}
	var result saveResponse
	if err := callRPC(ctx, "save_driver_card_ddd_import", payload, &result); err != nil {
		return nil, err
	}
	if !result.OK || result.Error != "" {
		return nil, errors.New(result.Error)
	}
	return &result, nil
}

func callRPC(ctx context.Context, function string, payload any, target any) error {
	baseURL := firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL")
	anonKey := firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
	if baseURL == "" || anonKey == "" {
		return errors.New("brak konfiguracji połączenia z bazą")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/rest/v1/rpc/"+function, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	request.Header.Set("apikey", anonKey)
	request.Header.Set("Authorization", "Bearer "+anonKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("baza danych jest chwilowo niedostępna: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var rpcError struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(responseBody, &rpcError)
		if rpcError.Message == "" {
			rpcError.Message = "operacja bazy danych nie powiodła się"
		}
		return errors.New(rpcError.Message)
	}
	if err := json.Unmarshal(responseBody, target); err != nil {
		return fmt.Errorf("nieprawidłowa odpowiedź bazy danych: %w", err)
	}
	return nil
}

func timestampFromFilename(fileName string) string {
	match := fileTimestampPattern.FindStringSubmatch(fileName)
	if len(match) < 2 {
		return ""
	}
	location, err := time.LoadLocation("Europe/Warsaw")
	if err != nil {
		location = time.UTC
	}
	parsed, err := time.ParseInLocation("20060102150405", match[1], location)
	if err != nil {
		return ""
	}
	return parsed.Format(time.RFC3339)
}

func matchDriver(summary *dddSummary, drivers []driverOption) {
	for _, driver := range drivers {
		if driver.CardNumber != "" && driver.CardNumber == summary.CardNumber {
			summary.MatchedEmployeeID = driver.EmployeeID
			summary.MatchedEmployeeName = driver.Name
			return
		}
	}
	wanted := normalizeName(summary.FirstName + " " + summary.Surname)
	for _, driver := range drivers {
		if normalizeName(driver.Name) == wanted {
			summary.MatchedEmployeeID = driver.EmployeeID
			summary.MatchedEmployeeName = driver.Name
			return
		}
	}
}

func normalizeName(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func publicDrivers(drivers []driverOption) []driverOption {
	result := make([]driverOption, len(drivers))
	for index, driver := range drivers {
		result[index] = driverOption{EmployeeID: driver.EmployeeID, Name: driver.Name}
	}
	return result
}

func containsDriver(drivers []driverOption, employeeID string) bool {
	for _, driver := range drivers {
		if driver.EmployeeID == employeeID {
			return true
		}
	}
	return false
}

func maskCardNumber(value string) string {
	if len(value) <= 8 {
		return value
	}
	return value[:4] + " •••• •••• " + value[len(value)-4:]
}

func countNonNil[T any](values []*T) int {
	count := 0
	for _, value := range values {
		if value != nil {
			count++
		}
	}
	return count
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
