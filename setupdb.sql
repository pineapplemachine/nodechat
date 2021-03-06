create database if not exists nodechat;
grant all privileges on nodechat.* to 'nodechatuser'@'localhost' identified by 'password';

use nodechat;

drop table if exists `users`;
create table `users` (
    -- name and unique identifier for this user
    `username` varchar(255) not null,
    -- password hash
    `password_hash` varchar(255) not null,
    -- usernames must be unique
    primary key(`username`)
) engine=InnoDB default charset=utf8;

drop table if exists `sessions`;
create table `sessions` (
    -- unique identifier for this session
    `session_id` varchar(255) not null,
    -- the user this session belongs to
    `username` varchar(255) not null,
    -- the IP address this session belongs to
    `ip_address` varchar(255) not null,
    -- when this session was created
    `timestamp` timestamp not null default current_timestamp,
    -- whether the session was logged out of
    `logged_out` tinyint(1) not null default 0,
    -- when this session was last active
    `last_active` timestamp not null default current_timestamp,
    -- session ID strings must be unique
    primary key(`session_id`)
) engine=InnoDB default charset=utf8;

drop table if exists `messages`;
create table `messages` (
    -- username of message author
    `author_username` varchar(255) not null,
    -- indicate originating session
    `session_id` varchar(255) not null,
    -- when this message was sent
    `timestamp` timestamp not null default current_timestamp,
    -- whether the message was on a channel or private
    `target` enum('channel', 'private') not null,
    -- when target == channel, the channel the message was posted to
    `channel_name` varchar(255) default null,
    -- when target == private, the username the message was posted to
    `private_username` varchar(255) default null,
    -- the text content of the message
    `content` text not null default '',
    -- permits one message per session per second
    primary key(`session_id`, `timestamp`)
) engine=InnoDB default charset=utf8;
