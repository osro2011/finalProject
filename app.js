const http = require('http');
const { Server } = require("socket.io");
const express = require('express');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

var lobbies = [];
var queue = [];

// Server logic

// Add queue cleanup (maybe clean up before adding new players to the queue?)

function cleanLobbies() {
    console.log("Cleaning game lobbies...")
    for (lobby of lobbies) {
        if (lobby.state !== "ongoing") {
            lobbies.splice(lobbies.indexOf(lobby), 1);
            console.log("Cleaned up a game lobby!")
        }
    }
}

// Clean up ended lobbies every 5 seconds
// setInterval(cleanLobbies, 5000);

// Game logic

function Game(p1, p2) {
    // Store Players in game, game state and create a new ball.
    this.players = [p1, p2];
    this.state = "ongoing";
    // Create new ball in the center of the screen
    this.ball = new Ball(0.5, 0.5);
    // Set player 2's paddle to the right of the screen
    this.players[1].paddle.x = 1 - this.players[1].paddle.width;
    
    // Make sure all players are still connected
    for (player of this.players) {
        if (player.status !== "connected") {
            console.log("Ending game due to player " + player.status);
            // this.endGame();
            return "Failed to start game because not all players were connected.";
        }
    }
    this.players[0].sendData("start", {
        p: this.players[0].paddle.exportData(), 
        o: this.players[1].paddle.exportData(), 
        ball: this.ball.exportData()
    });
    
    this.players[1].sendData("start", {
        p: this.players[1].paddle.exportData(), 
        o: this.players[0].paddle.exportData(), 
        ball: this.ball.exportData()
    });
    
    // Main game update function
    this.update = function() {
        // Make sure all players are still connected
        for (player of this.players) {
            if (player.status !== "connected") {
                console.log("Ending game due to player " + player.status);
                this.endGame();
            }
        }
        
        // Do game logic things
        // Send game data to Players
        this.players[0].sendData("data", {
            p: this.players[0].paddle.exportPosition(), 
            o: this.players[1].paddle.exportPosition(), 
            ball: this.ball.exportPosition()
        });
        this.players[1].sendData("data", {
            p: this.players[1].paddle.exportPosition(), 
            o: this.players[0].paddle.exportPosition(), 
            ball: this.ball.exportPosition()
        });
    }

    this.endGame = function() {
        for (player of this.players) {
            player.sendData("end", "game ended");
        }
        this.state = "ended";
        cleanLobbies();
    }

    // Update game 30 times per second
    setInterval(() => {this.update()}, 50);
}

function Paddle(x, y) {
    this.width = 0.01;
    this.height = 0.2;
    this.x = x;
    this.y = y - this.height/2;

    this.exportPosition = function() {
        return {
            x: this.x,
            y: this.y
        }
    }

    this.exportData = function(){
        return {
            x: this.x,
            y: this.y,
            w: this.width,
            h: this.height
        }
    }

    this.update = function() {

    }
}

function Ball(x, y) {
    this.x = x;
    this.y = y;
    this.r = 0.008;

    this.exportPosition = function() {
        return {
            x: this.x,
            y: this.y
        }
    }

    this.exportData = function(){
        return {
            x: this.x,
            y: this.y,
            r: this.r
        }
    }
}

function Player(socket) {
    this.socket = socket;
    this.status = "connected";
    this.paddle = new Paddle(0, 0.5);

    // Set player status if the socket disconnects
    this.socket.on("disconnect", (reason) => {
        console.log("player disconnected, " + reason);
        this.status = "disconnected";
    });

    this.socket.on("data", (data) => {
        this.paddle.y = data;
    })

    this.sendData = function(event, message) {
        if (this.status === "connected") {
            this.socket.emit(event, message);
        }
    }
}



// Handle new sockets
io.on('connection', (socket) => {
    // Log new connection
    console.log("New connection")
    // Push the new connection as a Player to the player queue
    queue.push(new Player(socket));
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