using F1PhysicsLearning.Models;

namespace F1PhysicsLearning.Services;

public class GameService
{
    private GameState _gameState;
    private Question? _currentQuestion;
    private DateTime _questionStartTime;
    private readonly List<int> _usedQuestionIds;
    private readonly QuestionService _questionService;

    public GameService(QuestionService questionService)
    {
        _questionService = questionService;
        _gameState = new GameState();
        _usedQuestionIds = new List<int>();
    }

    public GameState GetGameState() => _gameState;
    public Question? GetCurrentQuestion() => _currentQuestion;

    public void StartNewGame()
    {
        _gameState = new GameState
        {
            CurrentPosition = 10, // Start in middle of grid
            MaxPosition = 20,
            QuestionsAnswered = 0,
            CorrectAnswers = 0,
            IncorrectAnswers = 0,
            GameStartTime = DateTime.Now,
            IsGameComplete = false,
            Results = new List<QuestionResult>()
        };
        _usedQuestionIds.Clear();
        LoadNextQuestion();
    }

    public void LoadNextQuestion()
    {
        if (_gameState.IsGameComplete) return;

        _currentQuestion = _questionService.GetRandomQuestion(_usedQuestionIds);
        if (_currentQuestion == null)
        {
            // No more questions available
            CompleteGame();
            return;
        }

        _usedQuestionIds.Add(_currentQuestion.Id);
        _questionStartTime = DateTime.Now;
    }

    public bool AnswerQuestion(int selectedAnswerIndex)
    {
        if (_currentQuestion == null || _gameState.IsGameComplete) return false;

        var timeToAnswer = DateTime.Now - _questionStartTime;
        var isCorrect = selectedAnswerIndex == _currentQuestion.CorrectAnswerIndex;

        // Record the result
        _gameState.Results.Add(new QuestionResult
        {
            QuestionId = _currentQuestion.Id,
            IsCorrect = isCorrect,
            SelectedAnswerIndex = selectedAnswerIndex,
            TimeToAnswer = timeToAnswer
        });

        _gameState.QuestionsAnswered++;

        if (isCorrect)
        {
            _gameState.CorrectAnswers++;
            // Move forward (lower position number = better position)
            if (_gameState.CurrentPosition > 1)
            {
                _gameState.CurrentPosition--;
            }
        }
        else
        {
            _gameState.IncorrectAnswers++;
            // Move backward (higher position number = worse position)
            if (_gameState.CurrentPosition < _gameState.MaxPosition)
            {
                _gameState.CurrentPosition++;
            }
        }

        // Check if game should end
        if (_gameState.CurrentPosition == 1 || 
            _gameState.CurrentPosition == _gameState.MaxPosition || 
            _gameState.QuestionsAnswered >= 20)
        {
            CompleteGame();
        }

        return isCorrect;
    }

    private void CompleteGame()
    {
        _gameState.IsGameComplete = true;
        _currentQuestion = null;
    }

    public string GetPositionDescription()
    {
        return _gameState.CurrentPosition switch
        {
            1 => "🏆 P1 - Pole Position!",
            <= 3 => "🥉 P" + _gameState.CurrentPosition + " - Front Row!",
            <= 10 => "🟢 P" + _gameState.CurrentPosition + " - Points Position",
            <= 15 => "🟡 P" + _gameState.CurrentPosition + " - Midfield",
            _ => "🔴 P" + _gameState.CurrentPosition + " - Back of Grid"
        };
    }

    public double GetAccuracyPercentage()
    {
        if (_gameState.QuestionsAnswered == 0) return 0;
        return Math.Round((double)_gameState.CorrectAnswers / _gameState.QuestionsAnswered * 100, 1);
    }

    public TimeSpan GetGameDuration()
    {
        return _gameState.IsGameComplete ? 
            DateTime.Now - _gameState.GameStartTime : 
            DateTime.Now - _gameState.GameStartTime;
    }
}