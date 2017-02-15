/*globals define*/
/**
 * Evaluates the code from the widget and creates and calls a plugin
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'plugin/managerbase',
    'plugin/PluginBase',
    'plugin/PluginResult',
    'js/Dialogs/PluginResults/PluginResultsDialog',
    'blob/BlobClient'
], function (PluginManager, PluginBase, PluginResult, PluginResultsDialog, BlobClient) {
    'use strict';

    var PLUGIN_META_DATA = {
        id: 'ICore',
        name: 'ICore',
        version: '1.0.0',
        description: 'Plugin by ICore',
        icon: {
            src: '',
            class: 'fa fa-cogs'
        },
        disableServerSideExecution: false,
        disableBrowserSideExecution: false,
        writeAccessRequired: false,
        configStructure: []
    };

    function ICorePluginEvaluator() {

    }

    ICorePluginEvaluator.prototype.evaluateCode = function (callback) {
        var self = this,
            code = this._widget.getCode(),
            startTime = (new Date()).toISOString(),
            blobClient,
            plugin,
            pluginManager,
            context,
            logger;

        plugin = new PluginBase();

        try {
            eval('plugin.main = ' + code + ';');
        } catch (e) {
            callback(e);
            return;
        }

        if (typeof plugin.main !== 'function') {
            callback(new Error('Evaluated code does not define a function'));
            return;
        }

        plugin.pluginMetadata = PLUGIN_META_DATA;

        // initialize the plugin
        logger = {
            debug: function () {
                self._widget.addConsoleMessage('debug', Array.prototype.slice.call(arguments));
            },
            info: function () {
                self._widget.addConsoleMessage('info', Array.prototype.slice.call(arguments));
            },
            warn: function () {
                self._widget.addConsoleMessage('warn', Array.prototype.slice.call(arguments));
            },
            error: function () {
                self._widget.addConsoleMessage('error', Array.prototype.slice.call(arguments));
            }
        };

        blobClient = new BlobClient({logger: this._logger.fork('BlobClient')});

        plugin.initialize(logger, blobClient, this._client.gmeConfig);

        // configure the pluginManager and plugin.
        pluginManager = new PluginManager(blobClient, null, this._logger, this._client.gmeConfig);
        pluginManager.browserSide = true;
        pluginManager.notificationHandlers = [function (data, cb) {
            self._client.dispatchPluginNotification(data);
            cb(null);
        }];

        pluginManager.projectAccess = self._client.getProjectAccess();

        context = this._getPluginContext();

        pluginManager.configurePlugin(plugin, context.pluginConfig, context.managerConfig)
            .then(function () {
                plugin.main(function (err, pluginResult) {
                    var dialog,
                        resultError = 'this.result.success was false but no error given. ' +
                            'To indicate success invoke this.result.setSuccess(true)';
                    if (err) {
                        if (typeof err === 'string') {
                            err = new Error('[String was passed in callback, always resolve with Error] ' + err);
                        }

                        resultError = err.message;
                    }

                    if (pluginResult && pluginResult instanceof PluginResult) {
                        pluginResult.setFinishTime((new Date()).toISOString());
                        pluginResult.setStartTime(startTime);
                        pluginResult.setPluginName('ICore plugin');
                        pluginResult.setError(resultError);
                        dialog = new PluginResultsDialog();
                        dialog.show(self._client, [pluginResult]);
                    }

                    callback(err);
                });
            })
            .catch(callback);
    };

    ICorePluginEvaluator.prototype._getPluginContext = function () {
        var client = this._client;
        return {
            managerConfig: {
                project: client.getProjectObject(),
                branchName: client.getActiveBranchName(),
                commitHash: client.getActiveCommitHash(),
                activeNode: this._currentNodeId,
                activeSelection: [],
                namespace: ''
            },
            pluginConfig: null
        };
    };

    return ICorePluginEvaluator;
});