/*globals define, $*/
/*jshint browser: true*/
/**
 * Evaluates the code from the widget and creates and calls a plugin
 *
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'common/util/guid',
    'plugin/PluginResult',
    'js/Dialogs/PluginResults/PluginResultsDialog'
], function (GUID, PluginResult, PluginResultsDialog) {
    'use strict';

    function ICoreRunServerPlugin(iCoreControl) {
        this._results = [];
        this._controller = iCoreControl;
    }


    ICoreRunServerPlugin.prototype.runPlugin = function (callback) {
        let self = this,
            context = this._controller._client.getCurrentPluginContext('PyCoreExecutor'),
            msg = 'PyCoreExecutor',
            progress = 15,
            note;

        context.pluginConfig = {script: this._controller._widget.getCode()};
        note = $.notify({
                message: 'Python code running on server  ...',
                icon: 'glyphicon glyphicon-cog',
            },
            {
                showProgressbar: true,
                delay: 0,
                type: 'info',
                offset: {
                    x: 20,
                    y: 37
                }
            });

        note.update('progress', progress);
        const intervalId = setInterval(function () {
            if (progress < 50) {
                progress += 5;
            } else if (progress < 70) {
                progress += 2;
            } else if (progress < 90) {
                progress += 1;
            } else {
                progress = 10;
                note.update('type', 'warning');
            }

            note.update('progress', progress);
        }, 200);

        this._controller._client.runServerPlugin('PyCoreExecutor', context, function (err, result) {
            clearInterval(intervalId);
            callback();
            result = new PluginResult(result);
            result.__unread = true;
            result.__id = GUID();

            self._results.splice(0, 0, result);

            if (result.success) {
                msg += 'finished with success! (click for details)';
            } else {
                msg += 'failed (click here for details), error: ' + result.error;
            }

            note.update({
                message: msg,
                progress: 100,
                type: result.success ? 'success' : 'danger'
            });

            let timeoutId = setTimeout(() => {
                note.close();
            }, 3000);

            note.$ele.css('cursor', 'pointer');
            note.$ele.find('button.close').on('click', function () {
                clearTimeout(timeoutId);
                note.close();
            });

            note.$ele.find('span').on('click', function () {
                if (self._results.length > 0) {
                    self.showResultDialog(result.__id);
                }

                clearTimeout(timeoutId);
                note.close();
            });
        });
    };

    ICoreRunServerPlugin.prototype.showResultDialog = function (resultId) {
        const dialog = new PluginResultsDialog();
        dialog.show(this._controller._client, this._results, resultId);
    };

    return ICoreRunServerPlugin;
});