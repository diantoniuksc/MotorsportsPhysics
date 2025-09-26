# F1 Physics Learning Platform 🏎️

An interactive Formula 1 physics learning platform built with Blazor Server. Learn F1 physics concepts through engaging gameplay!

## Features

### 🎮 Interactive Game Mechanics
- **Position-based scoring**: Start at P10 and work your way to pole position (P1)
- **Move forward** for correct answers, **drop back** for incorrect ones
- **Real-time position tracking** with visual grid position indicator
- **Comprehensive statistics** tracking accuracy, time, and performance

### 📚 Educational Content
- **15 carefully crafted questions** covering key F1 physics concepts:
  - Aerodynamics (downforce, drag, ground effect)
  - Tire physics and grip dynamics
  - Braking forces and weight transfer
  - Forces and motion in racing
  - Setup and strategy considerations

### 🎯 Learning Experience
- **Immediate feedback** with detailed explanations for each question
- **Contextual learning** - understand the "why" behind each answer
- **Difficulty progression** with Easy, Medium, and Hard questions
- **Category-based organization** for structured learning

### 📊 Performance Analytics
- **Real-time accuracy tracking**
- **Detailed results breakdown** after each game session
- **Position progression visualization**
- **Question-by-question analysis**
- **Response time metrics**

## Getting Started

### Prerequisites
- .NET 9.0 or later
- A modern web browser

### Running the Application

1. **Clone the repository**
   ```bash
   git clone https://github.com/diantoniuksc/MotorsportsPhysics.git
   cd MotorsportsPhysics
   ```

2. **Navigate to the project directory**
   ```bash
   cd F1PhysicsLearning
   ```

3. **Restore dependencies**
   ```bash
   dotnet restore
   ```

4. **Build the project**
   ```bash
   dotnet build
   ```

5. **Run the application**
   ```bash
   dotnet run
   ```

6. **Open your browser and navigate to** `https://localhost:5236` (or the URL shown in the terminal)

## How to Play

1. **Start the Game**: Click "Start Your F1 Journey" on the home page
2. **Answer Questions**: Read each question carefully and select your answer
3. **Learn from Context**: After answering, read the educational explanation
4. **Track Progress**: Watch your grid position and accuracy in real-time
5. **Reach the Goal**: Try to reach pole position (P1) with high accuracy!

## Game Rules

- **Starting Position**: P10 (middle of the grid)
- **Correct Answer**: Move forward one position (lower number = better)
- **Incorrect Answer**: Move backward one position (higher number = worse)
- **Win Condition**: Reach P1 (pole position)
- **Game Ends**: When you reach P1, P20, or answer 20 questions

## Topics Covered

### Aerodynamics
- Downforce principles and velocity relationships
- DRS (Drag Reduction System) functionality
- Ground effect and Venturi principles
- Rake effects on aerodynamic balance

### Tire Physics
- Compound characteristics and grip levels
- Temperature windows and performance
- Tire wear patterns and strategy implications

### Vehicle Dynamics
- Braking forces and weight transfer
- Centripetal and centrifugal forces in cornering
- Center of gravity effects
- Suspension setup considerations

### Racing Strategy
- Circuit-specific aerodynamic setups
- Wet weather setup considerations
- Fuel load effects on handling

## Technology Stack

- **Framework**: Blazor Server (.NET 9)
- **UI**: Bootstrap 5 with custom CSS
- **Icons**: Bootstrap Icons
- **Architecture**: Component-based with service layer
- **State Management**: Scoped services for game state

## Project Structure

```
F1PhysicsLearning/
├── Components/
│   ├── Pages/
│   │   └── Home.razor          # Main landing page and game coordinator
│   ├── Layout/                 # Navigation and layout components
│   ├── F1Quiz.razor           # Interactive quiz component
│   └── GameResults.razor      # Results and analytics display
├── Models/
│   ├── Question.cs            # Question data model
│   └── GameState.cs          # Game state and results tracking
├── Services/
│   ├── QuestionService.cs     # Question management and data
│   └── GameService.cs         # Game logic and state management
└── Program.cs                 # Application configuration
```

## Contributing

This is an educational project focused on F1 physics learning. Contributions that improve the educational value, add more questions, or enhance the user experience are welcome!

## Educational Value

This platform helps users understand:
- Real-world physics principles applied in Formula 1
- The relationship between theoretical concepts and practical racing
- Complex systems thinking in motorsports engineering
- The science behind F1 performance and strategy decisions

## Future Enhancements

- Additional question categories (engine physics, materials science)
- Multiplayer competitions
- Achievement system
- Detailed performance analytics
- Mobile-responsive design improvements

---

**Ready to master F1 physics? Start your journey to pole position!** 🏁