/* globals process, require, module */
const config = require('./config.webgme');
const validateConfig = require('webgme/config/validator');

// This is only for testing - it will persist everything inside the containers.

config.plugin.allowServerExecution = true;
config.mongo.uri = 'mongodb://' + process.env.MONGO_PORT_27017_TCP_ADDR + ':' + process.env.MONGO_PORT_27017_TCP_PORT + '/webgme-icore';


validateConfig(config);
module.exports = config;