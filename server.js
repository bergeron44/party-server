const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

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
  question: String,
  rate: Number,
  type: String,
});

const Question = mongoose.model('Question', QuestionSchema);

// Define Game Schema
const GameSchema = new mongoose.Schema({
  code: String,
  questions: [QuestionSchema], // Each game will have its own list of questions
  currentQuestionIndex: { type: Number, default: 0 }, // Track current question number
  players: [{ name: String, score: { type: Number, default: 0 }, socketId: String }],
  gameOver: { type: Boolean, default: false },
  creatorSocketId: String,
});

const Game = mongoose.model('Game', GameSchema);

// Function to generate a unique game code
const generateGameCode = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

// Function to shuffle an array (Fisher-Yates shuffle)
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

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
        socket.join(gameCode);
        
        // Check if the player is already in the game
        const existingPlayer = game.players.find(player => player.name === playerName);
        if (existingPlayer) {
          console.log(`Player ${playerName} already in game ${gameCode}`);
          callback({ success: false, message: 'Player already in the game' });
          return;
        }
  
        // Add the player to the game
        game.players.push({ name: playerName, socketId: socket.id });
        await game.save();
        console.log(`Player ${playerName} joined game: ${gameCode}`);
  
        // Notify all players in the game room about the updated player list
        io.to(gameCode).emit('players-updated', game.players);
  
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
  socket.on('create-game', async (playerName, callback) => {
    console.log(`User ${playerName} is creating a new game.`);
    const gameCode = generateGameCode();

    const newGame = new Game({
      code: gameCode,
      players: [{ name: playerName, socketId: socket.id }],
      questions: [], // Questions will be added when the game starts
      currentQuestionIndex: 0, // Track the current question index
      creatorSocketId: socket.id,
    });

    await newGame.save();
    socket.join(gameCode);
    console.log(`New game created with code: ${gameCode}`);

    callback(gameCode); // Send back the new game code to the client
    io.to(gameCode).emit('players-updated', newGame.players);
  });

  // Event listener for starting the game
  socket.on('start-game', async (gameCode) => {
    console.log(`Starting game: ${gameCode}`);

    try {
      // Find the game by its code
      const game = await Game.findOne({ code: gameCode });
      
      if (game) {
        // Pull all questions from the questions collection
        const allQuestions = await Question.find(); // לא מספק פילטר, יחזיר את כל השאלות
       console.log(allQuestions); // לוג השאלות שהתקבלו
        // Shuffle the questions randomly
        const shuffledQuestions = shuffleArray(allQuestions);

        // Store the shuffled questions in the game's record
        game.questions = shuffledQuestions;
        game.currentQuestionIndex = 0; // Start with the first question

        // Save the updated game with the shuffled questions
        await game.save();

        // Choose a random player to ask the first question
        const randomPlayerIndex = Math.floor(Math.random() * game.players.length);
        const selectedPlayer = game.players[randomPlayerIndex].name;
        
        // Emit the first question and the selected player to all players in the game
        const firstQuestion = shuffledQuestions[0];
        console.log(firstQuestion);
        console.log(selectedPlayer);
        io.to(gameCode).emit('new-question', { question: firstQuestion, selectedPlayer });
        io.to(gameCode).emit('game-started');

        console.log(`Game ${gameCode} started with first question for player ${selectedPlayer}`);
      } else {
        console.log(`Game not found when trying to start: ${gameCode}`);
      }
    } catch (err) {
      console.error('Error starting game:', err);
    }
  });

  // Event listener for getting the next question
  socket.on('next-question', async (gameCode) => {
    console.log(`Getting next question for game: ${gameCode}`);

    try {
      const game = await Game.findOne({ code: gameCode });
      
      if (game) {
        // Move to the next question
        game.currentQuestionIndex += 1;

        if (game.currentQuestionIndex < game.questions.length) {
          const nextQuestion = game.questions[game.currentQuestionIndex];

          // Choose a random player to answer the next question
          const randomPlayerIndex = Math.floor(Math.random() * game.players.length);
          const selectedPlayer = game.players[randomPlayerIndex].name;

          // Save the updated game
          await game.save();

          // Emit the next question and the selected player
          io.to(gameCode).emit('new-question', { question: nextQuestion, selectedPlayer });
          console.log(`Next question sent for game ${gameCode}: ${nextQuestion}`);
        } else {
          io.to(gameCode).emit('game-ended');
          console.log(`All questions answered for game ${gameCode}.`);
        }
      } else {
        console.log(`Game not found when trying to get the next question: ${gameCode}`);
      }
    } catch (err) {
      console.error('Error getting next question:', err);
    }
  });

  // Clean up when a user disconnects
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.id}`);
    const rooms = Object.keys(socket.rooms);
    for (const room of rooms) {
      if (room !== socket.id) { // Exclude the socket's own room
        const game = await Game.findOne({ code: room });
        if (game) {
          game.players = game.players.filter(player => player.socketId !== socket.id);
          await game.save();
          console.log(`Player removed from game ${room}: ${socket.id}`);
          io.to(room).emit('players-updated', game.players);
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
