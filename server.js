const path = require('path');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const host = 'localhost';
const port = 3000;
const brokerPort = 8000;
const clientApp = path.join(__dirname, 'client');

// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);	// logging for debug

const broker = new WebSocket.Server({port: brokerPort});


var chatrooms = [
	{
		id: "room-1",
		name: "temp1",
		image: "assets/everyone-icon.png"
	},
	{
		id: "room-2",
		name: "temp2",
		image: "assets/canucks.png"
	},
	{
		id: "room-3",
		name: "temp3",
		image: "assets/minecraft.jpg"
	}

];

messages = {
	"room-1": [],
	"room-2": [],
	"room-3": []
}

broker.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        
        if (messages[parsedMessage.roomId]) {
            messages[parsedMessage.roomId].push({
                username: parsedMessage.username,
                text: parsedMessage.text,
            });

            broker.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

app.route("/chat")
	.get((req, res) => {
		const roomData = chatrooms.map((room) => ({
			id: room.id,
			name: room.name,
			image: room.image,
			messages: messages[room.id]
		}));

		res.json(roomData);
	}).post((req, res) => {
		const {name, image} = req.body;
		
		if (!name) {
			const error = new Error('ERROR: no name field.');
			return res.status(400).json({error: error.message});
		}
		else {
			const newID = `room-${chatrooms.length + 1}`;

			const newRoom = {
				id: newID,
				name: name,
				image: image	
			};

			chatrooms.push(newRoom);
			messages[newID] = [];

			return res.status(200).json(newRoom);
		}
	});


// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});