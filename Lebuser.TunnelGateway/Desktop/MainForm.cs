using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;

namespace Lebuser.TunnelGateway.Desktop;

/// <summary>
/// The WinWash station window: Fullscreen WebView2 hosting the modern winwash.html interface.
/// </summary>
public sealed class MainForm : Form
{
    private readonly string _startUrl;
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private bool _isFullScreen;
    private FormWindowState _stateBeforeFullScreen = FormWindowState.Maximized;

    public MainForm(string startUrl)
    {
        _startUrl = startUrl;

        Text = "LEBUSER WinWash";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(960, 600);
        BackColor = Color.FromArgb(15, 23, 42); // Modern dark color while loading
        KeyPreview = true;

        Controls.Add(_webView);

        Load += OnLoad;
        FormClosing += OnFormClosing;
        KeyDown += OnKeyDown;
    }

    private async void OnLoad(object? sender, EventArgs e)
    {
        try
        {
            var userDataFolder = Path.Combine(Path.GetTempPath(), "LebuserWinWashWebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, null);
            await _webView.EnsureCoreWebView2Async(env);
            
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

            _webView.Source = new Uri(_startUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Zainstaluj \"Microsoft Edge WebView2 Runtime\" i spróbuj ponownie.\n\n" + ex.Message,
                "Błąd przeglądarki",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F5)
        {
            _webView.Reload();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F11)
        {
            ToggleFullScreen();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.Escape && _isFullScreen)
        {
            ToggleFullScreen();
            e.Handled = true;
        }
    }

    private void ToggleFullScreen()
    {
        if (_isFullScreen)
        {
            WindowState = _stateBeforeFullScreen;
            FormBorderStyle = FormBorderStyle.Sizable;
            TopMost = false;
            _isFullScreen = false;
        }
        else
        {
            _stateBeforeFullScreen = WindowState;
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
            TopMost = true;
            _isFullScreen = true;
        }
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        _webView.Dispose();
    }
}
