const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { type } = require('os');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } }); // CORS for socket.io

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const dbURI = 'mongodb+srv://ronberg:8263867Rui@partygame.o3pij.mongodb.net/partyGame?retryWrites=true&w=majority&appName=partyGame';

mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Define Question Schema
const QuestionSchema = new mongoose.Schema({
  question: String,        // Question in Hebrew (default)
  questionEnglish: String, // Question in English
  rate: Number,
  type: String,
});

const Question = mongoose.model('Question', QuestionSchema);
// API Routes
// GET route to fetch all questions
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await Question.find();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching questions' });
  }
});

// PUT route to update a question by its ID
app.put('/api/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { questionText, questionType } = req.body;
    const updatedQuestion = await Question.findByIdAndUpdate(
      id,
      { questionText, questionType },
      { new: true }
    );
    if (updatedQuestion) {
      res.json(updatedQuestion);
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating question' });
  }
});
// Define Game Schema
const GameSchema = new mongoose.Schema({
  code: String,
  questions: [QuestionSchema], // Each game will have its own list of questions
  currentQuestionIndex: { type: Number, default: 0 }, // Track current question number
  currentPlayerIndex: { type: Number, default: 0 }, // Track current question number
  players: [{ name: String, score: { type: Number, default: 0 }, socketId: String }],
  gameOver: { type: Boolean, default: false },
  creatorSocketId: String,
  location: { 
    type: { lat: Number, lng: Number }, 
    default: { lat: 31.252973, lng: 34.791462 } // Default to Be'er Sheva
  }
});

const Game = mongoose.model('Game', GameSchema);
// Delete all games
app.delete('/api/games/delete', async (req, res) => {
  try {
      // Delete all games
      await Game.deleteMany({}); // Use Game instead of LiveGame
      res.status(200).json({ message: 'All games have been deleted successfully.' });
  } catch (error) {
      console.error('Error deleting games:', error);
      res.status(500).json({ error: 'Failed to delete games' });
  }
});
// GET route to fetch all games
app.get('/api/games', async (req, res) => {
  try {
    const games = await Game.find();
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching games' });
  }
});
// Function to generate a unique game code
const generateGameCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


