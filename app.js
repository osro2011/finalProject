const http = require('http');
const { Server } = require("socket.io");
const express = require('express');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

var lobbies = [];
var queue = [];

// Server logic

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
setInterval(cleanLobbies, 5000);

// Game logic

function Game(p1, p2) {
    // Store Players in game, game state and create a new ball.
    this.players = [p1, p2];
    this.state = "ongoing";
    this.ball = new Ball();

    // Main game update function
    this.update = function() {
        // Check Player data
        // Do game logic things
        // Send game data to Players
    }
    
    for (player of this.players) {
        player.socket.on("disconnect", (reason) => {
            console.log("player disconnected, closing game " + reason);
            player.status = "disconnected";
            this.endGame();
        });
    }

    this.endGame = function() {
        for (player of this.players) {
            player.sendData("end", "game ended");
        }
        this.state = "ended";
    };
}

function Paddle(x, y) {
    this.width = 20;
    this.height = 300;
    this.x = x;
    this.y = y - this.height/2;
}

function Ball(x, y) {
    this.x = 0;
    this.y = 0;
}

function Player(socket) {
    this.resolution = [];
    this.socket = socket;
    this.status = "connected";
    this.paddle = new Paddle();
    this.sendData = function(event, message) {
        if (this.status === "connected") {
            this.socket.emit(event, message);
        }
    }
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log("new connection")
    queue.push(new Player(socket));
    if (queue.length % 2 == 0) {
        lobbies.push(new Game(queue.pop(), queue.pop()));
    }
    socket.on("disconnect", (reason) => {
        console.log("disconnected " + reason);
    })
});

server.listen(3000, () => {
    console.log('listening on 3000');
});
