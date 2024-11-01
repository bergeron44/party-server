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
  gameType: {type:String,default:"All"},
  creatorSocketId: String,
});

const Game = mongoose.model('Game', GameSchema);

// Function to generate a unique game code
const generateGameCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  socket.on('create-game', async (playerName, gameType, callback) => {
    try {
      console.log(`User ${playerName} is creating a new game.`);
      console.log(gameType);
      
      const gameCode = generateGameCode();
  
      const newGame = new Game({
        code: gameCode,
        players: [{ name: playerName, socketId: socket.id }],
        questions: [], // Questions will be added when the game starts
        currentQuestionIndex: 0, // Track the current question index
        gameType: gameType,
        creatorSocketId: socket.id,
      });
  
      await newGame.save();
      socket.join(gameCode);
      console.log(`New game created with code: ${gameCode}`);
  
      // Check if the callback function is defined before calling it
      if (typeof callback === 'function') {
        callback(gameCode); // Send back the new game code to the client
      }
  
      io.to(gameCode).emit('players-updated', newGame.players);
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
      const allQuestions = await Question.find();
      let selectedQuestions;
      console.log(game.gameType);
      // Filter questions based on game type
      if (game.gameType === 'friends') {
        console.log("enter friends");
        // Select only friend-type questions first
        const friendQuestions = allQuestions.filter(q => q.type === 'friend');
        console.log(friendQuestions);
        const otherQuestions = allQuestions.filter(q => q.type !== 'friend');
        console.log("new ");
        console.log(otherQuestions);
        
        // Shuffle friend questions and combine with the rest
        selectedQuestions = shuffleArray(friendQuestions).concat(otherQuestions);
      
      } else if (game.gameType === 'random') {
        console.log("enter random");
        // Select only random-type and friend-type questions first
        const randomAndFriendQuestions = allQuestions.filter(q => q.type === 'random' || q.type === 'friend');
        console.log(randomAndFriendQuestions);
        const otherQuestions = allQuestions.filter(q => q.type !== 'random' && q.type !== 'friend');
        console.log("new ");
        console.log(otherQuestions);
        // Shuffle selected questions and combine with the rest
        selectedQuestions = shuffleArray(randomAndFriendQuestions).concat(otherQuestions);
      
      } else {
        // No specific type; shuffle all questions
        console.log("enter else");
        selectedQuestions = shuffleArray(allQuestions);
      }
      console.log(selectedQuestions);

      game.questions = selectedQuestions;
      game.currentQuestionIndex = 0;
      await game.save();

      // Send the first question to a randomly selected player
      const activePlayers = game.players;
      const selectedPlayer = activePlayers[game.currentQuestionIndex % activePlayers.length].name;
      const firstQuestion = game.questions[0];
      io.to(gameCode).emit('new-question', { question: firstQuestion, selectedPlayer });
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
      const game = await Game.findOne({ code: gameCode });
      
      if (game) {
        game.currentQuestionIndex += 1;
  
        if (game.currentQuestionIndex < game.questions.length) {
          // Filter to get only active players
          const activePlayers = game.players.filter(player => io.sockets.sockets.get(player.socketId));
          
          if (activePlayers.length > 0) {
            const nextQuestion = game.questions[game.currentQuestionIndex];
            const selectedPlayer = activePlayers[game.currentQuestionIndex % activePlayers.length].name;
            
            await game.save();
  
            io.to(gameCode).emit('new-question', { question: nextQuestion, selectedPlayer });
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

  // Clean up when a user disconnects
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
          io.to(room).emit('players-updated', game.players);
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
