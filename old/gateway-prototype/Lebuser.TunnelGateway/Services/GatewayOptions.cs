namespace Lebuser.TunnelGateway.Services;

public sealed class GatewayOptions
{
    public string ListenUrl { get; set; } = "http://127.0.0.1:5055";
    public bool DryRun { get; set; } = true;
    public string ApiKey { get; set; } = "";
    public string[] AllowedOrigins { get; set; } = [];
    public SerialOptions Serial { get; set; } = new();
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
