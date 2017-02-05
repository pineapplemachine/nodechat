var mysql = require("mysql");
var punycode = require("punycode");

// Initialize mysql connection
var sqlpool = mysql.createPool({
    host: 'localhost',
    user: 'nodechatuser',
    password: 'password',
    database: 'nodechat'
});

// Evaluate a callback after acquiring a MySQL connection
function with_sql_connection(callback){
    sqlpool.getConnection(function(error, connection){
        if(error) throw error;
        callback(connection);
        connection.release();
    });
}

// Evaluate a callback with the results from a MySQL query
function sql_query(query, callback){
    with_sql_connection(function(connection){
        connection.query(query, callback);
    });
}

// Format a query string with query parameters
// Substitutes occurrences of '?' in the query string with parameters.
// TODO: Please tell me this isn't the accepted way to handle unicode
function sql_format(query_string, parameters){
    var result = '';
    var parameter_index = 0;
    var decoded = punycode.ucs2.decode(query_string);
    for(var i = 0; i < decoded.length; i++){
        var char = punycode.ucs2.encode([decoded[i]]);
        if(char == '?' && parameter_index < parameters.length){
            result += mysql.escape(parameters[parameter_index++]);
        }else{
            result += char;
        }
    }
    console.log('Formatted mysql query: ' + result);
    return result;
}

// Close connections in pool upon process exit
process.on('exit', function(){
    sqlpool.end();
});

module.exports = {
    pool: sqlpool,
    with_connection: with_sql_connection,
    query: sql_query,
    format: sql_format,
    escape: mysql.escape
};
