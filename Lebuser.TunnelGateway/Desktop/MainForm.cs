using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Lebuser.TunnelGateway.Desktop;

/// <summary>
/// The WinWash station window: TabControl with two views:
///   1. Tunnel visualisation (WebView2)
///   2. Bag management (native WinForms DataGridView)
/// </summary>
public sealed class MainForm : Form
{
    private readonly string _startUrl;
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly TabControl _tabs;
    private bool _isFullScreen;
    private FormWindowState _stateBeforeFullScreen = FormWindowState.Maximized;

    public MainForm(string startUrl)
    {
        _startUrl = startUrl;

        Text = "LEBUSER WinWash";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(960, 600);
        BackColor = Color.FromArgb(244, 246, 248);
        KeyPreview = true;

        // --- Tab Control ---
        _tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Padding = new Point(16, 6),
            Appearance = TabAppearance.FlatButtons,
        };

        // Tab 1: Tunnel WebView2
        var tunnelTab = new TabPage("  🔧  Podgląd Tunelu  ")
        {
            BackColor = Color.FromArgb(244, 246, 248),
            Padding = Padding.Empty,
        };
        tunnelTab.Controls.Add(_webView);

        // Tab 2: Bag Manager
        var apiBase = startUrl.TrimEnd('/').Replace("/winwash.html", "");
        var bagsTab = new TabPage("  🧺  Zarządzanie Workami  ")
        {
            BackColor = Color.FromArgb(244, 246, 248),
            Padding = Padding.Empty,
        };
        bagsTab.Controls.Add(new BagManagerPanel(apiBase));

        _tabs.TabPages.Add(tunnelTab);
        _tabs.TabPages.Add(bagsTab);

        Controls.Add(_tabs);

        KeyDown += OnKeyDown;
        Load += async (_, _) => await InitializeWebViewAsync();
    }

    private async Task InitializeWebViewAsync()
    {
        // Keep the browser profile in a writable per-user folder so the app also works
        // when installed under Program Files.
        var dataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Lebuser", "WinWash", "WebView2");
        Directory.CreateDirectory(dataFolder);

        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(browserExecutableFolder: null, userDataFolder: dataFolder);
            await _webView.EnsureCoreWebView2Async(environment);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Nie udało się uruchomić widoku WebView2.\n\n" +
                "Zainstaluj \"Microsoft Edge WebView2 Runtime\" i spróbuj ponownie.\n\n" + ex.Message,
                "LEBUSER WinWash",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
            return;
        }

        var core = _webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsSwipeNavigationEnabled = false;

        _webView.Source = new Uri(_startUrl);
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        switch (e.KeyCode)
        {
            case Keys.F5:
                _webView.CoreWebView2?.Reload();
                e.Handled = true;
                break;
            case Keys.F11:
                ToggleFullScreen();
                e.Handled = true;
                break;
            case Keys.Escape when _isFullScreen:
                ToggleFullScreen();
                e.Handled = true;
                break;
        }
    }

    private void ToggleFullScreen()
    {
        _isFullScreen = !_isFullScreen;

        if (_isFullScreen)
        {
            _stateBeforeFullScreen = WindowState == FormWindowState.Minimized ? FormWindowState.Maximized : WindowState;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = _stateBeforeFullScreen;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}
