namespace Lebuser.TunnelGateway.Services;

public sealed class GatewayOptions
{
    public string ListenUrl { get; set; } = "http://127.0.0.1:5055";
    public bool DryRun { get; set; } = true;
    public string ApiKey { get; set; } = "";
    public string[] AllowedOrigins { get; set; } = [];
    public string ActiveTransport { get; set; } = "Serial"; // "Serial" or "Network"
    public SerialOptions Serial { get; set; } = new();
    public NetworkOptions Network { get; set; } = new();
    public SupabaseOptions Supabase { get; set; } = new();
}

public sealed class SerialOptions
{
    public string PortName { get; set; } = "COM1";
    public int BaudRate { get; set; } = 9600;
    public string Parity { get; set; } = "None";
    public int DataBits { get; set; } = 8;
    public string StopBits { get; set; } = "One";
    public int ReadTimeoutMs { get; set; } = 1000;
    public int WriteTimeoutMs { get; set; } = 1000;
    public string NewLine { get; set; } = "\r\n";
}

public sealed class NetworkOptions
{
    public string IpAddress { get; set; } = "192.168.1.10";
    public int Port { get; set; } = 2000;
    public int ConnectTimeoutMs { get; set; } = 2000;
    public int ReadTimeoutMs { get; set; } = 2000;
    public int WriteTimeoutMs { get; set; } = 2000;
}

public sealed class SupabaseOptions
{
    public bool Enabled { get; set; }
    public string Url { get; set; } = "";
    public string ServiceRoleKey { get; set; } = "";
    public string GatewayId { get; set; } = "main-tunnel";
    public int StatusIntervalSeconds { get; set; } = 5;
}
