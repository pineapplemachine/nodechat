"use strict";

console.log('Hello, world!');

// Handled command line arguments:
// --port (default 8080) is the port to listen on
var options = require('minimist')(process.argv.slice(2));
var port = options.port || 8080;

var http = require('http');
var express = require('express');
var bodyparser = require('body-parser');
var websocket = require('websocket');
var mysql = require('mysql');
var bcrypt = require('bcrypt');
var moment = require('moment');
var uuid = require('node-uuid');

// Initialize webapp for handling API endpoints
var webapp = express();
webapp.use(bodyparser.urlencoded({extended: false}));
webapp.use(bodyparser.json());
webapp.enable('trust proxy'); // http://stackoverflow.com/a/14631683/3478907

// Initialize http server
// TODO: ??
// var httpserver = http.createServer(function(request, response){});
// httpserver.listen(port, function(){
//     console.log('Now listening on port ' + port + '.');
// });

// Initialize websocket server
// var socketserver = new websocket.server({httpServer: httpserver});
 
// Initialize mysql connection
var sqlconnection = mysql.createConnection({ // TODO: use a pool instead
    host: 'localhost',
    user: 'nodechatuser',
    password: 'password',
    database: 'nodechat'
});
sqlconnection.connect();

// Utility function to construct an error response
function error_response(response, status, message){
    response.status(status);
    response.json({message: message, status: status, success: false});
    response.end();
}

// Utility function to create and return a session for the given user
// Returns the session ID
function create_session(username, ip_address){
    var session_id = uuid.v1();
    sqlconnection.query(
        // Assume it's better to overwrite another session than to fail
        // acquiring one, hence `replace` instead of `insert`.
        'replace into sessions (username, ip_address, session_id) values(' +
            sqlconnection.escape(username) + ', ' +
            sqlconnection.escape(ip_address) + ', ' +
            sqlconnection.escape(session_id) +
        ')',
        function(error, results, fields){
            if(error) throw error;
        }
    );
    return session_id;
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
// TODO: session expiration by time (not just logout)
function get_valid_session(session_id, ip_address, callbacks){
    sqlconnection.query(
        'select * from sessions where ' +
            'session_id = ' + sqlconnection.escape(session_id) + ' and ' +
            'ip_address = ' + sqlconnection.escape(ip_address) + ' and ' +
            'expired = 0',
        function(error, results, fields){
            if(!error && results.length == 1) callbacks.success(results[0]);
            else callbacks.failure();
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
webapp.post('/register', bodyparser.json(), function(request, response){
    if(request.body.password.length < 6){
        error_response(response, 400, "Password must be at least 6 characters.");
    }else{
        get_password_hash(request.body.password, function(password_hash){
            sqlconnection.query(
                'insert into users (username, password_hash) values(' +
                    sqlconnection.escape(request.body.username) + ', ' +
                    sqlconnection.escape(password_hash) +
                ')',
                function(error, results, fields){
                    if(error){
                        error_response(response, 400, "Username already taken.");
                    }else{
                        response.json({
                            session_id: create_session(request.body.username, request.ip),
                            success: true
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
                    response.json({
                        session_id: create_session(request.body.username, request.ip),
                        success: true
                    });
                }
            }
        );
    }
    sqlconnection.query(
        'select password_hash from users where ' +
            'username = ' + sqlconnection.escape(request.body.username),
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
        sqlconnection.query(
            'update sessions set expired = 1 where ' +
                'session_id = ' + sqlconnection.escape(session.session_id),
            function(error, results, fields){
                response.json({ // TODO: is error handling needed here?
                    success: true
                });
            }
        );
    });
});

// Utility function used to enforce message rate limits
function post_rate_limited_message(session, response, post_callback){
    sqlconnection.query(
        'select timestamp from messages where ' +
            'author_username = ' + sqlconnection.escape(session.username) +
            'order by timestamp desc limit 1 offset 4',
        function(error, results, fields){
            if(error || (results.length > 0 && moment().utc().diff(results[0], 'seconds') < 10)){
                error_response(response, 400, "Message rate limit exceeded.");
            }else{
                post_callback();
            }
        }
    );
}

// Post a message to a channel or a user
function post_message(session, response, message_content, target_data){
    post_rate_limited_message(session, response, function(){
        var target_col = target_data.type == 'channel' ? 'channel_name' : 'private_username';
        sqlconnection.query(
            'insert into messages (author_username, session_id, ' + target_col + ', target, content) values(' +
                sqlconnection.escape(session.username) + ', ' +
                sqlconnection.escape(session.session_id) + ', ' +
                sqlconnection.escape(target_data.name) + ', ' +
                sqlconnection.escape(target_data.type) + ', ' +
                sqlconnection.escape(message_content) +
            ')',
            function(error, results, fields){
                if(error){ // TODO: status code (note case of dup entry because of high rate)
                    error_response(response, 400, "Failed to post message.");
                }else{
                    response.json({
                        success: true
                    });
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
            return (
                'limit ' + sqlconnection.escape(this.limit) + ' ' +
                'offset ' + sqlconnection.escape(this.offset)
            );
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
    console.log('select timestamp, author_username, content from messages where ' +
            'channel_name = ' + sqlconnection.escape(request.body.channel) + ' and ' +
            'target = "channel" order by timestamp desc ' +
            retrieve_pagination_params(request).query());
    sqlconnection.query(
        'select timestamp, author_username, content from messages where ' +
            'channel_name = ' + sqlconnection.escape(request.body.channel) + ' and ' +
            'target = "channel" order by timestamp desc ' +
            retrieve_pagination_params(request, 50).query(),
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
        sqlconnection.query(
            'select timestamp, author_username, content from messages where ' +
                '(' +
                    'author_username = ' + sqlconnection.escape(request.body.username) + ' and ' +
                    'private_username = ' + sqlconnection.escape(session.username) +
                ') or ( ' +
                    'author_username = ' + sqlconnection.escape(session.username) + ' and ' +
                    'private_username = ' + sqlconnection.escape(request.body.username) +
                ') and ' +
                'target = "private" order by timestamp desc ' +
                retrieve_pagination_params(request, 50).query(),
            function(error, results, fields){
                if(error){ // TODO: status code
                    console.log(error);
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

// Handle connections to websocket server
// socketserver.on('request', function(request){
//     console.log('Connection request received from ' + request.origin + '.');
// });

// Start server
webapp.listen(port, function(){
    console.log('Now listening on port ' + port + '.');
});

// Fin
process.on('exit', function(){
    console.log('Goodbye!');
    sqlconnection.end();
});
