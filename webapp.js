"use strict";

var express = require('express');
var bodyparser = require('body-parser');
var bcrypt = require('bcrypt');
var moment = require('moment');
var uuid = require('node-uuid');

var sql = require('./mysql');

// Initialize webapp for handling API endpoints
var webapp = express();
var expressws = require('express-ws')(webapp);
webapp.use(bodyparser.urlencoded({extended: false}));
webapp.use(bodyparser.json());
webapp.enable('trust proxy'); // http://stackoverflow.com/a/14631683/3478907
webapp.use(function(request, result, next){ // http://stackoverflow.com/a/18311469/4099022
    result.setHeader('Access-Control-Allow-Origin', null);
    result.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    result.setHeader('Access-Control-Allow-Headers', 'X-Access-Token,content-type');
    next();
});

// Maintain list of websocket clients
var wsclients = [];

// Format of timestamps sent to websocket clients
var wsdateformat = 'YYYY-MM-DDTHH:mm:ssZ';
// Format of timestamps in MySQL queries
var sqldateformat = 'YYYY-MM-DD HH:mm:ss';

// Utility function to construct an error response
function error_response(response, status, message){
    if(response){
        response.status(status);
        response.json({message: message, status: status, success: false});
        response.end();
    }
}

// Utility function to create and return a session for the given user
function create_session(username, ip_address, callback){
    var session_id = uuid.v1();
    var timestamp = moment().utc().format(sqldateformat);
    sql.query(
        sql.format(
            'replace into sessions (username, ip_address, session_id, timestamp, last_active) ' +
            'values(?, ?, ?, ?, ?)', [
                username, ip_address, session_id, timestamp, timestamp
            ]
        ),
        function(error, results, fields){
            if(error) throw error;
            else callback(session_id);
        }
    );
}

// Utility function to get a password hash
function get_password_hash(password, callback){
    bcrypt.hash(password, 10, function(error, password_hash){
        if(error) throw error;
        else callback(password_hash);
    });
}

// Utility function to get a session ID given a request
function get_request_session(request){
    return request.body.session_id || request.headers['x-access-token'];
}

// Utility function to get a valid session
// Returns a session object when this session is valid for this IP address,
// returns null otherwise.
// Updates the session object's `last_active` attribute upon retrieval.
function get_valid_session(session_id, ip_address, callbacks){
    sql.query(
        sql.format(
            'select * from sessions where session_id = ? and ' +
            'ip_address = ? and last_active >= ? and logged_out = 0', [
                session_id, ip_address,
                moment().utc().subtract(30, 'minutes').format(sqldateformat)
            ]
        ),
        function(error, results, fields){
            if(!error && results.length == 1){
                sql.query(
                    sql.format(
                        'update sessions set last_active = ? where session_id = ?', [
                            moment.utc().format(sqldateformat), session_id
                        ]
                    )
                );
                callbacks.success(results[0]);
            }else{
                callbacks.failure();
            }
        }
    );
}

// Utility function to validate a session
// Returns the session if the information is valid, null otherwise.
// Sets an error reponse on the response object if the session was not valid.
function with_valid_session(request, response, callback){
    get_valid_session(get_request_session(request), request.ip, {
        success: function(session){
            callback(session);
        },
        failure: function(){ // TODO: status code
            error_response(response, 400, "Authentication error.");
        }
    });
}

// Endpoint to register a new user
// Body must contain:
//  username: Name of user account to register
//  password: Password for this user's account
// Successful response will contain:
//  session_id: A valid auth session ID
webapp.post('/register', bodyparser.json(), function(request, response){
    if(request.body.password.length < 6){
        error_response(response, 400, "Password must be at least 6 characters.");
    }else{
        get_password_hash(request.body.password, function(password_hash){
            sql.query(
                sql.format(
                    'insert into users (username, password_hash) values(?, ?)', [
                        request.body.username, password_hash
                    ]
                ),
                function(error, results, fields){
                    if(error){
                        error_response(response, 400, "Username already taken.");
                    }else{
                        create_session(request.body.username, request.ip, function(session_id){
                            console.log('Registered user ' + request.body.username + '.');
                            response.json({
                                session_id: session_id,
                                success: true
                            });
                        });
                    }
                }
            );
        });
    }
});

