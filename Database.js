const { MongoClient, ObjectId } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v6.3 - [API Documentation](http://mongodb.github.io/node-mongodb-native/6.3/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		const client = new MongoClient(mongoUrl);

		client.connect()
		.then(() => {
			console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
			resolve(client.db(dbName));
		}, reject);
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			const rooms = db.collection("chatrooms");
			const cursor = rooms.find({});

			const allRooms = cursor.toArray()
			.then(result => {
				resolve(result);
			})
			.catch(err => {
				reject(err);
			})
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			const rooms = db.collection("chatrooms");
			rooms.findOne({_id: (ObjectId.isValid(room_id)) ? new ObjectId(room_id) : room_id})
			.then((result) => {
				if (!result) {
					rooms.findOne({_id: room_id})
					.then(next => {
						return resolve (next);
					})
					.catch(error => {
						console.log("Err getRoom: ", error);
					})
				}
				return resolve(result);
			})
			.then(next => {
				
			})
			.catch(err => {
				console.log("Error retrieving single room: ", err);
			})

		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			if(!room.name) {
				reject(new Error("Room name is required"));
			} else {
				const rooms = db.collection("chatrooms");
				rooms.insertOne(room)
				.then(result => {
					return rooms.findOne({_id: result.insertedId});
				})
				.then(insertedRoom => {
					resolve(insertedRoom);
				})
				.catch(err => {
					reject(err);
				});
			}
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if(!before) {
				before = Date.now();
			}

			const query = {room_id: room_id, timestamp: {$lt: before}};

			const convs = db.collection("conversations");

			const cursor = convs.find(query);
			cursor.toArray()
			.then(result => {
				if (result.length <= 0) {
					resolve(null);
				}

				var max = result[0].timestamp;
				var maxIndex = 0;

				for(let i = 1; i < result.length; i++) {
					if (result[i].timestamp > max) {
						max = result[i].timestamp;
						maxIndex = i;
					}
				}
				resolve(result[maxIndex]);
			})
			.catch(err => {
				reject(err);
			})
			
		})
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if (!conversation.room_id || !conversation.timestamp || !conversation.messages) {
				reject(new Error("Conversation is missing required fields"));
			}
			
			const convs = db.collection("conversations");
			convs.insertOne(conversation)
			.then(result => {
				resolve(convs.findOne({_id: result.insertedId}));
			})
			.catch(err => {
				reject(err);
			})
		})
	)
}

module.exports = Database;