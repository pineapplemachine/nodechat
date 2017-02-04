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

To run the server, `node server.js --port 8080`.

## Usage

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