// Endpoint to log in as a user
// Body must contain:
//  username: Name of user account to log in as
//  password: Password for this user's account
// Successful response will contain:
//  session_id: A valid auth session ID
webapp.post('/login', bodyparser.json(), function(request, response){
    function verify_hash(password_hash){
        bcrypt.compare(
            request.body.password, password_hash, function(error, result){
                if(error || !result){ // TODO: status code
                    error_response(response, 400, "Incorrect username or password.");
                }else{
                    create_session(request.body.username, request.ip, function(session_id){
                        console.log('User ' + request.body.username + ' logged in.');
                        response.json({
                            session_id: session_id,
                            success: true
                        });
                    });
                }
            }
        );
    }
    sql.query(
        sql.format(
            'select password_hash from users where username = ?', [
                request.body.username
            ]
        ),
        function(error, results, fields){
            if(error || results.length != 1){ // TODO: status code
                error_response(response, 400, "Incorrect username or password.");
            }else{
                verify_hash(results[0].password_hash);
            }
        }
    );
});

// Endpoint to log out
// Body must contain:
//  session_id: A valid auth session ID
webapp.post('/logout', bodyparser.json(), function(request, response){
    with_valid_session(request, response, function(session){
        sql.query(
            sql.format(
                'update sessions set logged_out = 1 where session_id = ?', [
                    session.session_id
                ]
            ),
            function(error, results, fields){
                response.json({ // TODO: is error handling needed here?
                    success: true
                });
            }
        );
    });
});

// Utility function used to enforce message rate limits
// Restrict a session to 4 messages per 10 seconds
function post_rate_limited_message(session, response, post_callback){
    sql.query(
        sql.format(
            'select timestamp from messages where author_username = ? and ' +
            'timestamp >= ? order by timestamp desc limit 4', [
                session.username,
                moment.utc().subtract(10, 'seconds').format(sqldateformat)
            ]
        ),
        function(error, results, fields){
            if(error || results.length >= 4){
                error_response(response, 400, "Message rate limit exceeded.");
            }else{
                post_callback();
            }
        }
    );
}

// Broadcast a posted message to websocket clients
// Additionally removes clients from the list that have not
// communicated with the server in the last several minutes.
function broadcast_message(session, message_content, target_data, timestamp){
    var old_clients = [];
    var current_time = moment().utc();
    for(var i = 0; i < wsclients.length; i++){
        var wsclient = wsclients[i];
        if(current_time.diff(wsclient.last_acknowledged, 'minutes') < 4){
            if(target_data.type == 'channel'){
                if(wsclient.subscriptions.indexOf(target_data.name) >= 0){
                    wsclient.connection.send(JSON.stringify({
                        type: 'channel_message',
                        channel_name: target_data.name,
                        author_username: session.username,
                        content: message_content,
                        timestamp: timestamp
                    }));
                }
            }else if(wsclient.username == target_data.name || wsclient.username == session.username){
                wsclient.connection.send(JSON.stringify({
                    type: 'private_message',
                    author_username: session.username,
                    recipient_username: target_data.name,
                    content: message_content,
                    timestamp: timestamp
                }));
            }
        }else{
            old_clients.push(i);
        }
    }
    for(var j = old_clients.length - 1; j >= 0; j--){
        console.log('Dropping unresponsive client ' + wsclents[old_clients[j]].username + '.');
        wsclents[old_clients[j]].close();
        wsclients.splice(old_clients[j], 1);
    }
}

// Post a message to a channel or a user
function post_message(session, response, message_content, target_data){
    post_rate_limited_message(session, response, function(){
        var target_col = target_data.type == 'channel' ? 'channel_name' : 'private_username';
        var timestamp = moment().utc().format(sqldateformat);
        sql.query(
            sql.format(
                'insert into messages(author_username, session_id, ' + target_col + ', ' +
                'target, content, timestamp) values(?, ?, ?, ?, ?, ?)', [
                    session.username, session.session_id, target_data.name,
                    target_data.type, message_content, timestamp
                ]
            ),
            function(error, results, fields){
                if(error){ // TODO: status code (note case of dup entry because of high rate)
                    error_response(response, 400, "Failed to post message.");
                }else{
                    if(response) response.json({success: true});
                    broadcast_message(session, message_content, target_data, timestamp);
                }
            }
        );
    });
}

