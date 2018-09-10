/* globals process, require, module */
const config = require('./config.webgme');
const validateConfig = require('webgme/config/validator');

// This is only for testing - it will persist everything inside the containers.

config.plugin.allowServerExecution = true;
config.mongo.uri = 'mongodb://mongo:27017/webgme_icore';
config.server.workerManager.path = 'webgme-docker-worker-manager';

config.server.workerManager.options = {
    webgmeUrl: 'http://webgme-server:' + config.server.port,
    image: 'icore_py-core-executor',
    maxRunningContainers: 10,
    createParams: {
        HostConfig: {
            Memory: 536870912,
            NetworkMode: 'icore_workers'
        }
    }
};


validateConfig(config);
module.exports = config;
