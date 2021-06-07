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

function Ball(game) {
    this.game = game;
    this.x = 0;
    this.y = 0;
    this.r = 10;
    this.xSpeed = 566;
    this.ySpeed = 400;

    this.lastUpdate = Date.now();

    this.broadcastSpeed = function() {
        game.broadcast("ballUpdate", {
            xs: this.xSpeed / this.game.resolution.x,
            ys: this.ySpeed / this.game.resolution.y
        });
    }

    this.update = function() {

        let now = Date.now();
        let dt = (now - this.lastUpdate)/1000;
        this.lastUpdate = now;

        if (this.y < this.r) {
            this.y = this.r;
            this.ySpeed *= -1;
            this.broadcastSpeed();
        } else if (this.y > this.game.resolution.y - this.r) {
            this.y = this.game.resolution.y - this.r;
            this.ySpeed *= -1;
            this.broadcastSpeed();
        }

        if (this.x < this.game.player1.width + this.r && this.y > this.game.player1.y - this.r && this.y < this.game.player1.y + this.game.player1.height + this.r && this.x > this.game.player1.x + this.game.player1.width) {
            this.x = this.r + game.player1.width;
            this.xSpeed *= -1;
            this.broadcastSpeed();
        } else if (this.x > this.game.player2.x - this.r && this.y > this.game.player2.y - this.r && this.y < this.game.player2.y + this.game.player2.height + this.r && this.x < this.game.player2.x + this.game.player2.width) {
            this.x = this.game.player2.x - this.r;
            this.xSpeed *= -1;
            this.broadcastSpeed();
        }

        this.x += this.xSpeed * dt;
        this.y += this.ySpeed * dt;
    }
}

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

    this.lastUpdate = Date.now();

    this.update = function() {
        let now = Date.now();
        let dt = (now - this.lastUpdate)/1000;
        this.lastUpdate = now;

        if (this.y + this.direction * dt * this.speed <= this.game.resolution.y - this.height && this.y + this.direction * dt * this.speed >= 0) {
            this.y += this.direction * dt * 600;
        } else if (this.y + this.direction * dt * 600 <= 1080 - this.height) {
            this.y = 0;
        } else if (this.y + this.direction * dt * 600 >= 0) {
            this.y = 1080 - this.height;
        }
    }

    this.sendUpdate = function(event, msg) {
        this.socket.emit(event, msg);
    }

    this.socket.on("disconnect", (reason) => {
        console.log("Player disconnected, reason: " + reason);
        this.status = "disconnected";
    });

    this.socket.on("input", (msg) => {
        this.direction = msg;
    });
}

function Game(player2, player1) {
    this.resolution = {x: 1920, y: 1080}
    this.player1 = new Paddle(player1, this);
    this.player2 = new Paddle(player2, this);
    this.ball = new Ball(this);
    this.status = "ongoing"

    this.player1.x = 0;
    this.player1.y = (this.resolution.y - this.player1.height)/2

    this.player2.x = this.resolution.x - this.player2.width;
    this.player2.y = (this.resolution.y - this.player2.height)/2

    this.ball.x = this.resolution.x/2;
    this.ball.y = this.resolution.y/2;

    this.broadcast = function(event, msg) {
        this.player1.sendUpdate(event, msg);
        this.player2.sendUpdate(event, msg);
    }

    // Update physics and players
    this.physicsUpdateInterval = setInterval(() => {this.physicsUpdate()}, 15);
    this.playerUpdateInterval = setInterval(() => {this.playerUpdate()}, 45);

    this.physicsUpdate = function() {
        this.player1.update();
        this.player2.update();
        this.ball.update(this);
    }

    this.player1.sendUpdate("sync", {
        bxs: this.ball.xSpeed / this.resolution.x,
        bys: this.ball.ySpeed / this.resolution.y,
        ps: this.player1.speed / this.resolution.y,
        os: this.player2.speed / this.resolution.y,
        h: this.player1.height / this.resolution.y,
        w: this.player1.width / this.resolution.x

    });

    this.player2.sendUpdate("sync", {
        bxs: this.ball.xSpeed / this.resolution.x,
        bys: this.ball.ySpeed / this.resolution.y,
        ps: this.player1.speed / this.resolution.y,
        os: this.player2.speed / this.resolution.y,
        h: this.player1.height / this.resolution.y,
        w: this.player1.width / this.resolution.x
    });

    this.playerUpdate = function() {
        if (this.player1.status !== "connected" || this.player1.status !== "connected") {
            console.log("Ending game due to player disconnect")
            // Stop updates
            clearInterval(this.physicsUpdateInterval);
            clearInterval(this.playerUpdateInterval);
            this.status = "ended";
            cleanLobbies();
        }

        this.player1.sendUpdate("posUpdate", {
            px: this.player1.x / this.resolution.x,
            py: this.player1.y / this.resolution.y,
            ox: this.player2.x / this.resolution.x,
            oy: this.player2.y / this.resolution.y,
            bx: this.ball.x / this.resolution.x,
            by: this.ball.y / this.resolution.y
        });
        
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

// Handle new sockets
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