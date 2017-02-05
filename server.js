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

// Implements endpoints
var webapp = require('./webapp');

// Initialize http server
// var httpserver = http.createServer(function(request, response){});
// httpserver.on('request', webapp); // http://stackoverflow.com/a/34838031/3478907

// Initialize websocket server
// var socketserver = new websocket.server({httpServer: httpserver});
 
// Handle connections to websocket server
// socketserver.on('request', function(request){
//     console.log('Connection request received from ' + request.origin + '.');
// });

// Start server
webapp.listen(port, function(){
    console.log('Now listening on port ' + port + '.');
});
// httpserver.listen(port, function(){
//     console.log('Now listening on port ' + port + '.');
// });
