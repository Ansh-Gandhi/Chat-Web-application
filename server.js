const path = require('path');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
const Database = require('./Database');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'cpen322-messenger';

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

const db = new Database(mongoUrl, dbName);

db.connected.catch((err) => {
    console.error('Error connecting to MongoDB:', err);
});

const messageBlockSize = 10;
let messages = {};

db.getRooms()
.then((rooms) => {
	const messagePromises = rooms.map((room) => {
			messages[room._id] = [];
	});
	return Promise.all(messagePromises);
})
.catch((err) => {
	console.error("Error initializing messages:", err);
});

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

		if (messages[parsedMessage.roomId].length >= messageBlockSize) {
			const time = Date.now();
			const conversation = {
				room_id: parsedMessage.roomId,
				timestamp: time,
				messages: messages[parsedMessage.roomId]
			}

			db.addConversation(conversation)
			.then(() => {
				messages[parsedMessage.roomId] = [];
			})
			.catch(err => {
				console.log("error with addConversation in server.js: ", err);
			});
		}
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

app.get('/chat/:room_id', (req, res) => {
	db.getRoom(req.params.room_id)
	.then(result => {
		if (result) {
			res.json(result);
		} else {
			res.status(404).json({error: `Room ${req.params.room_id} was not found`});
		}
	}).catch(err => {
		res.status(500).json({error: "Failed to get chatroom."});
	});
});

app.get('/chat/:room_id/messages', (req, res) => {
	const before = parseInt(req.query.before);

	if(isNaN(before)) {
		return res.status(400).json({error: "Before query is not a number"});
	}
	
	db.getLastConversation(req.params.room_id, before)
	.then(result => {
		console.log(result);
		return res.json(result);
	})
	.catch(err => {
		return res.status(500).json({error: "Failed to get conversation"});
	})
})

app.route("/chat")
	.get((req, res) => {
		db.getRooms()
		.then(result => {
			const roomData = result.map((room) => ({
				_id: room._id,
				name: room.name,
				image: room.image,
				messages: messages[room._id] || []
			}));
			res.json(roomData);
		})
		.catch(err => {
			res.status(500).json({error: "Failed to get chatrooms."});
		});
	})
	.post((req, res) => {
		const {name, image} = req.body;
		
		if (!name) {
			return res.status(400).json({error: 'ERROR: no name field.'});
		}
		
		const newRoom = {name, image};

		db.addRoom(newRoom)
		.then(result => {
			messages[result._id] = [];
			res.status(200).json(result);
		}).catch(err => {
			res.status(500).json({error: "Failed to add chatroom."});
		});
	});


// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});