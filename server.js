"use strict";

console.log('Hello, world!');

// Handled command line arguments:
// --port (default 8080) is the port to listen on
var options = require('minimist')(process.argv.slice(2));
var port = options.port || 8080;

var sql = require('./mysql');
var webapp = require('./webapp');

// Websocket endpoint
var expressws = require('express-ws')(webapp);
webapp.ws('/live', function(websocket, request){
    websocket.on('message', function(message){
        console.log('Received a message! ', message);
    });
});

// Start server
webapp.listen(port, function(){
    console.log('Now listening on port ' + port + '.');
});
