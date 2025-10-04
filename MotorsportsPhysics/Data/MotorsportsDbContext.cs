using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using MotorsportsPhysics.Models;

namespace MotorsportsPhysics.Data;

public partial class MotorsportsDbContext : DbContext
{
    public MotorsportsDbContext(DbContextOptions<MotorsportsDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Leaderboard> Leaderboards { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Leaderboard>(entity =>
        {
            entity.HasOne(d => d.UserNameNavigation).WithMany()
                .HasPrincipalKey(p => p.UserName)
                .HasForeignKey(d => d.UserName)
                .HasConstraintName("FK__Leaderboa__UserN__60A75C0F");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Users__3214EC07D1BBB5CA");

            entity.Property(e => e.Id).HasDefaultValueSql("(newid())");
            entity.Property(e => e.PasswordUpdatedAt).HasDefaultValueSql("(sysutcdatetime())");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
