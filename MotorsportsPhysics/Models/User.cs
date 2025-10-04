using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MotorsportsPhysics.Models;

[Index("UserName", Name = "UQ_Users_UserName", IsUnique = true)]
public partial class User
{
    [Key]
    public Guid Id { get; set; }

    [StringLength(128)]
    public string FirstName { get; set; } = null!;

    [StringLength(128)]
    public string LastName { get; set; } = null!;

    [StringLength(128)]
    public string UserName { get; set; } = null!;

    [StringLength(512)]
    public string PasswordHashPHC { get; set; } = null!;

    public DateTime PasswordUpdatedAt { get; set; }

    public byte[] ProfilePicture { get; set; } = null!;

    [StringLength(64)]
    public string ProfilePictureType { get; set; } = null!;

    [StringLength(255)]
    [Unicode(false)]
    public string? PasswordSalt { get; set; }
}