// Endpoint to post a message
// Body must contain:
//  session_id: A valid auth session ID
//  content: Content of message to send
//  channel OR username: Name of channel/user to send message to
webapp.post('/message', bodyparser.json(), function(request, response){
    with_valid_session(request, response, function(session){
        if(request.body.channel){
            post_message(session, response, request.body.content, {
                name: request.body.channel,
                type: 'channel'
            });
        }else if(request.body.username){
            post_message(session, response, request.body.content, {
                name: request.body.username,
                type: 'private'
            });
        }else{
            error_response(response, 400, "No message destination given.");
        }
    });
});

// Utility function for retrieving messages
function retrieve_pagination_params(request, max_limit){
    var offset = request.body.offset || 0;
    var limit = max_limit;
    if(request.body.limit) limit = request.body.limit < limit ? request.body.limit : limit;
    return {
        offset: offset,
        limit: limit,
        query: function(){
            return sql.format('limit ? offset ?', [this.limit, this.offset]);
        }
    }
}

// Endpoint to retrieve recent messages from a channel
// Body must contain:
//  channel: Name of channel to retrieve messages from
// Body may contain:
//  offset: Offset of messages to retrieve (for pagination)
//  limit: Limit of messages to retrieve (for pagination) max 50
// Successful response will contain:
//  channel: Name of channel messages were retrieved from
//  messages: An array of messages with the attributes:
//   timestamp: When the message was posted e.g. "2017-01-01T00:00:00.000Z"
//   author_username: The name of the user who posted the message
//   content: The text content of the posted message
webapp.post('/channel', bodyparser.json(), function(request, response){
    sql.query(
        sql.format(
            'select timestamp, author_username, content from messages where ' +
            'channel_name = ? and target = "channel" order by timestamp desc ' +
            retrieve_pagination_params(request, 50).query(), [
                request.body.channel
            ]
        ),
        function(error, results, fields){
            if(error){ // TODO: status code
                error_response(response, 400, "Failed to retrieve messages.");
            }else{
                response.json({
                    channel: request.body.channel,
                    messages: results,
                    success: true
                });
            }
        }
    );
});

// Endpoint to retrieve recent messages from a private conversation
// Body must contain:
//  session_id: A valid auth session ID
//  username: Name of author to retrieve private messages from
// Body may contain:
//  offset: Offset of messages to retrieve (for pagination)
//  limit: Limit of messages to retrieve (for pagination) max 50
// Successful response will contain:
//  username: Name of user messages were retrieved from
//  messages: An array of messages with the attributes:
//   timestamp: When the message was posted e.g. "2017-01-01T00:00:00.000Z"
//   author_username: The name of the user who posted the message
//   content: The text content of the posted message
webapp.post('/private', bodyparser.json(), function(request, response){
    with_valid_session(request, response, function(session){
        sql.query(
            sql.format(
                'select timestamp, author_username, content from messages where ' +
                '(author_username = ? and private_username = ?) or ' +
                '(author_username = ? and private_username = ?) and ' +
                'target = "private" order by timestamp desc ' +
                retrieve_pagination_params(request, 50).query(), [
                    request.body.username, session.username,
                    session.username, request.body.username
                ]
            ),
            function(error, results, fields){
                if(error){ // TODO: status code
                    error_response(response, 400, "Failed to retrieve messages.");
                }else{
                    response.json({
                        username: request.body.username,
                        messages: results,
                        success: true
                    });
                }
            }
        );
    });
});

