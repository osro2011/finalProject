// Import requirements
const http = require('http');
const { Server } = require("socket.io");
const express = require('express');

// Set up nessecary server and initialize modules
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Lobby and queue arrays, they keep track of active lobbies and unmatched players respectively
var lobbies = [];
var queue = [];

// Function for cleaning up the lobbies array when games end
function cleanLobbies() {
    console.log("Cleaning game lobbies...")
    // Search through all lobbies
    for (lobby of lobbies) {
        // Check if any isn't currently ongoing
        if (lobby.state !== "ongoing") {
            // Remove inactive lobby from array
            lobbies.splice(lobbies.indexOf(lobby), 1);
            console.log("Cleaned up a game lobby!")
        }
    }
}

// Ball function for keeping track of ball and ball physics
function Ball(game) {
    this.game = game;
    this.x = 0;
    this.y = 0;
    this.r = 10;
    this.xSpeed = 566;
    this.ySpeed = 400;

    // Function for broadcasting the speed of the ball to all players in a lobby
    this.broadcastSpeed = function() {
        game.broadcast("ballUpdate", {
            xs: this.xSpeed / this.game.resolution.x,
            ys: this.ySpeed / this.game.resolution.y
        });
    }

    // Timer for delta time
    this.lastUpdate = Date.now();

    // Main ball update function
    this.update = function() {

        // Delta time math
        let now = Date.now();
        let dt = (now - this.lastUpdate)/1000;
        this.lastUpdate = now;

        // Check if ball is at edge, bounce if so
        if (this.y < this.r) {
            this.y = this.r;
            this.ySpeed *= -1;
            // Broadcast ball speed to all players in lobby (Should probably be handled as an event and then sent in the game function)
            this.broadcastSpeed();
        } else if (this.y > this.game.resolution.y - this.r) {
            this.y = this.game.resolution.y - this.r;
            this.ySpeed *= -1;
            this.broadcastSpeed();
        }

        // Check if ball has collided with either player (Should probably be handled the game function)
        if (this.x < this.game.player1.width + this.r && this.y > this.game.player1.y - this.r && this.y < this.game.player1.y + this.game.player1.height + this.r && this.x > this.game.player1.x + this.game.player1.width) {
            this.x = this.r + game.player1.width;
            this.xSpeed *= -1;
            this.broadcastSpeed();
        } else if (this.x > this.game.player2.x - this.r && this.y > this.game.player2.y - this.r && this.y < this.game.player2.y + this.game.player2.height + this.r && this.x < this.game.player2.x + this.game.player2.width) {
            this.x = this.game.player2.x - this.r;
            this.xSpeed *= -1;
            this.broadcastSpeed();
        }

        // Check if ball has gone out of bounds past a player, add score accordingly (Should probably be handled as an event and then sent in the game function)
        if (this.x + this.r < 0) {
            this.x = this.game.resolution.x/2;
            this.y = this.game.resolution.y/2;
            this.xSpeed *= -1;
            this.broadcastSpeed();
            this.game.player2.score += 1;
            // Send score to all players 
            this.game.broadcastScore();
        } else if (this.x - this.r > this.game.resolution.x) {
            this.x = this.game.resolution.x/2;
            this.y = this.game.resolution.y/2;
            this.xSpeed *= -1;
            this.game.player1.score += 1;
            this.broadcastSpeed();
            this.game.broadcastScore();
        }

        // Update ball position
        this.x += this.xSpeed * dt;
        this.y += this.ySpeed * dt;
    }
}

// Paddle function for keeping track of players, player physics/movements, player status and score
function Paddle(socket, game) {
    this.socket = socket;
    this.game = game;
    this.status = "connected";
    this.direction = 0;
    this.height = 200;
    this.width = 20;
    this.speed = 600;
    this.x = 0;
    this.y = 0;
    this.score = 0;

    // Timer for delta time
    this.lastUpdate = Date.now();

    this.update = function() {

        // Delta time math
        let now = Date.now();
        let dt = (now - this.lastUpdate)/1000;
        this.lastUpdate = now;

        // Check that the player isn't out of bounds
        if (this.y + this.direction * dt * this.speed <= this.game.resolution.y - this.height && this.y + this.direction * dt * this.speed >= 0) {
            this.y += this.direction * dt * 600;
        } else if (this.y + this.direction * dt * 600 <= 1080 - this.height) {
            this.y = 0;
        } else if (this.y + this.direction * dt * 600 >= 0) {
            this.y = 1080 - this.height;
        }
    }

    // Function for sending specific player messages
    this.sendUpdate = function(event, msg) {
        this.socket.emit(event, msg);
    }

    // Event handler for player disconnect, set status to disconnected
    this.socket.on("disconnect", (reason) => {
        console.log("Player disconnected, reason: " + reason);
        this.status = "disconnected";
    });

    // Event handler for user input
    this.socket.on("input", (msg) => {
        this.direction = msg;
    });
}

