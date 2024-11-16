const crypto = require('crypto');

class SessionError extends Error {};

function SessionManager () {
	const CookieMaxAgeMs = 15000;

	const sessions = {};

	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
		const token = crypto.randomBytes(16).toString('hex');

		const metadata = {
			username: username,
			timestamp: Date.now(),
			expiry: Date.now() + maxAge
		};
        
        sessions[token] = metadata;

        response.cookie('cpen322-session', token, {maxAge : maxAge});

        setTimeout(() => {
        	delete sessions[token];
        }, maxAge);
	};

	this.deleteSession = (request) => {
		const sessionToken = request.session;

		delete request.username;
		delete request.session;
		delete sessions[sessionToken];
		
	};

	this.middleware = (request, response, next) => {
        const cookies = request.headers.cookie;

        if (!cookies) {
        	return next(new SessionError("No cookies found"));
        }

		var key = null;
		var token = null;
		
		const cookieArr = cookies.split(';');
		for(let i = 0; i < cookieArr.length; i++) {
			const [k, v] = cookieArr[i].trim().split('=');
			if (k == "cpen322-session") {
				key = k;
				token = v;
			}
		}

		if (key && token) {
			if (sessions[token]) {
				request.username = sessions[token].username;
				request.session = token;
				next();
			} else {
				return next(new SessionError("No session found"));
			}
		} else {
			return next(new SessionError("No cookies found"));
		}
	};

	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

SessionManager.Error = SessionError;

module.exports = SessionManager;