// Function to shuffle an array (Fisher-Yates shuffle)
async function getShuffledQuestions() {
  // שליפת כל השאלות
  const allQuestions = await Question.find();
  
  // פילטר לשאלות עם rate בין 1 ל-5
  const filteredQuestions = allQuestions.filter(q => q.rate >= 1 && q.rate <= 5);

  // מיפוי השאלות לפי דירוג
  const questionsByRate = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: []
  };

  // מיפוי כל שאלה לפי הדירוג שלה
  filteredQuestions.forEach(question => {
    questionsByRate[question.rate].push(question);
  });

  // קביעת מספר השאלות שנרצה מכל דירוג (לדוגמה 10 שאלות לכל דירוג)
  const questionsPerRate = 10;

  // משתנה לאחסון השאלות שנבחרו
  let selectedQuestions = [];

  // השתמש בשאלות מהדירוגים, ואם לא מספיק, שלוף משאר הדירוגים
  let missingQuestionsCount = 0;

  // בודק לכל דירוג אם יש מספיק שאלות
  for (let rate = 1; rate <= 5; rate++) {
    const availableQuestions = questionsByRate[rate];

    if (availableQuestions.length < questionsPerRate) {
      // אם אין מספיק שאלות, חישוב כמה חסרות
      missingQuestionsCount += questionsPerRate - availableQuestions.length;
    }

    // הוסף את השאלות לדירוג הנוכחי (לא יותר מ-questionsPerRate)
    selectedQuestions = selectedQuestions.concat(availableQuestions.slice(0, questionsPerRate));
  }

  // אם יש שאלות חסרות, משלים משאר הדירוגים
  if (missingQuestionsCount > 0) {
    // מיצוי כל השאלות שנותרו מכל הדירוגים
    const remainingQuestions = Object.values(questionsByRate)
      .flat()
      .filter(q => !selectedQuestions.includes(q));

    // ערבוב השאלות שנותרו
    const shuffledRemainingQuestions = remainingQuestions.sort(() => Math.random() - 0.5);

    // הוסף את השאלות החסרות
    selectedQuestions = selectedQuestions.concat(shuffledRemainingQuestions.slice(0, missingQuestionsCount));
  }

  // ערבוב כל השאלות שנבחרו
  const shuffledQuestions = selectedQuestions.sort(() => Math.random() - 0.5);

  return shuffledQuestions; // מחזיר את השאלות המעורבבות
}
async function getOrderedShuffledQuestions() {
  // שליפת כל השאלות
  const allQuestions = await Question.find();
  
  // פילטר לשאלות עם rate בין 1 ל-5
  const filteredQuestions = allQuestions.filter(q => q.rate >= 1 && q.rate <= 5);

  // מיפוי השאלות לפי דירוג
  const questionsByRate = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: []
  };

  // מיפוי כל שאלה לפי הדירוג שלה
  filteredQuestions.forEach(question => {
    questionsByRate[question.rate].push(question);
  });

  // קביעת מספר השאלות שנרצה מכל דירוג
  const questionsPerRate = 10;

  // משתנה לאחסון השאלות בסדר מוגדר (10 לכל דירוג)
  let orderedQuestions = [];

  // הוספת שאלות לכל דירוג בצורה רנדומלית
  for (let rate = 1; rate <= 5; rate++) {
    const availableQuestions = questionsByRate[rate];

    // ערבוב שאלות לדירוג הנוכחי
    const shuffledQuestions = availableQuestions.sort(() => Math.random() - 0.5);

    // בחירת 10 שאלות או פחות אם אין מספיק
    orderedQuestions = orderedQuestions.concat(shuffledQuestions.slice(0, questionsPerRate));
  }

  return orderedQuestions; // מחזיר את השאלות בסדר הנדרש
}

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Event listener for joining a game
socket.on('join-game', async ({ gameCode, playerName }, callback) => {
    console.log(`User ${playerName} attempting to join game with code: ${gameCode}`);
    
    try {
      const game = await Game.findOne({ code: gameCode });
      
      if (game) {
        console.log(`Game found: ${gameCode}`);
        // Check if the player is already in the game
        const existingPlayer = game.players.find(player => player.name === playerName);
        if (existingPlayer) {
          console.log(`Player ${playerName} already in game ${gameCode}`);
          callback({ success: false, message: 'Player already in the game' });
          return;
        }
        socket.join(gameCode);
        // Add the player to the game
        game.players.push({ name: playerName, socketId: socket.id });
        await game.save();
        console.log(`Player ${playerName} joined game: ${gameCode}`);
  
        // Notify all players in the game room about the updated player list
        io.to(gameCode).emit('players-updated', game);
  
        // Send success response to the client
        callback({ success: true, message: 'Successfully joined the game' });
      } else {
        console.log(`Game not found: ${gameCode}`);
        callback({ success: false, message: 'Game not found' });
      }
    } catch (err) {
      console.error('Error joining game:', err);
      callback({ success: false, message: 'An error occurred while trying to join the game' });
    }
  });

  // Event listener for creating a new game
  socket.on('create-game', async (playerName,location, callback) => {
    try {
      console.log(`User ${playerName} is creating a new game.`);
      
      const gameCode = generateGameCode();
      const allQuestions = await getOrderedShuffledQuestions();
      const newGame = new Game({
        code: gameCode,
        players: [{ name: playerName, socketId: socket.id }],
        questions: allQuestions, // Questions will be added when the game starts
        currentQuestionIndex: 0, // Track the current question index
        creatorSocketId: socket.id,
        location: location || { lat: 31.252973, lng: 34.791462 }, // Use provided location or default to Be'er Sheva
      });
      
      await newGame.save();
      socket.join(gameCode);
      console.log(`New game created with code: ${gameCode}`);
      console.log(allQuestions);
  
      // Check if the callback function is defined before calling it
      if (typeof callback === 'function') {
        callback(gameCode); // Send back the new game code to the client
      }
  
      io.to(gameCode).emit('creator-first-update', newGame);
    } catch (error) {
      console.error("Error creating game:", error);
    }
  });
  
   // Event listener for starting the game
