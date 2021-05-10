const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

lobbies = [];
queue = [];

function Lobby(p1, p2) {
    this.host = p1;
    this.visitor = p2;

    this.host.emit("assign", "host");
    this.visitor.emit("assign", "visitor");

    this.host.on("event", (msg) => {
        console.log("event recieved");
        this.visitor.emit("update", msg);
    });
    this.visitor.on("event", (msg) => {
        console.log("event recieved 2");
        this.host.emit("update", msg);
    });
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log("new connection")
    queue.push(socket);
    if (queue.length % 2 == 0) {
        lobbies.push(new Lobby(queue.pop(), queue.pop()));
    }
    socket.on("disconnect", (reason) => {
        console.log("disconnected " + reason);
    })
});

server.listen(3000, () => {
    console.log('listening on 3000');
});