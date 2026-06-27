using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lebuser.TunnelGateway.Models;

namespace Lebuser.TunnelGateway.Desktop;

/// <summary>
/// Native WinForms control for managing laundry bags at the operator station.
/// Communicates with the in-process gateway API over localhost.
/// </summary>
public sealed class BagManagerPanel : UserControl
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };

    private readonly string _apiBase;
    private readonly System.Windows.Forms.Timer _refreshTimer;

    // --- Controls ---
    private readonly DataGridView _grid;
    private readonly ToolStrip _toolbar;
    private readonly Panel _quickAddPanel;
    private readonly TextBox _txtCode;
    private readonly TextBox _txtHotel;
    private readonly NumericUpDown _numProgram;
    private readonly NumericUpDown _numTrack;
    private readonly TextBox _txtOperator;
    private readonly Button _btnAdd;
    private readonly StatusStrip _statusBar;
    private readonly ToolStripStatusLabel _statusLabel;
    private readonly ToolStripStatusLabel _countLabel;

    public BagManagerPanel(string apiBase)
    {
        _apiBase = apiBase.TrimEnd('/');
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(244, 246, 248);
        Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

        // ===== TOOLBAR =====
        _toolbar = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden,
            BackColor = Color.White,
            Padding = new Padding(8, 4, 8, 4),
            RenderMode = ToolStripRenderMode.System,
            ImageScalingSize = new Size(20, 20),
        };

        var btnRefresh = new ToolStripButton("Odśwież") { DisplayStyle = ToolStripItemDisplayStyle.Text };
        btnRefresh.Click += async (_, _) => await RefreshBagsAsync();

        var btnSend = new ToolStripButton("▶ Wyślij do Tunelu") { DisplayStyle = ToolStripItemDisplayStyle.Text };
        btnSend.Font = new Font(btnSend.Font, FontStyle.Bold);
        btnSend.ForeColor = Color.FromArgb(16, 185, 129);
        btnSend.Click += async (_, _) => await SendSelectedAsync();

        var btnAdvance = new ToolStripButton("⏩ Popchnij dalej") { DisplayStyle = ToolStripItemDisplayStyle.Text };
        btnAdvance.ForeColor = Color.FromArgb(10, 132, 255);
        btnAdvance.Click += async (_, _) => await AdvanceSelectedAsync();

        _toolbar.Items.AddRange([
            new ToolStripLabel("LEBUSER Wash Manager") { Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = Color.FromArgb(15, 23, 42) },
            new ToolStripSeparator(),
            btnRefresh,
            new ToolStripSeparator(),
            btnSend,
            btnAdvance,
        ]);

        // ===== DATA GRID =====
        _grid = new DataGridView
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AllowUserToResizeRows = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect = false,
            RowHeadersVisible = false,
            BorderStyle = BorderStyle.None,
            BackgroundColor = Color.FromArgb(248, 250, 252),
            GridColor = Color.FromArgb(226, 232, 240),
            CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal,
            ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.None,
            EnableHeadersVisualStyles = false,
            RowTemplate = { Height = 42 },
        };

        _grid.ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(8, 0, 0, 0),
            Alignment = DataGridViewContentAlignment.MiddleLeft,
        };
        _grid.ColumnHeadersHeight = 40;

        _grid.DefaultCellStyle = new DataGridViewCellStyle
        {
            Font = new Font("Segoe UI", 9.5f),
            Padding = new Padding(8, 0, 0, 0),
            SelectionBackColor = Color.FromArgb(219, 234, 254),
            SelectionForeColor = Color.FromArgb(15, 23, 42),
        };

        _grid.AlternatingRowsDefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.FromArgb(241, 245, 249),
        };

        _grid.Columns.AddRange(
            new DataGridViewTextBoxColumn { Name = "Code", HeaderText = "Kod", FillWeight = 12 },
            new DataGridViewTextBoxColumn { Name = "HotelName", HeaderText = "Hotel / Klient", FillWeight = 25 },
            new DataGridViewTextBoxColumn { Name = "ProgramNumber", HeaderText = "Program", FillWeight = 10 },
            new DataGridViewTextBoxColumn { Name = "TrackNumber", HeaderText = "Tor", FillWeight = 8 },
            new DataGridViewTextBoxColumn { Name = "Status", HeaderText = "Status", FillWeight = 12 },
            new DataGridViewTextBoxColumn { Name = "RequestedBy", HeaderText = "Operator", FillWeight = 12 },
            new DataGridViewTextBoxColumn { Name = "CreatedAt", HeaderText = "Dodano", FillWeight = 15 },
            new DataGridViewTextBoxColumn { Name = "Id", HeaderText = "ID", Visible = false }
        );

        _grid.CellFormatting += OnCellFormatting;

        // ===== QUICK ADD PANEL =====
        _quickAddPanel = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 60,
            BackColor = Color.White,
            Padding = new Padding(12, 10, 12, 10),
        };

        var addFlow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            AutoSize = false,
        };

        _txtCode = CreateTextBox("Kod worka", 100);
        _txtHotel = CreateTextBox("Hotel / Klient", 180);
        _numProgram = new NumericUpDown { Minimum = 1, Maximum = 999, Value = 1, Width = 70, Font = Font };
        _numTrack = new NumericUpDown { Minimum = 1, Maximum = 9, Value = 1, Width = 60, Font = Font };
        _txtOperator = CreateTextBox("Operator", 110);
        _txtOperator.Text = "Operator";

        _btnAdd = new Button
        {
            Text = "➕ Dodaj worek",
            Width = 130,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(10, 132, 255),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            Cursor = Cursors.Hand,
        };
        _btnAdd.FlatAppearance.BorderSize = 0;
        _btnAdd.Click += async (_, _) => await AddBagAsync();

        addFlow.Controls.AddRange([
            WrapWithLabel("Kod:", _txtCode),
            WrapWithLabel("Hotel:", _txtHotel),
            WrapWithLabel("Prog:", _numProgram),
            WrapWithLabel("Tor:", _numTrack),
            WrapWithLabel("Oper.:", _txtOperator),
            _btnAdd,
        ]);

        _quickAddPanel.Controls.Add(addFlow);

        // ===== STATUS BAR =====
        _statusBar = new StatusStrip { BackColor = Color.FromArgb(30, 41, 59) };
        _statusLabel = new ToolStripStatusLabel("Gotowy") { ForeColor = Color.White, Spring = true, TextAlign = ContentAlignment.MiddleLeft };
        _countLabel = new ToolStripStatusLabel("0 worków") { ForeColor = Color.FromArgb(148, 163, 184) };
        _statusBar.Items.AddRange([_statusLabel, _countLabel]);

        // ===== LAYOUT =====
        Controls.Add(_grid);
        Controls.Add(_quickAddPanel);
        Controls.Add(_toolbar);
        Controls.Add(_statusBar);

        // ===== REFRESH TIMER =====
        _refreshTimer = new System.Windows.Forms.Timer { Interval = 2500 };
        _refreshTimer.Tick += async (_, _) => await RefreshBagsAsync();
        _refreshTimer.Start();

        // Initial load
        Load += async (_, _) => await RefreshBagsAsync();
    }

    // --- API Operations ---

    private async Task RefreshBagsAsync()
    {
        try
        {
            var bags = await Http.GetFromJsonAsync<List<BagDto>>($"{_apiBase}/api/bags", JsonOptions);
            if (bags == null) return;

            var selectedId = GetSelectedBagId();

            _grid.Rows.Clear();
            foreach (var bag in bags)
            {
                var rowIndex = _grid.Rows.Add(
                    bag.Code,
                    bag.HotelName,
                    bag.ProgramNumber,
                    bag.TrackNumber,
                    FormatStatus(bag.Status),
                    bag.RequestedBy,
                    bag.CreatedAt?.ToLocalTime().ToString("dd.MM HH:mm:ss") ?? "-",
                    bag.Id
                );

                if (bag.Id == selectedId)
                {
                    _grid.Rows[rowIndex].Selected = true;
                }
            }

            _countLabel.Text = $"{bags.Count} worków";
        }
        catch (Exception ex)
        {
            _statusLabel.Text = $"Błąd: {ex.Message}";
        }
    }

    private async Task AddBagAsync()
    {
        var code = _txtCode.Text.Trim();
        if (string.IsNullOrEmpty(code))
        {
            code = $"W-{DateTime.Now:HHmmss}";
        }

        var hotel = _txtHotel.Text.Trim();
        if (string.IsNullOrEmpty(hotel))
        {
            _statusLabel.Text = "Podaj nazwę hotelu.";
            _txtHotel.Focus();
            return;
        }

        _btnAdd.Enabled = false;
        _statusLabel.Text = "Dodawanie...";

        try
        {
            var payload = new
            {
                Code = code,
                HotelName = hotel,
                ProgramNumber = (int)_numProgram.Value,
                TrackNumber = (int)_numTrack.Value,
                RequestedBy = _txtOperator.Text.Trim()
            };

            var response = await Http.PostAsJsonAsync($"{_apiBase}/api/bags", payload, JsonOptions);
            if (response.IsSuccessStatusCode)
            {
                _statusLabel.Text = $"Worek {code} dodany.";
                _txtCode.Text = "";
                _txtHotel.Text = "";
                await RefreshBagsAsync();
            }
            else
            {
                _statusLabel.Text = $"Błąd: {response.StatusCode}";
            }
        }
        catch (Exception ex)
        {
            _statusLabel.Text = $"Błąd: {ex.Message}";
        }
        finally
        {
            _btnAdd.Enabled = true;
        }
    }

    private async Task SendSelectedAsync()
    {
        var id = GetSelectedBagId();
        if (id == null)
        {
            _statusLabel.Text = "Zaznacz worek do wysłania.";
            return;
        }

        _statusLabel.Text = "Wysyłanie do tunelu (PLC)...";

        try
        {
            var response = await Http.PostAsync($"{_apiBase}/api/bags/{id}/send", null);
            if (response.IsSuccessStatusCode)
            {
                _statusLabel.Text = "Worek wysłany do tunelu!";
                await RefreshBagsAsync();
            }
            else
            {
                _statusLabel.Text = $"Gateway odrzucił: {response.StatusCode}";
            }
        }
        catch (Exception ex)
        {
            _statusLabel.Text = $"Błąd PLC: {ex.Message}";
        }
    }

    private async Task AdvanceSelectedAsync()
    {
        var id = GetSelectedBagId();
        if (id == null)
        {
            _statusLabel.Text = "Zaznacz worek do pchnięcia.";
            return;
        }

        try
        {
            var response = await Http.PostAsync($"{_apiBase}/api/bags/{id}/advance", null);
            if (response.IsSuccessStatusCode)
            {
                _statusLabel.Text = "Status worka zaktualizowany.";
                await RefreshBagsAsync();
            }
        }
        catch (Exception ex)
        {
            _statusLabel.Text = $"Błąd: {ex.Message}";
        }
    }

    // --- Helpers ---

    private string? GetSelectedBagId()
    {
        if (_grid.SelectedRows.Count == 0) return null;
        return _grid.SelectedRows[0].Cells["Id"].Value?.ToString();
    }

    private static string FormatStatus(string? status) => status switch
    {
        "queued" => "⏳ Oczekuje",
        "entry" => "📥 Wejście",
        "wash" => "🫧 Pranie",
        "rinse" => "💧 Płukanie",
        "dry" => "🔥 Suszenie",
        "pack" => "📦 Pakowanie",
        "done" => "✅ Zakończony",
        "error" => "❌ Błąd",
        "cancelled" => "🚫 Anulowany",
        _ => status ?? "-",
    };

    private void OnCellFormatting(object? sender, DataGridViewCellFormattingEventArgs e)
    {
        if (_grid.Columns[e.ColumnIndex].Name != "Status" || e.Value == null) return;

        var text = e.Value.ToString() ?? "";
        e.CellStyle!.ForeColor = text switch
        {
            _ when text.Contains("Oczekuje") => Color.FromArgb(245, 158, 11),
            _ when text.Contains("Pranie") || text.Contains("Płukanie") || text.Contains("Suszenie") => Color.FromArgb(139, 92, 246),
            _ when text.Contains("Wejście") => Color.FromArgb(10, 132, 255),
            _ when text.Contains("Pakowanie") => Color.FromArgb(6, 182, 212),
            _ when text.Contains("Zakończony") => Color.FromArgb(16, 185, 129),
            _ when text.Contains("Błąd") => Color.FromArgb(239, 68, 68),
            _ => e.CellStyle.ForeColor,
        };
        e.CellStyle.Font = new Font(e.CellStyle.Font!, FontStyle.Bold);
    }

    private TextBox CreateTextBox(string placeholder, int width)
    {
        var tb = new TextBox
        {
            Width = width,
            Height = 30,
            Font = Font,
            PlaceholderText = placeholder,
            BorderStyle = BorderStyle.FixedSingle,
        };
        return tb;
    }

    private static Panel WrapWithLabel(string labelText, Control control)
    {
        var panel = new Panel { Width = control.Width + 4, Height = 40, Margin = new Padding(0, 0, 8, 0) };
        var label = new Label
        {
            Text = labelText,
            AutoSize = true,
            Location = new Point(0, 0),
            Font = new Font("Segoe UI", 8f, FontStyle.Bold),
            ForeColor = Color.FromArgb(100, 116, 139),
        };
        control.Location = new Point(0, 16);
        panel.Controls.Add(label);
        panel.Controls.Add(control);
        return panel;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _refreshTimer.Dispose();
        }
        base.Dispose(disposing);
    }

    // Simple DTO for deserialization from /api/bags
    private sealed record BagDto
    {
        public string? Id { get; init; }
        public string? Code { get; init; }
        public string? HotelName { get; init; }
        public int ProgramNumber { get; init; }
        public int TrackNumber { get; init; }
        public string? Status { get; init; }
        public string? RequestedBy { get; init; }
        public DateTimeOffset? CreatedAt { get; init; }
    }
}
