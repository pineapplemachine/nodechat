$(document).ready(function(){
    "use strict";

    var host = '127.0.0.1:8080';

    window.WebSocket = window.WebSocket || window.MozWebSocket;

    var connection = new WebSocket('ws://' + host + '/live');
    
    connection.onopen = function(){
        connection.send(JSON.stringify({
            'type': 'connect',
            'session_id': '5a3b2170-ebc8-11e6-8ee3-91553ba0ee2f',
            'username': 'testuser2',
            'subscriptions': ['testchannel']
        }));
    }
    
    connection.onmessage = function(message){
        console.log('Received message: ' + message.data);
        try{
            var json = JSON.parse(message.data);
        }catch(e){
            return; // Invalid json
        }
    }
});
