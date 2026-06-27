using Lebuser.TunnelGateway.Models;
using Lebuser.TunnelGateway.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);
var startupOptions = builder.Configuration.GetSection("Gateway").Get<GatewayOptions>() ?? new GatewayOptions();

builder.WebHost.UseUrls(startupOptions.ListenUrl);
builder.Services.Configure<GatewayOptions>(builder.Configuration.GetSection("Gateway"));
builder.Services.AddSingleton<GatewayState>();
builder.Services.AddSingleton<IPlcTransport>(serviceProvider =>
{
    var options = serviceProvider.GetRequiredService<IOptions<GatewayOptions>>().Value;
    var loggerFactory = serviceProvider.GetRequiredService<ILoggerFactory>();
    return options.DryRun
        ? new DryRunPlcTransport(options, loggerFactory.CreateLogger<DryRunPlcTransport>())
        : new SerialPlcTransport(options, loggerFactory.CreateLogger<SerialPlcTransport>());
});

builder.Services.AddCors(cors =>
{
    cors.AddPolicy("LebuserBrowser", policy =>
    {
        var origins = startupOptions.AllowedOrigins.Where(origin => !string.IsNullOrWhiteSpace(origin)).ToArray();
        if (origins.Length > 0)
        {
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseCors("LebuserBrowser");
app.Use(async (context, next) =>
{
    var options = context.RequestServices.GetRequiredService<IOptions<GatewayOptions>>().Value;
    if (!string.IsNullOrWhiteSpace(options.ApiKey) && !context.Request.Path.StartsWithSegments("/health"))
    {
        var providedKey = context.Request.Headers["X-Lebuser-Gateway-Key"].ToString();
        if (!string.Equals(providedKey, options.ApiKey, StringComparison.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Unauthorized gateway request" });
            return;
        }
    }

    await next();
});

app.MapGet("/health", () => Results.Ok(new
{
    ok = true,
    service = "Lebuser Tunnel Gateway",
    checkedAt = DateTimeOffset.UtcNow
}));

app.MapGet("/api/status", async (IPlcTransport transport, GatewayState state, CancellationToken cancellationToken) =>
{
    var status = await transport.GetStatusAsync(cancellationToken);
    return Results.Ok(new
    {
        status.Connected,
        status.DryRun,
        status.Transport,
        status.PortName,
        status.LastError,
        status.CheckedAt,
        RecentCommands = state.Recent().Count
    });
});

app.MapGet("/api/tunnel/commands", (GatewayState state) => Results.Ok(state.Recent()));

app.MapPost("/api/tunnel/send", async (
    TunnelCommand command,
    IPlcTransport transport,
    GatewayState state,
    CancellationToken cancellationToken) =>
{
    var errors = Validate(command);
    if (errors.Count > 0)
    {
        return Results.ValidationProblem(errors);
    }

    var normalized = command with
    {
        CommandId = string.IsNullOrWhiteSpace(command.CommandId) ? Guid.NewGuid().ToString("N") : command.CommandId.Trim(),
        RequestedAt = command.RequestedAt == default ? DateTimeOffset.UtcNow : command.RequestedAt
    };

    var receipt = await transport.SendAsync(normalized, cancellationToken);
    state.Record(normalized, receipt);

    return Results.Accepted($"/api/tunnel/commands/{receipt.Id}", receipt);
});

app.Run();

static Dictionary<string, string[]> Validate(TunnelCommand command)
{
    var errors = new Dictionary<string, string[]>();

    if (string.IsNullOrWhiteSpace(command.BagId))
    {
        errors["bagId"] = ["Bag ID is required."];
    }

    if (string.IsNullOrWhiteSpace(command.HotelName))
    {
        errors["hotelName"] = ["Hotel name is required."];
    }

    if (command.ProgramNumber is < 1 or > 999)
    {
        errors["programNumber"] = ["Program number must be between 1 and 999."];
    }

    if (command.TrackNumber is < 1 or > 999)
    {
        errors["trackNumber"] = ["Track number must be between 1 and 999."];
    }

    return errors;
}
