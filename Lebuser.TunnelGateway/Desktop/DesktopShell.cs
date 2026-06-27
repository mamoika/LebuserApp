namespace Lebuser.TunnelGateway.Desktop;

public static class DesktopShell
{
    /// <summary>
    /// Turns the gateway listen URL into something the embedded window can actually open.
    /// A wildcard host (0.0.0.0, +, *) is fine for Kestrel but not navigable, so we pin to loopback.
    /// </summary>
    public static string ResolveBrowseUrl(string listenUrl)
    {
        var url = string.IsNullOrWhiteSpace(listenUrl) ? "http://127.0.0.1:5055" : listenUrl.Trim();

        url = url
            .Replace("//0.0.0.0", "//127.0.0.1")
            .Replace("//+", "//127.0.0.1")
            .Replace("//*", "//127.0.0.1");

        return url.TrimEnd('/') + "/winwash.html";
    }
}
