# nodechat

This is a simple implementation of a chat server using nodejs.

## Setup

To set up mysql, run `mysql -u root < setupdb.sql` where `setupdb.sql` is the
script located in this repository's root directory.
This will create the `nodechat` database and its constituent tables, and the
`nodechatuser` user with the password `password`.
You could then access the database by running
`mysql -u nodechatuser -ppassword -D nodechat`.

To install node dependencies, run `npm install`.

## Usage

To run the server, `node server.js --port 8080`.

To run the client, open `client.html` in a browser.
The client operates within the browser console.
(Chrome recommended, on the basis that it's the only browser I've actually
tested with.)

To reassign the host from the default `http://127.0.0.1:8080`,
`host = 'http://somehost:1234`.

To register a user, `register("username", "password")`.

To log in as a user, `login("username", "password")`.

To log out, `logout()`.

To connect to the websocket server and receive live updates, `connect()`.

To disconnect from the websocket server, `disconnect()`.

To post a message to a channel, `postchannel("channel", "message")`.

To post a message to a user, `postprivate("username", "message")`.

For example:

``` text
> login('testuser', 'password');
client.js:66 Successfully logged in as user testuser.
> connect();
client.js:122 Connecting to websocket server.
client.js:138 Successfully connected to websocket server.
> postchannel('home', 'hello!');
client.js:140 #home testuser: hello!
> disconnect();
client.js:161 Disconnected from websocket server.
> logout();
```

## API

These are the endpoints implemented by the server:

- `/register`

Register a user.
Body must contain `username` and `password`.
Username must not already exist.
Password must be at least 6 characters long.
When successful, the response contains a `session_id` to be used for authentication.

- `/login`

Login as a user.
Body must contain `username` and `password`.
When successful, the response contains a `session_id` to be used for authentication.

- `/logout`

Log out of a session.
Either the body must contain a `session_id` or the headers an `X-Access-Token`
representing a valid session ID acquired at registration or login.

- `/live`

Here is where the websocket server listens. Its protocol is described in
the next section.

- `/message`

Post a message.
Either the body must contain a `session_id` or the headers an `X-Access-Token`
representing a valid session ID acquired at registration or login.
Body must contain either `channel` or `username`, the former indicating the
name of a public channel to post to or a user to privately message.
Body must contain `content` indicating text content of the message to post.

- `/channel`

Retrieve messages from a public channel.
Body must contain `channel`, representing the name of the channel to retrieve
messages from.
Body may contain `limit` and/or `offset` to control pagination.
`limit` is clamped at a maximum of 50 messages.

- `/private`

Retrieve private messages sent to the current user.
Either the body must contain a `session_id` or the headers an `X-Access-Token`
representing a valid session ID acquired at registration or login.
Body must contain `username`, representing the name of the user to retrieve
private messages sent to and received from.
Body may contain `limit` and/or `offset` to control pagination.
`limit` is clamped at a maximum of 50 messages.

- `/search`

Retrieve messages from channels or private conversations using a 
case-insensitive search term.
Either the body must contain a `session_id` or the headers an `X-Access-Token`
representing a valid session ID acquired at registration or login.
Body must contain `search_string`, indicating the term to search for.
Body must contain `channel_names` and/or `private_usernames`, which are
arrays indicating channels and private conversations to search in.
Body may contain `limit` and/or `offset` to control pagination.
`limit` is clamped at a maximum of 50 messages.

## Websocket server protocol

Every message sent to or from the socket server must be a valid JSON string
representing an object with at least a `type` attribute.
The `type` attribute decides purpose and behavior.

To connect and subscribe to new messages, the client must send a JSON string
with `type: "connect"` and with a `session_id` attribute, where `session_id`
is a valid auth session ID acquired at registration or login.
The object may contain a `subscriptions` attribute, which must be a list of public
channels to subscribe to. (These are the channels for which messages will be
reported live to the client by the server via the socket connection.)

When a successful connection has occurred, the server must respond with the
JSON `{"type":"connection_successful"}` to inform the client.
When connection is not successful, the client will not message the user.

If the client does not send a `type: "heartbeat"` message to the server with
its `session_id` included every four minutes then the server may terminate the
connection.

The client may send the server a `type: "subscribe"` message.
It must include a `session_id` attribute and a `subscriptions` attribute.
`subscriptions` must be a list of public channels to subscribe to.

The client may send the server a `type: "post_message"` message.
It must include a `session_id` attribute.
It must contain either a `to_channel` or `to_username` attribute defining what
channel to post a public message to or which user to post a private message to,
respectively.
It must contain a `content` attribute, defining the text content of the message
to be posted.

When a message is posted to the server, that message will be broadcasted to
all relevant clients.
In the case of a message on a public channel, relevant clients include those
which have subscribed to tha channel.
In the case of a private message, relevant clients include only the sender and
the recipient.

In the case of the message being posted to a channel, it must be of
`type: "channel_message"`. It must have a `channel_name` attribute indicating
what channel the message was posted to.
In the case of the message being private, it must be of `type: "private_message"`
and it must have a `recipient_username` attribute indicating the username of
the user to whom the message was sent.

In either case, the message must include an `author_username` attribute
indicating the username of the message author.
It must include a `timestamp` attribute, describing when the message was
recognized by the server.
It must lastly include a `content` attribute, which represents the textual
content of the posted message.
