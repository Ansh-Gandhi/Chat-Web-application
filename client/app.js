var Service = {
    origin: window.location.origin,

    getAllRooms: function() {
        let url = `${this.origin}/chat`;

        return fetch(url)
        .then(response => {
            if(!response.ok) {
                return response.text().then(errorMsg => {
                    throw new Error(errorMsg || `HTTP error. Status: ${response.status}`)
                });
            }
            return response.json();
        })
        .catch(error => {
            return Promise.reject(error);
        });
    },

    addRoom: function (data) {
        let url = `${this.origin}/chat`;

        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => {
            if(!response.ok) {
                return response.text().then(errorMsg => {
                    throw new Error(errorMsg || `HTTP error. Status: ${response.status}`)
                });
            }
            return response.json();
        })
        .catch(error => {
            return Promise.reject(error);
        });
    },

    getLastConversation: function(roomId, before) {
        let url = `${this.origin}/chat/${roomId}/messages?before=${before}`;

        return fetch(url)
        .then(res => {
            if (!res.ok) {
                return res.text().then(errorMsg => {
                    throw new Error(errorMsg || `HTTP error. Status: ${res.status}`)
                });
            }
            return res.json();
        })
        .catch(error => {
            return Promise.reject(error);
        })
    }
};

// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString) {
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

let profile = {username: "Alice"}

function main() {
    const socket = new WebSocket("ws://localhost:8000");

    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);

        const room = lobby.getRoom(message.roomId);
        
        if(room) {
            room.addMessage(message.username, message.text);
        }
    });

    const lobby = new Lobby();

    const lobbyView = new LobbyView(lobby);
    const chatView = new ChatView(socket);
    const profileView = new ProfileView();

    function renderRoute() {
        let hash = window.location.hash; 
        
        emptyDOM(document.querySelector('#page-view'));

        if(hash.substring(2) === "") {
            document.querySelector('#page-view').appendChild(lobbyView.elem);
        } else if(hash.substring(2, 6) === "chat") {
            const roomID = hash.split('/')[2]; 
            
            Service.getAllRooms()
    .then(rooms => {
        let found = false;
        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i]._id == roomID) {
                const roomInstance = lobby.getRoom(roomID) || new Room(rooms[i]._id, rooms[i].name, rooms[i].image, rooms[i].messages);
                const time = Date.now()
                return Service.getLastConversation(roomID, time)
                .then(lastMessages => {
                    // Set the messages from the last conversation
                    
                    roomInstance.messages = (lastMessages) ? lastMessages.messages : roomInstance.messages;
                    if (!roomInstance) {
                        roomInstance.messages = [];
                    }
                // If roomInstance is newly created, add it to the lobby
                if (!lobby.getRoom(roomID)) {
                    lobby.addRoom(roomInstance.id, roomInstance.name, roomInstance.image, roomInstance.messages);
                }
                
                chatView.setRoom(roomInstance);
                document.querySelector('#page-view').appendChild(chatView.elem);
                });
            }
        }
        
        if (!found) {
            console.log("Room not found");
        }
    })
    .catch(error => {
        console.log("Failed to get rooms:", error);
    });
        } else if(hash.substring(2, 9) === "profile") {
            document.querySelector('#page-view').appendChild(profileView.elem);
        }
    }

    function refreshLobby () {
        Service.getAllRooms().then(rooms => {
            rooms.forEach(room => {
                if(room._id in lobby.rooms) {
                    lobby.rooms[room._id].image = room.image;
                    lobby.rooms[room._id].name = room.name;
                }
                else {
                    lobby.addRoom(room._id, room.name, room.image, room.messages);
                }
            });
        })
        .catch(error => {
            console.log("Failed to refresh: ", error);
        });
    }

    window.addEventListener("popstate", renderRoute);
    renderRoute();

    refreshLobby();

    setInterval(refreshLobby, 5000);
}

window.addEventListener("load", main);

class LobbyView {
    constructor(lobby) {
        this.lobby = lobby;

        const content = 
            `<div class="content">
                <ul class="room-list"></ul>

                <div class="page-control">
                    <input type="text" name="" id="" placeholder="Room Title">
                    <button>Create Room</button>
                </div>
            </div>`;

        this.elem = createDOM(content);

        this.listElem = this.elem.querySelector('ul.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');

        this.lobby.onNewRoom = (room) => {
            const roomElem = createDOM(
                `<li>
                    <a href="#/chat/${room.id}"><img src="${room.image}" alt=""> <span class="chatroom-text">${room.name}</span></a>
                </li>`
            );

            this.listElem.appendChild(roomElem);
        }

        this.buttonElem.addEventListener("click", () => {
            const roomName = this.inputElem.value.trim();

            const roomData = {
                name: roomName,
                image: "assets/everyone-icon.png"
            }

            Service.addRoom(roomData)
                .then(newRoom => {
                    this.lobby.addRoom(newRoom._id, newRoom.name, newRoom.image);
                    this.inputElem.value = "";
                })
                .catch(error => {
                    console.log("Failed to add room: ", error);
                });
        });

        this.redrawList();
    }

    redrawList() {
        emptyDOM(this.listElem);

        Object.values(this.lobby.rooms).forEach((room) => {
            const roomElem = createDOM(
                `<li>
                    <a href="#/chat/${room.id}"><img src="${room.image}" alt=""> <span class="chatroom-text">${room.name}</span></a>
                </li>`
            );

            this.listElem.appendChild(roomElem);
        });
    }
}

