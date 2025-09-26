using F1PhysicsLearning.Models;

namespace F1PhysicsLearning.Services;

public class QuestionService
{
    private readonly List<Question> _questions;

    public QuestionService()
    {
        _questions = InitializeQuestions();
    }

    public List<Question> GetAllQuestions() => _questions;

    public Question? GetRandomQuestion(List<int> excludeIds)
    {
        var availableQuestions = _questions.Where(q => !excludeIds.Contains(q.Id)).ToList();
        if (availableQuestions.Count == 0) return null;

        var random = new Random();
        return availableQuestions[random.Next(availableQuestions.Count)];
    }

    private List<Question> InitializeQuestions()
    {
        return new List<Question>
        {
            new Question
            {
                Id = 1,
                Text = "What happens to a Formula 1 car's aerodynamic downforce as speed increases?",
                Options = new List<string> { "It decreases", "It stays the same", "It increases exponentially", "It increases linearly" },
                CorrectAnswerIndex = 2,
                Context = "Aerodynamic downforce is proportional to the square of velocity (v²). This means as speed doubles, downforce quadruples, providing exponentially more grip at higher speeds.",
                Category = "Aerodynamics",
                Difficulty = 2
            },
            new Question
            {
                Id = 2,
                Text = "What is the primary purpose of DRS (Drag Reduction System) in Formula 1?",
                Options = new List<string> { "Increase downforce", "Reduce drag for overtaking", "Improve tire grip", "Cool the engine" },
                CorrectAnswerIndex = 1,
                Context = "DRS opens a flap in the rear wing, reducing drag by approximately 10-12% and increasing top speed by 8-12 km/h, making overtaking easier on designated straight sections.",
                Category = "Aerodynamics",
                Difficulty = 1
            },
            new Question
            {
                Id = 3,
                Text = "Which tire compound typically provides the most grip but wears fastest?",
                Options = new List<string> { "Hard (White)", "Medium (Yellow)", "Soft (Red)", "Intermediate (Green)" },
                CorrectAnswerIndex = 2,
                Context = "Soft compounds have more grip due to their chemical composition but generate more heat and wear faster. The trade-off between grip and durability is fundamental to tire strategy.",
                Category = "Tire Physics",
                Difficulty = 1
            },
            new Question
            {
                Id = 4,
                Text = "What force pushes an F1 car outward when cornering at high speed?",
                Options = new List<string> { "Centripetal force", "Centrifugal force", "Gravitational force", "Magnetic force" },
                CorrectAnswerIndex = 1,
                Context = "Centrifugal force (or the outward inertial force) tries to push the car away from the turn's center. Drivers must generate enough centripetal force through tires and aerodynamics to counteract this.",
                Category = "Forces and Motion",
                Difficulty = 2
            },
            new Question
            {
                Id = 5,
                Text = "How does increasing the car's rake (nose-up attitude) typically affect aerodynamics?",
                Options = new List<string> { "Reduces both downforce and drag", "Increases downforce but also drag", "Only affects handling, not speed", "Improves fuel efficiency" },
                CorrectAnswerIndex = 1,
                Context = "Rake creates a Venturi effect under the car, increasing downforce from the floor. However, it also increases the car's frontal area and drag, requiring careful balance.",
                Category = "Aerodynamics",
                Difficulty = 3
            },
            new Question
            {
                Id = 6,
                Text = "What happens to tire grip as tire temperature increases beyond the optimal window?",
                Options = new List<string> { "Grip continues to increase", "Grip remains constant", "Grip decreases significantly", "Only affects tire longevity" },
                CorrectAnswerIndex = 2,
                Context = "Tires have an optimal temperature window (typically 90-110°C for slicks). Beyond this, the rubber becomes too soft and loses structural integrity, dramatically reducing grip.",
                Category = "Tire Physics",
                Difficulty = 2
            },
            new Question
            {
                Id = 7,
                Text = "What is the main advantage of ground effect aerodynamics in modern F1 cars?",
                Options = new List<string> { "Generates downforce with less drag penalty", "Increases top speed", "Reduces tire wear", "Improves fuel economy" },
                CorrectAnswerIndex = 0,
                Context = "Ground effect generates downforce by accelerating air under the car, creating low pressure. This is more efficient than wings as it produces less induced drag per unit of downforce.",
                Category = "Aerodynamics",
                Difficulty = 3
            },
            new Question
            {
                Id = 8,
                Text = "During braking, what percentage of an F1 car's total braking force typically comes from the front wheels?",
                Options = new List<string> { "40-50%", "60-70%", "50-60%", "70-80%" },
                CorrectAnswerIndex = 3,
                Context = "Due to weight transfer under braking, the front wheels carry much more load and can generate 70-80% of the total braking force. This is why front brake discs are larger.",
                Category = "Braking Physics",
                Difficulty = 2
            },
            new Question
            {
                Id = 9,
                Text = "What happens to an F1 car's center of gravity when fuel is consumed during a race?",
                Options = new List<string> { "Moves forward", "Moves backward", "Moves upward", "Moves downward" },
                CorrectAnswerIndex = 3,
                Context = "The fuel tank is positioned high in the car for safety and weight distribution. As fuel is consumed, the center of gravity lowers, typically improving the car's handling characteristics.",
                Category = "Weight Distribution",
                Difficulty = 2
            },
            new Question
            {
                Id = 10,
                Text = "What is the primary reason F1 cars use different wing angles at different circuits?",
                Options = new List<string> { "Weather conditions", "Track surface grip levels", "Balance between downforce and drag for each circuit", "Tire compound selection" },
                CorrectAnswerIndex = 2,
                Context = "Each circuit requires a different balance: high-speed tracks like Monza need low drag (low downforce), while twisty tracks like Monaco need high downforce despite the drag penalty.",
                Category = "Setup and Strategy",
                Difficulty = 2
            },
            new Question
            {
                Id = 11,
                Text = "How does dirty air affect the aerodynamics of a following F1 car?",
                Options = new List<string> { "Increases downforce", "Has no significant effect", "Reduces downforce and increases drag", "Only affects engine cooling" },
                CorrectAnswerIndex = 2,
                Context = "Dirty air is turbulent and has reduced energy, providing less downforce to the following car. It also creates more drag, making overtaking difficult especially in corners.",
                Category = "Aerodynamics",
                Difficulty = 2
            },
            new Question
            {
                Id = 12,
                Text = "What is the typical deceleration force experienced by F1 drivers under maximum braking?",
                Options = new List<string> { "2-3 G", "4-5 G", "5-6 G", "7-8 G" },
                CorrectAnswerIndex = 2,
                Context = "F1 cars can achieve 5-6 G of deceleration under maximum braking, requiring tremendous physical strength from drivers and sophisticated brake systems to handle the enormous forces.",
                Category = "Braking Physics",
                Difficulty = 2
            },
            new Question
            {
                Id = 13,
                Text = "Why do F1 teams adjust suspension settings for wet weather conditions?",
                Options = new List<string> { "To increase ride height and reduce aquaplaning", "To lower the car for better aerodynamics", "To increase tire temperature", "To reduce brake cooling" },
                CorrectAnswerIndex = 0,
                Context = "Higher ride height in wet conditions helps prevent aquaplaning by allowing water to flow under the car more easily, while softer suspension helps maintain tire contact with the track surface.",
                Category = "Setup and Strategy",
                Difficulty = 2
            },
            new Question
            {
                Id = 14,
                Text = "What is the main physics principle behind F1 car diffusers?",
                Options = new List<string> { "Bernoulli's principle", "Newton's third law", "Conservation of momentum", "Archimedes' principle" },
                CorrectAnswerIndex = 0,
                Context = "Diffusers work on Bernoulli's principle: as air accelerates through the narrowing channel under the car, its pressure decreases, creating suction that pulls the car down to the track.",
                Category = "Aerodynamics",
                Difficulty = 3
            },
            new Question
            {
                Id = 15,
                Text = "How does cornering speed relate to the radius of the turn in F1 racing?",
                Options = new List<string> { "Speed is directly proportional to radius", "Speed is inversely proportional to radius", "Speed is proportional to the square root of radius", "No relationship exists" },
                CorrectAnswerIndex = 2,
                Context = "From centripetal force physics (v = √(a×r)), cornering speed is proportional to the square root of the corner radius, assuming maximum lateral acceleration is maintained.",
                Category = "Forces and Motion",
                Difficulty = 3
            }
        };
    }
}