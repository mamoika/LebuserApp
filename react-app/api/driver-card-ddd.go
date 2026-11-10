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
)

const maxDDDSize = 2 << 20

var fileTimestampPattern = regexp.MustCompile(`(?i)(\d{14})(?:_[A-Z])?\.DDD$`)

type driverOption struct {
	EmployeeID string `json:"employee_id"`
	Name       string `json:"name"`
	CardNumber string `json:"card_number,omitempty"`
}

type importRow struct {
	ID                 string `json:"id"`
	EmployeeID         string `json:"employee_id"`
	EmployeeName       string `json:"employee_name"`
	FileName           string `json:"file_name"`
	DownloadedAt       string `json:"downloaded_at"`
	ImportedAt         string `json:"imported_at"`
	Generation         string `json:"generation"`
	SignatureStatus    string `json:"signature_status"`
	ActivityFirstOn    string `json:"activity_first_on"`
	ActivityLastOn     string `json:"activity_last_on"`
	ActivityDays       int    `json:"activity_days"`
	SignaturesVerified int    `json:"signatures_verified"`
	SignaturesTotal    int    `json:"signatures_total"`
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

type dddSummary struct {
	FileName            string         `json:"file_name"`
	FileSize            int            `json:"file_size"`
	SHA256              string         `json:"sha256"`
	Generation          string         `json:"generation"`
	CardNumber          string         `json:"card_number"`
	MaskedCardNumber    string         `json:"masked_card_number"`
	FirstName           string         `json:"first_name"`
	Surname             string         `json:"surname"`
	CardExpiryOn        string         `json:"card_expiry_on,omitempty"`
	DownloadedAt        string         `json:"downloaded_at,omitempty"`
	ActivityFirstOn     string         `json:"activity_first_on,omitempty"`
	ActivityLastOn      string         `json:"activity_last_on,omitempty"`
	ActivityDays        int            `json:"activity_days"`
	VehicleSessions     int            `json:"vehicle_sessions"`
	EventCount          int            `json:"event_count"`
	FaultCount          int            `json:"fault_count"`
	SignaturesVerified  int            `json:"signatures_verified"`
	SignaturesTotal     int            `json:"signatures_total"`
	SignatureStatus     string         `json:"signature_status"`
	Totals              activityTotals `json:"totals"`
	MatchedEmployeeID   string         `json:"matched_employee_id,omitempty"`
	MatchedEmployeeName string         `json:"matched_employee_name,omitempty"`
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
	if g2 := card.GetTachographG2(); g2 != nil {
		identification = g2.GetIdentification()
		activities = g2.GetDriverActivityData()
		result.Generation = "G2"
		if g2.GetApplicationIdentificationV2() != nil {
			result.Generation = "G2.2 (Smart V2)"
		}
		if vehicles := g2.GetVehiclesUsed(); vehicles != nil {
			result.VehicleSessions = countNonNil(vehicles.GetRecords())
		}
		if events := g2.GetEventsData(); events != nil {
			result.EventCount = countNonNil(events.GetEvents())
		}
		if faults := g2.GetFaultsData(); faults != nil {
			result.FaultCount = countNonNil(faults.GetFaults())
		}
	} else if g1 := card.GetTachograph(); g1 != nil {
		identification = g1.GetIdentification()
		activities = g1.GetDriverActivityData()
		result.Generation = "G1"
		if vehicles := g1.GetVehiclesUsed(); vehicles != nil {
			result.VehicleSessions = countNonNil(vehicles.GetRecords())
		}
		if events := g1.GetEventsData(); events != nil {
			result.EventCount = countNonNil(events.GetEvents())
		}
		if faults := g1.GetFaultsData(); faults != nil {
			result.FaultCount = countNonNil(faults.GetFaults())
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
	result.DownloadedAt = timestampFromFilename(fileName)
	if result.DownloadedAt == "" {
		result.DownloadedAt = time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	}

	populateActivities(result, activities)
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
		date    time.Time
		changes []*ddv1.ActivityChangeInfo
	}
	days := map[string]dayData{}
	for _, record := range activities.GetDailyRecords() {
		if record == nil || !record.GetValid() || record.GetActivityRecordDate() == nil || !record.GetActivityRecordDate().IsValid() {
			continue
		}
		date := record.GetActivityRecordDate().AsTime().UTC()
		key := date.Format("2006-01-02")
		days[key] = dayData{date: date, changes: record.GetActivityChangeInfo()}
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
			switch change.GetActivity() {
			case ddv1.DriverActivityValue_DRIVING:
				result.Totals.DrivingMinutes += duration
			case ddv1.DriverActivityValue_WORK:
				result.Totals.WorkMinutes += duration
			case ddv1.DriverActivityValue_AVAILABILITY:
				result.Totals.AvailabilityMinutes += duration
			case ddv1.DriverActivityValue_BREAK_REST:
				result.Totals.RestMinutes += duration
			}
		}
	}
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