class ChatView {
    constructor(socket) {
        this.socket = socket;
        this.room = null;

        const content = 
            `<div class = "content">
                <h4 class = "room-name">Chat Name</h4>

                <div class = "message-list"></div>
                
                <div class = "page-control">
                    <textarea name="" id="messagebox" rows="1" cols="100"></textarea>
                    <button>Send</button>
                </div>
            </div>`;

        this.elem = createDOM(content);

        this.titleElem = this.elem.querySelector('h4');
        this.chatElem = this.elem.querySelector('div.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button');

        this.buttonElem.addEventListener("click", () => {
            this.sendMessage();
        });

        this.inputElem.addEventListener("keyup", (event) => {
            if(event.key === "Enter" && !event.shiftKey) {
                this.sendMessage();
            }
        });

        this.chatElem.addEventListener("wheel", (event) => {
            if(this.chatElem.scrollTop <= 0 && event.deltaY < 0 && this.room.canLoadConversation) {
                this.room.getLastConversation.next();
            }
        });
    }

    sendMessage() {
        const message = this.inputElem.value.trim();

        if(this.room && message) {
            const messageData = {
                roomId: this.room.id,
                username: profile.username,
                text: message
            }
            
            this.room.addMessage(profile.username, message);
            this.socket.send(JSON.stringify(messageData));
            this.inputElem.value = "";
        }
    }

    setRoom(room) {
        this.room = room;
        this.titleElem.textContent = room.name;

        emptyDOM(this.chatElem);

        room.messages.forEach((message) => {
            const messageClass = message.username === profile.username ? "my-message" : "";
            const messageElem = createDOM(
                `<div class = "message ${messageClass}">
                    <span class = "message-user">${message.username}</span>
                    <span class = "message-text">${message.text}</span>
                </div>`
            );

            this.chatElem.appendChild(messageElem);

            this.room.getLastConversation = makeConversationLoader(this.room);
        });

        this.room.onFetchConversation = (conversation) => {
            const prevScrollHeight = this.chatElem.scrollTop;
        
            for (let i = conversation.messages.length - 1; i >= 0; i--) {
                const messageClass = conversation.messages[i].username === profile.username ? "my-message" : "";
                const messageElem = createDOM(
                    `<div class = "message ${messageClass}">
                        <span class = "message-user">${conversation.messages[i].username}</span>
                        <span class = "message-text">${conversation.messages[i].text}</span>
                    </div>`
                );

                this.chatElem.prepend(messageElem);
            }

            const newScrollHeight = this.chatElem.scrollTop;
            this.chatElem.scrollTop = newScrollHeight - prevScrollHeight;

        }

        this.room.onNewMessage = (message) => {
            const messageClass = message.username === profile.username ? "my-message" : "";
            const messageElem = createDOM(
                `<div class = "message ${messageClass}">
                    <span class = "message-user">${message.username}</span>
                    <span class = "message-text">${message.text}</span>
                </div>`
            );

            this.chatElem.appendChild(messageElem);
        };
    }
}

class ProfileView {
    constructor() {
        const content = 
            `<div class="content">
                <div class="profile-form">
                    <div class="form-field">
                    <label for="username">Username</label>
                    <input type="text" name="" id="username">
                    </div>

                    <div class="form-field">
                    <label for="password">Password</label>
                    <input type="password" name="" id="password">
                    </div>

                    <div class="form-field">
                    <label for="avatar-image">Avatar Image</label>
                    <img class="profile-page-img" src="./assets/person-fill.svg" alt=""><input type="file" name="" id="avatar-image">
                    </div>

                    <div class="form-field" id="about-div">
                    <label for="about">About</label>
                    <textarea name="" id="about" rows="10" cols="30"></textarea>
                    </div>
                </div>

                <div class="page-control">
                <button>Save</button>
                </div>
            </div>`;

        this.elem = createDOM(content);
    }
}

    function* makeConversationLoader(room) { 
        var mostRecentTimestamp = room.timestamp;

        while(room.canLoadConversation) {
            room.canLoadConversation = false;
            const conv = yield Service.getLastConversation(room.id, mostRecentTimestamp)
            .then(result => {
                if (result) {
                    room.addConversation(result);
                    room.canLoadConversation = true;
                    mostRecentTimestamp = result.timestamp;
                }
                return result;
            })
            .catch(err => {
                console.log("Error in generator: ", err);
            })
        }
    }


class Room {
    constructor(id, name, image = "assets/everyone-icon.png", messages = []) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.timestamp = Date.now()
        this.canLoadConversation = true;
        this.getLastConversation = makeConversationLoader(this);
    }

    addMessage(username, text) {
        if(text.trim() === "") {
            return;
        }     

        const message = {
            username: username,
            text: text,
        };

        this.messages.push(message);

        if(typeof this.onNewMessage === "function") {
            this.onNewMessage(message)
        }
    }
    
    addConversation(conversation) {
        this.messages = [...conversation.messages, ...this.messages];
        if(typeof this.onFetchConversation === "function") {
            this.onFetchConversation(conversation);
        }
    }
}

class Lobby { 
    constructor() {
        this.rooms = {};
    }

    getRoom(roomId) {
        return this.rooms[roomId] || null;
    }

    addRoom(id, name, image, messages) {
        const room = new Room(id, name, image, messages);
        this.rooms[id] = room;

        if(typeof this.onNewRoom === "function") {
            this.onNewRoom(room);
        }
    }
}