socket.on('start-game', async (gameCode) => {
  console.log(`Starting game: ${gameCode}`);

  try {
    const game = await Game.findOne({ code: gameCode });
    if (game) {
      game.currentQuestionIndex = 0;
      await game.save();
      const activePlayers = game.players;
      game.currentPlayerIndex= Math.floor(Math.random() * activePlayers.length);
      const selectedPlayer = activePlayers[game.currentPlayerIndex].name;
      const firstQuestion = game.questions[0];
      io.to(gameCode).emit('new-question', { question: game.questions[0], selectedPlayer });
      io.to(gameCode).emit('game-started');

      console.log(`Game ${gameCode} started with first question for player ${selectedPlayer}`);

    }
  } catch (err) {
    console.error('Error starting game:', err);
  }
});

  // Event listener for getting the next question
  socket.on('next-question', async (gameCode) => {
    console.log(`Getting next question for game: ${gameCode}`);
    try {
      const game= await Game.findOne({ code: gameCode });
      
      if (game) {
        game.currentQuestionIndex+=1;
        game.currentPlayerIndex+=1;
        if (game.currentQuestionIndex < game.questions.length) {
          // Filter to get only active players
          const activePlayers = game.players.filter(player => io.sockets.sockets.get(player.socketId));
          
          if (activePlayers.length > 0) {
            const nextQuestion = game.questions[game.currentQuestionIndex];
            const selectedPlayer = activePlayers[game.currentPlayerIndex % activePlayers.length].name;
            
            await game.save();
  
            io.to(gameCode).emit('new-question', { question: game.questions[game.currentQuestionIndex] , selectedPlayer });
          } else {
            // End game if no active players
            io.to(gameCode).emit('game-ended');
            game.gameOver = true;
            await game.save();
          }
        } else {
          io.to(gameCode).emit('game-ended');
        }
      }
    } catch (err) {
      console.error('Error getting next question:', err);
    }
  });

  socket.on('check-player-status', async (gameCode, callback) => {
    try {
      // חיפוש המשחק בבסיס הנתונים
      const game = await Game.findOne({ code: gameCode });
      
      if (!game) {
        return callback({ isValid: false });
      }
      
      // בדיקה האם ה-socket.id של המשתמש נמצא ברשימת השחקנים
      const isPlayerValid = game.players.some(player => player.socketId === socket.id);
      callback({ isValid: isPlayerValid });
    } catch (error) {
      console.error('Error checking player status:', error);
      callback({ isValid: false, error: 'Server error' });
    }
  });
  
 // Clean up when a user disconnects
socket.on('disconnect', async () => {
  console.log(`User disconnected: ${socket.id}`);
  const rooms = Object.keys(socket.rooms); // Get the rooms the socket is in
  for (const room of rooms) {
    if (room !== socket.id) { // Ignore the socket's own ID room
      const game = await Game.findOne({ code: room });
      if (game) {
        // Remove the disconnected player
        game.players = game.players.filter(player => player.socketId !== socket.id);
        await game.save();
        
        if (game.players.length > 0) {
          io.to(room).emit('players-updated', game);
        } else {
          // End the game if no players are left
          game.gameOver = true;
          await game.save();
          io.to(room).emit('game-ended');
        }
        
        console.log(`Player removed from game ${room}: ${socket.id}`);
      }
    }
  }
});
});


// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
