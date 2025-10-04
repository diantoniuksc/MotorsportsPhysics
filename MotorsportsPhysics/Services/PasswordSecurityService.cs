using System.Security.Cryptography;
using System.Text;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

namespace MotorsportsPhysics.Services;

public class PasswordSecurityService
{
    private const int SaltSize = 16;
    private const int Iterations = 350_000;
    private const int KeySize = 64;

    public async Task<(string Hash, string Salt)> HashWithSaltAndPepperAsync(string password)
    {
        var salt = GenerateSalt();
        var pepper = await GetPepperAsync();
        var saltPepper = salt + pepper;

        var hashBytes = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            Encoding.UTF8.GetBytes(saltPepper),
            Iterations,
            HashAlgorithmName.SHA512,
            KeySize);

        var hash = Convert.ToBase64String(hashBytes);
        return (hash, salt);
    }

    private static string GenerateSalt()
    {
        Span<byte> salt = stackalloc byte[SaltSize];
        RandomNumberGenerator.Fill(salt);
        return Convert.ToBase64String(salt);
    }

    private static async Task<string> GetPepperAsync()
    {
        const string secretName = "PasswordPepper";
        const string keyVaultName = "MotoKeyVault"; // TODO: make configurable
        var kvUri = $"https://{keyVaultName}.vault.azure.net";

        var client = new SecretClient(new Uri(kvUri), new DefaultAzureCredential());
        var secret = await client.GetSecretAsync(secretName);
        return secret.Value.Value;
    }
}
