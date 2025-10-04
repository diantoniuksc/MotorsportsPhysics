using System.Data.Common;
using Azure.Core;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace MotorsportsPhysics.Data;

public sealed class SqlAccessTokenInterceptor : DbConnectionInterceptor
{
    private static readonly string[] Scopes = new[] { "https://database.windows.net/.default" };
    private readonly TokenCredential _credential;

    public SqlAccessTokenInterceptor(TokenCredential credential)
    {
        _credential = credential;
    }

    public override InterceptionResult ConnectionOpening(DbConnection connection, ConnectionEventData eventData, InterceptionResult result)
    {
        SetAccessTokenAsync(connection, CancellationToken.None).GetAwaiter().GetResult();
        return result;
    }

    public override async ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection, ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default)
    {
        await SetAccessTokenAsync(connection, cancellationToken);
        return result;
    }

    private async Task SetAccessTokenAsync(DbConnection connection, CancellationToken ct)
    {
        if (connection is SqlConnection sqlConn)
        {
            // If the connection string already specifies Authentication=..., let SqlClient handle it.
            // Otherwise, set an AAD access token explicitly.
            var csb = new SqlConnectionStringBuilder(sqlConn.ConnectionString);
            var auth = csb["Authentication"]?.ToString();
            if (string.IsNullOrWhiteSpace(auth))
            {
                var token = await _credential.GetTokenAsync(new TokenRequestContext(Scopes), ct);
                sqlConn.AccessToken = token.Token;
            }
        }
    }
}
