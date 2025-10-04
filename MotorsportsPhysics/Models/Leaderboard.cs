using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MotorsportsPhysics.Models;

[Keyless]
[Table("Leaderboard")]
public partial class Leaderboard
{
    public int Position { get; set; }

    [StringLength(128)]
    public string? UserName { get; set; }

    [StringLength(128)]
    public string Difficulty { get; set; } = null!;

    [StringLength(128)]
    public string LevelName { get; set; } = null!;

    public int? LapTimeMs { get; set; }

    public int? FinishedPosition { get; set; }

    [ForeignKey("UserName")]
    public virtual User? UserNameNavigation { get; set; }
}
