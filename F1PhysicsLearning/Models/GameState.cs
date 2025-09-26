namespace F1PhysicsLearning.Models;

public class GameState
{
    public int CurrentPosition { get; set; } = 1;
    public int MaxPosition { get; set; } = 20; // Like F1 grid positions
    public int QuestionsAnswered { get; set; } = 0;
    public int CorrectAnswers { get; set; } = 0;
    public int IncorrectAnswers { get; set; } = 0;
    public DateTime GameStartTime { get; set; } = DateTime.Now;
    public bool IsGameComplete { get; set; } = false;
    public List<QuestionResult> Results { get; set; } = new();
}

public class QuestionResult
{
    public int QuestionId { get; set; }
    public bool IsCorrect { get; set; }
    public int SelectedAnswerIndex { get; set; }
    public TimeSpan TimeToAnswer { get; set; }
}