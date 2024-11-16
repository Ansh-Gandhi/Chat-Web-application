const path = require('path');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
const Database = require('./Database');
const SessionManager = require('./SessionManager');
const crypto = require('crypto');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'cpen322-messenger';
const sessionManager = new SessionManager();

const host = 'localhost';
const port = 3000;
const brokerPort = 8000;
const clientApp = path.join(__dirname, 'client');

let app = express();

app.use(express.json())
app.use(express.urlencoded({ extended: true })) 
app.use(logRequest);

app.get('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.get('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.get('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.get('/', sessionManager.middleware, express.static(clientApp + '/index.html'));


const broker = new WebSocket.Server({port: brokerPort});

const db = new Database(mongoUrl, dbName);

db.connected.catch((err) => {
    console.error('Error connecting to MongoDB:', err);
});

const messageBlockSize = 10;
let messages = {};

function isCorrectPassword(password, saltedHash) {
	const salt = saltedHash.substring(0, 20);
	const storedPasswordHash = saltedHash.substring(20);
	
	const saltedPassword = password + salt;

	const hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('base64');

	return storedPasswordHash === hashedPassword;
}

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

broker.on('connection', (ws, req) => { 
	const cookie = req.headers.cookie;

	if (!cookie) {
		ws.close();
		return;
	}

	var cookieKey = null;
	var cookieToken = null;
	const cookieArray = cookie.split(';');
	for(let i = 0; i < cookieArray.length; i++) {
		const [key, value] = cookieArray[i].trim().split('=');
		if (key == "cpen322-session") {
			cookieKey = key;
			cookieToken = value;
		}
	}

	var curr_username;	

	if (cookieKey && cookieToken) {
		curr_username = sessionManager.getUsername(cookieToken);
		if (!curr_username) {
			ws.close();
			return;
		}
	}
	else {
		ws.close();
		return;

	}

    ws.on('message', (message) => {
        var parsedMessage = JSON.parse(message);
		parsedMessage.username = curr_username;

		var sanitized = "";

        for (let i = 0; i < parsedMessage.text.length; i++) {
            if(parsedMessage.text[i] === "<") {
                sanitized += "&lt;";
            }
            else if (parsedMessage.text[i] === ">") {
                sanitized += "&gt;";
            } 
            else {
                sanitized += parsedMessage.text[i];
            }
        }

		parsedMessage.text = sanitized;
        
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

app.get('/chat', sessionManager.middleware, (req, res) => {
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
});

app.get('/chat/:room_id', sessionManager.middleware, (req, res) => {
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

app.get('/chat/:room_id/messages', sessionManager.middleware, (req, res) => {
	const before = parseInt(req.query.before);
	
	db.getLastConversation(req.params.room_id, before)
	.then(result => {
		return res.status(200).json(result);
	})
	.catch(err => {
		return res.status(500).json({error: "Failed to get conversation"});
	})
});

app.post('/chat', sessionManager.middleware, (req, res) => {
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

app.post('/login', (req, res) => {
	db.getUser(req.body.username)
	.then(result => {
		if (result == null) {
			res.redirect('/login');
		}
		else {
			if (isCorrectPassword(req.body.password, result.password)) {
				sessionManager.createSession(res, req.body.username);
				res.redirect('/');
			} else {
				res.redirect('/login');
			}
		}
	})
});

app.get('/profile', sessionManager.middleware, (req, res) => {		
	const username = {
		username: req.username
	};
	res.status(200).json(username);
});

app.get('/logout', (req, res) => {
	sessionManager.deleteSession(req);
	res.redirect('/login');
});

app.use((err, req, res, next) => {
	if (err instanceof SessionManager.Error) {
		const acceptHeader = req.headers.accept;
		if (acceptHeader.includes('application/json')) {
			return res.status(401).json({error: err.message});
		} else {
			return res.redirect('/login');
		}
	} else {
		return res.status(500).json({error: 'Server Error'});
	}
});

app.use('/', express.static(clientApp, { extensions: ['html'] }));

app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});