/* globals process, require, module */
const config = require('./config.webgme');
const validateConfig = require('webgme/config/validator');

// This is only for testing - it will persist everything inside the containers.

config.plugin.allowServerExecution = true;
config.mongo.uri = 'mongodb://' + process.env.MONGO_IP + ':27017/webgme_icore';
config.server.workerManager.path = 'webgme-docker-worker-manager';

config.server.workerManager.options = {
    webgmeUrl: 'http://' + process.env.WEBGME_IP + ':' + config.server.port,
    image: 'icore_py-core-executor',
    maxRunningContainers: 10,
    createParams: {
        HostConfig: {
            Memory: 536870912
        }
    }
};


validateConfig(config);
module.exports = config;