// Main game function for keeping track of game status, players and ball
function Game(player2, player1) {
    this.resolution = {x: 1920, y: 1080}
    this.player1 = new Paddle(player1, this);
    this.player2 = new Paddle(player2, this);
    this.ball = new Ball(this);
    this.status = "ongoing"

    // Set player positions for both players and the ball
    this.player1.x = 0;
    this.player1.y = (this.resolution.y - this.player1.height)/2

    this.player2.x = this.resolution.x - this.player2.width;
    this.player2.y = (this.resolution.y - this.player2.height)/2

    this.ball.x = this.resolution.x/2;
    this.ball.y = this.resolution.y/2;

    // Function for broadcasting a message to all players
    this.broadcast = function(event, msg) {
        this.player1.sendUpdate(event, msg);
        this.player2.sendUpdate(event, msg);
    }

    // Send sync message to all players with game variables
    this.broadcast("sync", {
        bxs: this.ball.xSpeed / this.resolution.x,
        bys: this.ball.ySpeed / this.resolution.y,
        br: this.ball.r / this.resolution.x,
        ps: this.player1.speed / this.resolution.y,
        os: this.player2.speed / this.resolution.y,
        h: this.player1.height / this.resolution.y,
        w: this.player1.width / this.resolution.x
    });   

    // Broadcast the score to all players
    this.broadcastScore = function() {
        this.broadcast("score", {
            p1: this.player1.score,
            p2: this.player2.score
        });
    }

    // Set intervals for updating players and physics
    // Players use client side prediction so they don't need to get updated as often as the physics
    // Updating them more often would increase latency
    this.physicsUpdateInterval = setInterval(() => {this.physicsUpdate()}, 15);
    this.playerUpdateInterval = setInterval(() => {this.playerUpdate()}, 45);

    // Main physics update loop
    this.physicsUpdate = function() {
        this.player1.update();
        this.player2.update();
        this.ball.update(this);
    }

    // Main player update loop
    this.playerUpdate = function() {
        // Make sure both players are connected
        if (this.player1.status !== "connected" || this.player2.status !== "connected") {
            console.log("Ending game due to player disconnect")
            // Send end message if someone has disconnected
            this.broadcast("end", "ended");
            // Stop updates
            clearInterval(this.physicsUpdateInterval);
            clearInterval(this.playerUpdateInterval);
            // Set game status to ended and clean up the lobbies array
            this.status = "ended";
            cleanLobbies();
        }

        // Send game data to player 1 (This could be handled a better way)
        this.player1.sendUpdate("posUpdate", {
            px: this.player1.x / this.resolution.x,
            py: this.player1.y / this.resolution.y,
            ox: this.player2.x / this.resolution.x,
            oy: this.player2.y / this.resolution.y,
            bx: this.ball.x / this.resolution.x,
            by: this.ball.y / this.resolution.y
        });

        // Send game data to player 2 (This could be handled a better way)
        this.player2.sendUpdate("posUpdate", {
            px: this.player2.x / this.resolution.x,
            py: this.player2.y / this.resolution.y,
            ox: this.player1.x / this.resolution.x,
            oy: this.player1.y / this.resolution.y,
            bx: this.ball.x / this.resolution.x,
            by: this.ball.y / this.resolution.y
        });
    }
}

// Handle new sockets opening
io.on('connection', (socket) => {
    // Log new connection
    console.log("New connection")
    // Push the new connection to the player queue
    queue.push(socket);
    // Create a new game and push it to the lobbies array if there are two or more players in queue
    if (queue.length % 2 == 0 || queue.length > 2) {
        lobbies.push(new Game(queue.pop(), queue.pop()));
        console.log("New lobby created");
    }
});

// Send index.html if the HTTP server gets a connection.
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start HTTP server
server.listen(3000, () => {
    console.log('Listening on port 3000');
});