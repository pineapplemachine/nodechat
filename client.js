$(document).ready(function(){
    "use strict";

    var host = '127.0.0.1:8080';

    window.WebSocket = window.WebSocket || window.MozWebSocket;

    var connection = new WebSocket('ws://' + host + '/live');
    
    connection.onopen = function(){
        connection.send('this is a test!!');
    }
    
    connection.onmessage = function(message){
        try{
            var json = JSON.parse(message.data);
        }catch(e){
            return; // Invalid json
        }
    }
});
