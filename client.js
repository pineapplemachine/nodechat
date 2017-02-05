$(document).ready(function(){
    "use strict";

    var host = '127.0.0.1:8080';
    
    window.WebSocket = window.WebSocket || window.MozWebSocket;
    
    // Websocket server connection
    var connection = null;
    // User info
    var username = null;
    var session_id = null;
    // Subscribed channels
    var subscriptions = ['home'];
    
    // Send heartbeat to websocket server (when connected)
    setInterval(function(){
        if(connection){
            try{
                console.log('Sending heartbeat to server.');
                connection.send(JSON.stringify({
                    type: 'heartbeat',
                    username: username,
                    session_id: session_id
                }));
            }catch(e){
                connection = null;
            }
        }
    }, 60000);
    
    // Register a user
    window.register = function(as_username, password){
        $.ajax({
            type: 'POST',
            url: 'http://' + host + '/register',
            dataType: 'json',
            data: {
                username: as_username,
                password: password
            },
            error: function(xhr, status, error){
                console.log('Failed to register user ' + as_username + ': ' + error);
            },
            success: function(data){
                console.log('Successfully registered user ' + as_username + '.');
                username = as_username;
                session_id = data.session_id;
            },
        });
    }
    
    // Log in as a user
    window.login = function(as_username, password){
        $.ajax({
            type: 'POST',
            url: 'http://' + host + '/login',
            dataType: 'json',
            data: {
                username: as_username,
                password: password
            },
            error: function(xhr, status, error){
                console.log('Failed to login as user ' + as_username + ': ' + error);
            },
            success: function(data){
                console.log('Successfully logged in as user ' + as_username + '.');
                username = as_username;
                session_id = data.session_id;
            },
        });
    }
    
    // Log out of active session
    window.logout = function(as_username, password){
        $.ajax({
            type: 'POST',
            url: 'http://' + host + '/logout',
            dataType: 'json',
            data: {
                session_id: session_id,
            },
            success: function(data){
                username = null;
                session_id = null;
            },
        });
    }
    
    // Subscribe to a channel
    window.subscribe = function(channel){
        if(subscriptions.indexOf(channel) < 0){
            subscriptions.push(channel);
            if(connection){
                connection.send(JSON.stringify({
                    type: 'subscribe',
                    username: username,
                    session_id: session_id,
                    subscriptions: subscriptions
                }));
            }
        }
    }
    // Unsubscribe from a channel
    window.unsubscribe = function(channel){
        var index = subscriptions.indexOf(channel);
        if(index >= 0){
            subscriptions.splice(index, 1);
            if(connection){
                connection.send(JSON.stringify({
                    type: 'subscribe',
                    username: username,
                    session_id: session_id,
                    subscriptions: subscriptions
                }));
            }
        }
    }
    
    // Connect to the websocket server
    window.connect = function(){
        connection = new WebSocket('ws://' + host + '/live');
    
        connection.onopen = function(){
            console.log('Connecting to websocket server.');
            connection.send(JSON.stringify({
                'type': 'connect',
                'session_id': session_id,
                'username': username,
                'subscriptions': subscriptions
            }));
        }
        
        connection.onmessage = function(message){
            try{
                // console.log('Received message: ' + message.data);
                var json = JSON.parse(message.data);
            }catch(e){
                return; // Invalid json
            }
            if(json.type == 'connection_successful'){
                console.log('Successfully connected to websocket server.');
            }else if(json.type == 'channel_message'){
                console.log(
                    '#' + json.channel_name + ' ' + json.author_username + ': ' +
                    json.message_content
                );
            }else if(json.type == 'private_message'){
                if(json.author_username == username){
                    console.log(
                        'Sent PM to ' + json.recipient_username + ': ' +
                        json.message_content
                    );
                }else{
                    console.log(
                        'Received PM from ' + json.author_username + ': ' +
                        json.message_content
                    );
                }
            }
        }
    }
    
    // Disconnect from the websocket server
    window.disconnect = function(){
        connection.close();
        connection = null;
        console.log('Disconnected from websocket server.');
    }
    
    // Post a public message to a channel
    window.postchannel = function(channel_name, message_content){
        if(connection){
            connection.send(JSON.stringify({
                type: 'post_message',
                username: username,
                session_id: session_id,
                to_channel: channel_name,
                content: message_content
            }));
        }else{
            $.ajax({
                type: 'POST',
                url: 'http://' + host + '/message',
                dataType: 'json',
                data: {
                    session_id: session_id,
                    channel: channel_name,
                    content: message_content
                },
                error: function(xhr, status, error){
                    console.log('Failed to post message.');
                },
                success: function(data){
                    console.log('Successfully posted message.');
                },
            });
        }
    }
    
    // Post a private message to a user
    window.postprivate = function(to_username, message_content){
        if(connection){
            connection.send(JSON.stringify({
                type: 'post_message',
                username: username,
                session_id: session_id,
                to_username: to_username,
                content: message_content
            }));
        }else{
            $.ajax({
                type: 'POST',
                url: 'http://' + host + '/message',
                dataType: 'json',
                data: {
                    session_id: session_id,
                    username: to_username,
                    content: message_content
                },
                error: function(xhr, status, error){
                    console.log('Failed to post message.');
                },
                success: function(data){
                    console.log('Successfully posted message.');
                },
            });
        }
    }
});
