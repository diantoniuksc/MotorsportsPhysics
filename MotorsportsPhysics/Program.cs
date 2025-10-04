using Microsoft.EntityFrameworkCore;
using MotorsportsPhysics.Components;
using MotorsportsPhysics.Data;
using MotorsportsPhysics.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddDbContext<MotorsportsDbContext>(options =>
{
    var cs = builder.Configuration.GetConnectionString("DefaultConnection");
    options.UseSqlServer(cs);
});

builder.Services.AddSingleton<PasswordSecurityService>();


var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();
app.UseAntiforgery();

// Ensure legacy /favicon.ico requests receive the updated PNG
app.MapGet("/favicon.ico", context =>
{
    context.Response.Redirect("/favicon.png?v=3", permanent: false);
    return Task.CompletedTask;
});

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