// Endpoint to search the text content of messages
// Body must contain:
//  session_id: A valid auth session ID
//  channel_names AND/OR private_usernames: Channels and/or PM conversations to search
//  search_string: Case-insensitive search term
// Body may contain:
//  offset: Offset of messages to retrieve (for pagination)
//  limit: Limit of messages to retrieve (for pagination) max 50
// Successful response will contain:
//  search_string: The case-insensitive search term
//  username: Name of user messages were retrieved from
//  messages: An array of messages with the attributes:
//   timestamp: When the message was posted e.g. "2017-01-01T00:00:00.000Z"
//   target: Either "channel" or "private"
//   channel_name: The channel the message was publicly posted to (if any)
//   private_username: The username the message was privately posted to (if any)
//   author_username: The name of the user who posted the message
//   content: The text content of the posted message
webapp.post('/search', bodyparser.json(), function(request, response){
    with_valid_session(request, response, function(session){
        var channel_constraint = '';
        if(request.body.channel_names){
            channel_constraint = sql.format(
                '(target = "channel" and channel_name in (?))', [
                    request.body.channel_names
                ]
            );
        }
        var private_constraint = '';
        if(request.body.private_usernames){
            private_constraint = sql.format(
                '(target = "private" and (' +
                    '(private_username = ? and author_username in (?)) or ' +
                    '(author_username = ? and private_username in (?))' +
                '))', [
                    session.username, request.body.private_usernames,
                    session.username, request.body.private_usernames
                ]
            );
        }
        if(request.body.search_string && (channel_constraint || private_constraint)){
            var constraint = '';
            if(channel_constraint && private_constraint){
                constraint = '(' + channel_constraint + ') or (' + private_constraint + ')';
            }else{
                constraint = channel_constraint || private_constraint;
            }
            sql.query(
                sql.format(
                    'select timestamp, channel_name, private_username, target, ' +
                    'author_username, content from messages where ' +
                    'content like ? and ' + constraint + ' order by timestamp desc ' +
                    retrieve_pagination_params(request, 50).query(), [
                        '%' + request.body.search_string + '%'
                    ]
                ),
                function(error, results, fields){
                    if(error){ // TODO: status code
                        console.log(error);
                        error_response(response, 400, "Failed to retrieve messages.");
                    }else{
                        response.json({
                            search_string: request.body.search_string,
                            messages: results,
                            success: true
                        });
                    }
                }
            );
        }else{
            error_response(response, 400, "Incorrect search parameters.");
        }
    });
});

// Websocket endpoint
var websocket_client_id = 0;
webapp.ws('/live', function(websocket, request){
    var this_client_id = websocket_client_id++;
    
    websocket.on('message', function(message){
        try{
            // console.log('Received message: ' + message);
            var json = JSON.parse(message);
        }catch(e){
            return; // Invalid json
        }
        // Message must indicate originating session
        if(!json.session_id) return;
        // Check if client is already known by the server
        var wsclient = null;
        for(var i = 0; i < wsclients.length; i++){
            if(json.session_id == wsclients[i].session_id){
                wsclient = wsclients[i];
                if(request.ip != wsclient.ip_address) return;
                break;
            }
        }
        // Client not yet known? Verify user and add to list
        if(!wsclient){
            console.log('Unknown client.');
            if(json.type == 'connect'){
                get_valid_session(json.session_id, request.ip, {
                    failure: function(){
                        console.log('Session not valid.');
                    },
                    success: function(session){
                        console.log('Accepted new socket client with username ' + session.username);
                        wsclients.push({
                            identifier: this_client_id,
                            connection: websocket,
                            ip_address: request.ip,
                            session_id: session.session_id,
                            username: session.username,
                            subscriptions: json.subscriptions || [],
                            last_acknowledged: moment().utc()
                        });
                        websocket.send(JSON.stringify({
                            type: 'connection_successful'
                        }));
                        console.log('Total clients: ' + wsclients.length);
                    }
                });
            }
        }
        // Request to change channel subscriptions
        else if(json.type == 'subscribe'){
            console.log('Handling subscription request from ' + wsclient.username + '.');
            wsclient.subscriptions == json.subscriptions || [];
            wsclient.last_acknowledged = moment().utc();
        }
        // Request to post a message
        else if(json.type == 'post_message'){
            if(json.to_channel){
                console.log('Message posted by ' + wsclient.username + ' to channel ' + json.to_channel + '.');
                wsclient.last_acknowledged = moment().utc();
                post_message(wsclient, null, json.content, {
                    name: json.to_channel,
                    type: 'channel'
                });
            }else if(json.to_username){
                console.log('Message posted by ' + wsclient.username + ' to user ' + json.to_username + '.');
                wsclient.last_acknowledged = moment().utc();
                post_message(wsclient, null, json.content, {
                    name: json.to_username,
                    type: 'private'
                });
            }
        }
        // Request to keep connection alive
        else if(json.type == 'heartbeat'){
            console.log('Acknowledging heartbeat for user ' + wsclient.username + '.');
            wsclient.last_acknowledged = moment().utc();
        }
    });
    
    websocket.on('close', function(connection){
        console.log('User disconnected.');
        for(var i = 0; i < wsclients.length; i++){
            if(wsclients[i].identifier == this_client_id){
                wsclients.splice(i, 1);
                break;
            }
        }
    });
});

module.exports = webapp;
