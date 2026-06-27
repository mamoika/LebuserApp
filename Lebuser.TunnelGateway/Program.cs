using Lebuser.TunnelGateway.Desktop;
using Lebuser.TunnelGateway.Models;
using Lebuser.TunnelGateway.Services;
using Microsoft.Extensions.Options;

namespace Lebuser.TunnelGateway;

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        var headless = args.Contains("--headless", StringComparer.OrdinalIgnoreCase);

        // One station = one running instance, otherwise the second copy fights for the port.
        using var singleInstance = new Mutex(initiallyOwned: true, "Lebuser.WinWash.SingleInstance", out var isFirstInstance);
        if (!isFirstInstance && !headless)
        {
            MessageBox.Show(
                "LEBUSER WinWash już działa na tej stacji.",
                "LEBUSER WinWash",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory
        });
        var startupOptions = builder.Configuration.GetSection("Gateway").Get<GatewayOptions>() ?? new GatewayOptions();

        builder.WebHost.UseUrls(startupOptions.ListenUrl);
        builder.Services.Configure<GatewayOptions>(builder.Configuration.GetSection("Gateway"));
        builder.Services.AddSingleton<GatewayState>();
        builder.Services.AddSingleton<BagStore>();
        builder.Services.AddHttpClient<SupabaseTunnelTelemetry>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(5);
        });
        builder.Services.AddHttpClient();
        builder.Services.AddSingleton<ITunnelTelemetry>(serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<GatewayOptions>>().Value;
            return options.Supabase.Enabled
                ? serviceProvider.GetRequiredService<SupabaseTunnelTelemetry>()
                : NullTunnelTelemetry.Instance;
        });
        builder.Services.AddHostedService<TunnelStatusWorker>();
        builder.Services.AddSingleton<IPlcTransport>(serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<GatewayOptions>>().Value;
            var loggerFactory = serviceProvider.GetRequiredService<ILoggerFactory>();
            
            if (options.DryRun)
            {
                return new DryRunPlcTransport(options, loggerFactory.CreateLogger<DryRunPlcTransport>());
            }

            if (string.Equals(options.ActiveTransport, "Network", StringComparison.OrdinalIgnoreCase))
            {
                return new TcpPlcTransport(options, loggerFactory.CreateLogger<TcpPlcTransport>());
            }
            
            return new SerialPlcTransport(options, loggerFactory.CreateLogger<SerialPlcTransport>());
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

        app.MapGet("/", () => Results.Redirect("/winwash.html"));
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

        app.MapGet("/winwash", () => Results.Redirect("/winwash.html"));

        app.MapGet("/winwash.html", async context =>
        {
            var assembly = typeof(Program).Assembly;
            using var stream = assembly.GetManifestResourceStream("Lebuser.TunnelGateway.wwwroot.winwash.html");
            if (stream != null)
            {
                context.Response.ContentType = "text/html; charset=utf-8";
                await stream.CopyToAsync(context.Response.Body);
            }
            else
            {
                context.Response.StatusCode = 404;
            }
        });

        app.MapPost("/api/tunnel/send", async (
            TunnelCommand command,
            IPlcTransport transport,
            GatewayState state,
            ITunnelTelemetry telemetry,
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
            await telemetry.PublishCommandAsync(normalized, receipt, cancellationToken);

            return Results.Accepted($"/api/tunnel/commands/{receipt.Id}", receipt);
        });

        // ---- Bag management (operator console) ----

        app.MapGet("/api/clients", async (Microsoft.Extensions.Options.IOptions<GatewayOptions> optionsAccessor, IHttpClientFactory clientFactory) => 
        {
            var opts = optionsAccessor.Value.Supabase;
            if (!opts.Enabled || string.IsNullOrWhiteSpace(opts.Url)) return Results.Ok(Array.Empty<object>());
            
            var client = clientFactory.CreateClient();
            var req = new HttpRequestMessage(HttpMethod.Get, $"{opts.Url.TrimEnd('/')}/rest/v1/routes?select=id,name&order=name");
            req.Headers.Add("apikey", opts.ServiceRoleKey);
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", opts.ServiceRoleKey);
            
            var res = await client.SendAsync(req);
            if (!res.IsSuccessStatusCode) return Results.Ok(Array.Empty<object>());
            
            return Results.Ok(await res.Content.ReadFromJsonAsync<object[]>());
        });

        app.MapGet("/api/bags", (BagStore bags) => Results.Ok(bags.List()));

        app.MapPost("/api/bags", async (
            BagInput input,
            BagStore bags,
            ITunnelTelemetry telemetry,
            CancellationToken cancellationToken) =>
        {
            var errors = ValidateBag(input);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var bag = new Bag
            {
                Code = input.Code.Trim(),
                HotelName = input.HotelName?.Trim() ?? "",
                ClientId = Guid.TryParse(input.ClientId, out var clientId) ? clientId.ToString() : null,
                ProgramNumber = input.ProgramNumber,
                TrackNumber = input.TrackNumber,
                RequestedBy = input.RequestedBy?.Trim() ?? "",
                Status = BagStatus.Queued
            };

            var stored = bags.Upsert(bag);
            await telemetry.PublishBagAsync(stored, cancellationToken);
            return Results.Created($"/api/bags/{stored.Id}", stored);
        });

        app.MapPost("/api/bags/{id}/send", async (
            string id,
            BagStore bags,
            IPlcTransport transport,
            GatewayState state,
            ITunnelTelemetry telemetry,
            CancellationToken cancellationToken) =>
        {
            if (!bags.TryGet(id, out var bag))
            {
                return Results.NotFound();
            }

            var command = new TunnelCommand
            {
                CommandId = Guid.NewGuid().ToString("N"),
                BagId = string.IsNullOrWhiteSpace(bag.Code) ? bag.Id : bag.Code,
                HotelName = bag.HotelName,
                ProgramNumber = bag.ProgramNumber,
                TrackNumber = bag.TrackNumber,
                RequestedBy = bag.RequestedBy,
                RequestedAt = DateTimeOffset.UtcNow
            };

            var receipt = await transport.SendAsync(command, cancellationToken);
            state.Record(command, receipt);
            await telemetry.PublishCommandAsync(command, receipt, cancellationToken);

            var updated = bags.Update(id, current => current with
            {
                Status = receipt.Accepted ? BagStatus.Entry : BagStatus.Error,
                StageIndex = 0,
                CommandId = receipt.Id,
                LastMessage = receipt.Message,
                DryRun = receipt.DryRun,
                SentAt = DateTimeOffset.UtcNow
            })!;
            await telemetry.PublishBagAsync(updated, cancellationToken);

            return Results.Ok(updated);
        });

        app.MapPost("/api/bags/{id}/advance", async (
            string id,
            BagStore bags,
            ITunnelTelemetry telemetry,
            CancellationToken cancellationToken) =>
        {
            if (!bags.TryGet(id, out _))
            {
                return Results.NotFound();
            }

            var updated = bags.Update(id, current =>
            {
                var lastStage = BagStatus.Stages.Length - 1;
                var atEnd = current.StageIndex >= lastStage;
                var nextIndex = Math.Min(current.StageIndex + 1, lastStage);
                return current with
                {
                    StageIndex = nextIndex,
                    Status = atEnd ? BagStatus.Done : BagStatus.Stages[nextIndex],
                    DoneAt = atEnd ? DateTimeOffset.UtcNow : current.DoneAt
                };
            })!;
            await telemetry.PublishBagAsync(updated, cancellationToken);

            return Results.Ok(updated);
        });

        app.MapPost("/api/bags/{id}/status", async (
            string id,
            BagStatusInput input,
            BagStore bags,
            ITunnelTelemetry telemetry,
            CancellationToken cancellationToken) =>
        {
            var status = input.Status?.Trim().ToLowerInvariant() ?? "";
            if (!BagStatus.IsKnown(status))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["status"] = [$"Unknown status '{status}'."]
                });
            }

            if (!bags.TryGet(id, out _))
            {
                return Results.NotFound();
            }

            var updated = bags.Update(id, current => current with
            {
                Status = status,
                DoneAt = status == BagStatus.Done ? DateTimeOffset.UtcNow : current.DoneAt
            })!;
            await telemetry.PublishBagAsync(updated, cancellationToken);

            return Results.Ok(updated);
        });

        // Headless mode keeps the original pure-server behaviour (e.g. background bridge / Windows service).
        if (headless)
        {
            app.Run();
            return;
        }

        // Station mode: run the gateway in-process and show the WinWash window on top of it.
        try
        {
            app.StartAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Nie udało się uruchomić gatewaya na {startupOptions.ListenUrl}.\n\n{ex.Message}",
                "LEBUSER WinWash",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        var browseUrl = DesktopShell.ResolveBrowseUrl(startupOptions.ListenUrl);

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(browseUrl));

        app.StopAsync().GetAwaiter().GetResult();
    }

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

    static Dictionary<string, string[]> ValidateBag(BagInput input)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(input.Code))
        {
            errors["code"] = ["Bag code is required."];
        }

        if (input.ProgramNumber is < 1 or > 999)
        {
            errors["programNumber"] = ["Program number must be between 1 and 999."];
        }

        if (input.TrackNumber is < 1 or > 999)
        {
            errors["trackNumber"] = ["Track number must be between 1 and 999."];
        }

        return errors;
    }
}
